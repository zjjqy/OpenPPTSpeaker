/** 语音会话编排：ASR 流式识别 + TTS 流式播放 + 智能打断 */

import { AsrClient } from './AsrClient'
import { getTtsEngine, abortCurrentTts } from './TtsEngine'
import { decideInterrupt } from './InterruptPolicy'
import { configStore } from '../config/ConfigStore'
import { windowManager } from '../windows/WindowManager'
import { IPC } from '@shared/ipc'
import { pinyin } from 'pinyin-pro'
import type { SpeechEvent, TtsControlMessage } from '@shared/speech'

type Listener = (ev: SpeechEvent) => void

/** 逐字转无声调拼音，非中文（标点/英文/数字）保留原字符，保证索引与原文本对齐 */
function toPinyinArray(text: string): string[] {
  const out: string[] = []
  for (const ch of text) {
    if (/[\u4e00-\u9fa5]/.test(ch)) {
      out.push(pinyin(ch, { toneType: 'none' }))
    } else {
      out.push(ch)
    }
  }
  return out
}

/** 拼音连续子序列匹配：textPy 中是否连续出现 wakePy（中间夹标点/别的字则不算连续） */
function pinyinSequenceMatch(textPy: string[], wakePy: string[]): boolean {
  if (wakePy.length === 0 || textPy.length < wakePy.length) return false
  for (let i = 0; i + wakePy.length <= textPy.length; i++) {
    let ok = true
    for (let j = 0; j < wakePy.length; j++) {
      if (textPy[i + j] !== wakePy[j]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/**
 * 唤醒词匹配（宽松）：
 *  1. 精确包含（wakeWords 字面）
 *  2. 拼音命中：覆盖所有同音/近音字（祝助诸逐铸嘱主→zhu；融荣容戎绒榕→rong）
 *  3. 短句双核心字（更宽松的兜底）
 */
function isWakeMatch(text: string): boolean {
  const wakeWords = configStore.get('wakeWords')
  // 1. 精确包含
  if (wakeWords.some((w) => text.includes(w))) return true
  // 2. 拼音命中（含同音变体，如 助融/诸戎/逐容）
  const textPy = toPinyinArray(text)
  for (const w of wakeWords) {
    const wp = toPinyinArray(w).filter((s) => /^[a-z]+$/.test(s))
    if (wp.length > 0 && pinyinSequenceMatch(textPy, wp)) return true
  }
  // 3. 短句内同时出现「祝/助/铸/嘱/主/诸」与「融/荣/容/绒/榕/永」也视为唤醒
  if (text.length <= 6) {
    const zhu = ['祝', '助', '铸', '嘱', '主', '诸']
    const rong = ['融', '荣', '容', '绒', '榕', '永']
    if (zhu.some((c) => text.includes(c)) && rong.some((c) => text.includes(c))) return true
  }
  return false
}

/** 拼音定位并删除同音变体唤醒词（如"助融""诸戎"），返回剥离后的文本 */
function stripWakeByPinyin(text: string): string {
  let result = text
  for (const w of configStore.get('wakeWords')) {
    const wp = toPinyinArray(w).filter((s) => /^[a-z]+$/.test(s))
    if (wp.length === 0) continue
    const chars = Array.from(result)
    const tp = toPinyinArray(result)
    for (let i = 0; i + wp.length <= tp.length; i++) {
      let ok = true
      for (let j = 0; j < wp.length; j++) {
        if (tp[i + j] !== wp[j]) {
          ok = false
          break
        }
      }
      if (ok) {
        chars.splice(i, wp.length)
        result = chars.join('')
        break
      }
    }
  }
  return result
}

/** 剥离唤醒词与常见呼唤前后缀，提取唤醒句中的真实问题（支持同音变体剥离） */
function stripWakePrefix(text: string): string {
  let t = text
  for (const w of configStore.get('wakeWords')) {
    t = t.split(w).join('')
  }
  // 同音变体（助融/诸戎/逐容…）也剥掉
  t = stripWakeByPinyin(t)
  t = t.replace(/^(你好|您好|麻烦|请|帮我|帮|喂|小祝)[,，。.\s]*/, '')
  return t.trim()
}

export interface SpeakOptions {
  /** 播放中是否允许被打断（讲解播报传 true） */
  interruptible?: boolean
  onStart?: () => void
  onEnd?: () => void
}

export class SpeechSession {
  private asr = new AsrClient()
  private listeners: Listener[] = []

  /** 唤醒监听模式 */
  private wakeMode = true
  /** 打断防抖时间戳（防止扬声器回音误触发连续打断） */
  private lastInterruptAt = 0
  /** 当前是否有声音在播 */
  private speaking = false
  /** 当前是否在播放预合成音频（全部帧一次性入队，"让当前句播完"策略对其无效，须立即打断） */
  private precomputedPlaying = false
  /** 播报代际序号：每次开始新播报自增，用于拦截打断/翻页后的在途异步回调 */
  private playbackSeq = 0
  /** 当前生效的播报代际；-1 表示当前无有效播报（回调应被丢弃） */
  private activeSeq = -1
  /**
   * 当前播报段号：每开一段播报（speak / playPrecomputed）自增并随 play 控制下发，
   * audioWorker 的所有上报都带回它，用于丢弃上一段迟到的进度/完成/句首信号。
   */
  private curPlaySeq = 0
  /** 当前 TTS 句子已合成时长（ms） */
  private spokenMs = 0
  /** 当前 TTS 已发送时长（ms） */
  private sentMs = 0
  /** 是否已启动 */
  private started = false
  /** 本次唤醒是否已触发（防重复触发/处理唤醒句遗留问题） */
  private wakePending = false
  /** 当前正在播放的讲解词全文（用于过滤"讲解声被 ASR 转写"造成的回声误打断） */
  private currentSpeechText = ''
  /** 是否处于对话/暂停处理中：此时不响应新的 ASR 转写打断，避免反复打断 LLM 回答 */
  private inConversation = false
  /**
   * 手机桥接是否在线：手机在线时 ASR 只收用户主动"按住说话"的音频，
   * 一定是用户真实话语，不需要回声过滤（直接打断），避免误杀真实提问。
   */
  private phoneActive = false
  /** 最近一次用户话语上抛时间：松开按钮的宽限窗口据此判断"本次按住是否说了话" */
  private lastUtteranceAt = 0
  /** 松开按钮后的"继续"宽限定时器：等 ASR final，超时无话语才通知上层继续讲解 */
  private releaseGraceTimer: NodeJS.Timeout | null = null
  /** 松开按钮后补送静音帧的定时器 */
  private silenceFlushTimer: NodeJS.Timeout | null = null

  /** 设置手机桥接在线状态（手机连接/断开时由 PhoneBridgeServer 调用） */
  setPhoneActive(active: boolean): void {
    this.phoneActive = active
  }

  private onInterrupted: (() => void) | null = null

  // 供外部（手机桥接等）订阅的钩子
  private asrReadyCbs: Array<() => void> = []
  private ttsFrameCbs: Array<(pcm: Buffer, sampleRate: number, seq: number) => void> = []
  private ttsControlCbs: Array<(msg: TtsControlMessage) => void> = []

  constructor() {
    this.asr.setHandler((ev) => {
      // ASR 就绪：通知 audioWorker 与手机桥接补发缓冲（唤醒词等早期语音补听）
      if (ev.type === 'started') {
        const aw = windowManager.audioWorker
        if (aw && !aw.isDestroyed()) {
          aw.webContents.send(IPC.Speech.AsrStarted)
        }
        for (const cb of this.asrReadyCbs) cb()
      }
      // 语音监听日志：打印 ASR 上报的每个事件（识别中/完成/开始/停止/错误）
      if (ev.type === 'partial' || ev.type === 'final') {
        console.log(`[语音监听] ${ev.type === 'partial' ? '识别中' : '识别完成'}: "${ev.text}"`)
      } else if (ev.type === 'started') {
        console.log('[语音监听] ASR 连接已建立')
      } else if (ev.type === 'stopped') {
        console.log('[语音监听] ASR 已停止')
      } else if (ev.type === 'error') {
        console.error('[语音监听] ASR 错误:', ev.message)
      }
      if (ev.type === 'partial') {
        // 识别中即时唤醒：不等整句结束，尽早响应
        if (this.wakeMode && !this.wakePending && isWakeMatch(ev.text)) {
          this.wakePending = true
          console.log(`[语音监听] 🎯 唤醒命中（识别中）: "${ev.text}"`)
          this.emit({ type: 'wakeup', text: ev.text })
          this.onWakeup?.(ev.text)
        }
      } else if (ev.type === 'final') {
        if (this.wakePending && !this.wakeMode) {
          // 唤醒后同一句话的最终结果：剥离唤醒词后作为问题上抛
          const rest = stripWakePrefix(ev.text)
          this.wakePending = false
          if (rest) {
            console.log(`[语音监听] 唤醒句附带问题: "${rest}"`)
            this.emitUserUtterance(rest)
          }
        } else {
          this.handleFinalText(ev.text)
        }
      }
      this.emit(ev)
    })
  }

  // ==================== 订阅 ====================
  on(listener: Listener): void {
    this.listeners.push(listener)
  }

  setInterruptHandler(fn: () => void): void {
    this.onInterrupted = fn
  }

  /** 订阅 ASR 就绪（用于补发缓冲音频，如手机桥接） */
  onAsrReady(cb: () => void): void {
    this.asrReadyCbs.push(cb)
  }

  /** 订阅 TTS 音频帧（用于手机桥接转发播放） */
  onTtsFrame(cb: (pcm: Buffer, sampleRate: number, seq: number) => void): void {
    this.ttsFrameCbs.push(cb)
  }

  /** 订阅 TTS 播放控制（用于手机桥接同步播放状态） */
  onTtsControl(cb: (msg: TtsControlMessage) => void): void {
    this.ttsControlCbs.push(cb)
  }

  private emit(ev: SpeechEvent): void {
    for (const l of this.listeners) l(ev)
  }

  // ==================== 生命周期 ====================
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.emit({ type: 'mic-status', status: 'on' })
  }

  async stop(): Promise<void> {
    this.started = false
    this.asr.stop()
    this.clearReleaseGrace()
    this.clearSilenceFlush()
    this.abortSpeaking()
    this.emit({ type: 'mic-status', status: 'off' })
  }

  get isWakeMode(): boolean {
    return this.wakeMode
  }

  /** 切换唤醒模式（讲解开始时关闭唤醒、开启交互） */
  setWakeMode(mode: boolean): void {
    this.wakeMode = mode
    if (!mode) {
      // 进入交互模式：不再常开 ASR（避免持续调用语音识别接口烧 token）。
      // 识别仅在"按住说话"时按需启动（见 beginListen/endListen）。
      this.wakePending = false
    } else {
      // 重新进入唤醒模式：允许下一次唤醒触发
      this.wakePending = false
    }
  }

  // ==================== ASR 管理 ====================
  private async ensureAsr(): Promise<void> {
    if (this.asr.isRunning) return
    try {
      await this.asr.start()
    } catch (e) {
      this.emit({ type: 'error', message: (e as Error).message })
    }
  }

  /** audioWorker 上行：PCM 帧 */
  onAudioFrame(buffer: Buffer): void {
    if (this.asr.isRunning) {
      this.asr.sendAudio(buffer)
    }
  }

  /** audioWorker / 手机桥接 上行：采集事件（VAD/能量）。source 标识音频来源（电脑麦克风 / 手机） */
  onAudioEvent(ev: { type: string; db?: number }, source: 'pc' | 'phone' = 'pc'): void {
    if (ev.type === 'vad-activity') {
      // 手机在线时，电脑麦克风的 VAD 不再启动 ASR：
      // 此时 ASR 只应接收手机"按住说话"的音频（register.ts 已丢弃 PC 音频帧），
      // 若 PC 的 VAD（听到扬声器讲解声）启动 ASR，只会空烧连接且引入回声转写风险。
      if (this.phoneActive && source === 'pc') return
      // 人声活动 → 确保 ASR 在转写（为"转写确认打断"提供输入）。
      // 注意：VAD 只负责启动识别，不再直接打断讲解——打断与否由 ASR 转写文本确认（OpenMAIC 模式），
      // 从而避免扬声器回声/环境音在 VAD 层面误触发"好端端就暂停"。
      if (!this.asr.isRunning) {
        void this.ensureAsr()
      }
      this.emit({ type: 'vad-activity' } as SpeechEvent)
    } else if (ev.type === 'vad-idle') {
      this.emit({ type: 'vad-idle' } as SpeechEvent)
    } else if (ev.type === 'level' && ev.db !== undefined) {
      this.emit({ type: 'level', db: ev.db })
    }
  }

  // ==================== 打断（Barge-in） ====================
  private stopAppendingFrames(): void {
    abortCurrentTts()
    // 通知播放器停止接收新帧（保留缓冲自然播完）
    this.sendControl({ action: 'pause' })
  }

  private abortSpeaking(): void {
    this.speaking = false
    this.precomputedPlaying = false
    // 立即失效当前播报代际，阻断在途的进度/句开始回调（防止打断后幽灵字幕/跳句）
    this.activeSeq = -1
    abortCurrentTts()
    this.sendControl({ action: 'interrupt' })
    // 关键：立即结算"等待整段播完"的挂起等待（playPrecomputed 的 waitForPlaybackDone）。
    // 打断后 audioWorker 不再上报进度（activeSeq=-1 被丢弃）也不上报播放完成，
    // 若不在此结算，等待方只能挂到超时（60s）——表现为"打断后 AI 卡住不继续"。
    this.onPlaybackEnded()
    this.emit({ type: 'tts-end' })
  }

  // ==================== TTS 播报 ====================
  /** 合成并播放一段讲解/回答文本（流式，可打断；返回时音频已实际播完或被打断） */
  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!text) return
    // 开启新播报代际
    this.playbackSeq++
    const gen = this.playbackSeq
    this.activeSeq = gen
    this.speaking = true
    this.spokenMs = 0
    this.sentMs = 0
    this.currentSpeechText = text
    opts.onStart?.()
    this.emit({ type: 'tts-start' })
    console.log(`[语音回复] 开始播报: ${text.length > 40 ? text.slice(0, 40) + '…' : text}`)

    const engine = getTtsEngine()
    const t0 = Date.now()
    let seq = 0

    try {
      // 开新段：段号随 play 下发，用于隔离上一段迟到的上报
      this.sendControl({ action: 'play', seq: ++this.curPlaySeq })
      for await (const chunk of engine.synthesize(text)) {
        if (!this.speaking || this.activeSeq !== gen) break // 已被打断/代际失效
        const win = windowManager.audioWorker
        if (win && !win.isDestroyed()) {
          // payload 用 Uint8Array 视图（不含头部字节）：
          // ArrayBuffer 跨 IPC + contextBridge 两次克隆在部分环境会丢失，Uint8Array 最稳
          const raw = chunk.audio
          const pcm = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
          if (seq === 0) console.log('[Speech] 向 audioWorker 发送首帧, sampleRate =', chunk.sampleRate, ', bytes =', pcm.byteLength)
          win.webContents.send(IPC.Speech.TtsFrame, {
            buffer: pcm,
            sampleRate: chunk.sampleRate,
            seq: seq++
          })
        } else if (seq === 0) {
          console.warn('[Speech] audioWorker 不可用，无法发送 TTS 帧')
        }
        // 同步转发给手机桥接等订阅方
        for (const cb of this.ttsFrameCbs) cb(chunk.audio, chunk.sampleRate, seq)
        const chunkMs = (chunk.audio.length / 2 / chunk.sampleRate) * 1000
        this.sentMs += chunkMs
        this.spokenMs = Date.now() - t0
      }
      // 先通知播放器"本段帧已发完"（置 appendEndedByPause，让"整段播完"信号可触发），
      // 再等待实际播完——顺序与 playPrecomputed 一致；若先等再 pause，
      // playbackEnded 永不产生，只能干等超时（表现为"说完卡很久"）。
      this.sendControl({ action: 'pause' })
      // 等待本段音频真正播放完成（与 playPrecomputed 一致）。
      // 关键：若不等，下一段播报（如讲解第 1 页）会立刻重置 playedMs，
      // 本段残余帧的时长被误计入下一段进度 → "播完判定"提前满足 → 提前翻页。
      if (seq > 0 && this.speaking && this.activeSeq === gen) {
        await this.waitForPlaybackDone(gen, this.sentMs)
      }
    } catch (e) {
      console.error('[Speech] TTS 失败:', e)
      this.emit({ type: 'error', message: (e as Error).message })
    } finally {
      // 通知播放器：本段结束，播完缓冲后回调
      this.sendControl({ action: 'pause' })
      this.speaking = false
      // 本段播报结束 → 代际失效，后续在途回调被丢弃
      this.activeSeq = -1
      opts.onEnd?.()
      this.emit({ type: 'tts-end' })
      // 记录整段音频总时长（供字幕按播放进度同步）
      this._lastTotalMs = this.sentMs
    }
  }

  /**
   * 播放预合成的音频（讲解词已提前合成并缓存，无需实时合成）。
   * 整段连续播放，播放进度通过 onPlaybackProgress 上报，供字幕精确同步。
   */
  async playPrecomputed(
    sentences: Array<{ pcm: Buffer; sampleRate: number; durationMs: number; text?: string }>,
    opts: SpeakOptions = {},
    startIndex = 0
  ): Promise<void> {
    if (!sentences || sentences.length === 0) return
    const start = Math.max(0, Math.min(startIndex, sentences.length - 1))
    // 开启新播报代际：此代际内的进度/句开始回调视为有效，结束后自动失效
    this.playbackSeq++
    const gen = this.playbackSeq
    this.activeSeq = gen
    this.speaking = true
    this.precomputedPlaying = true
    this.spokenMs = 0
    // 从打断句恢复时，sentMs 初始化为已跳过句子的累计时长（保证播放进度/字幕边界正确）
    this.sentMs = start > 0 ? sentences.slice(0, start).reduce((acc, s) => acc + (s.durationMs || 0), 0) : 0
    // 记录"最近播放窗口"的讲解词（由下方循环逐句更新），供 echo 过滤使用
    this.currentSpeechText = ''
    opts.onStart?.()
    this.emit({ type: 'tts-start' })
    console.log(`[语音回复] 播放预合成音频: ${sentences.length} 句`)

    const win = windowManager.audioWorker
    if (!win || win.isDestroyed()) {
      this.speaking = false
      this.precomputedPlaying = false
      this.activeSeq = -1
      return
    }
    try {
      // 开新段：段号随 play 下发，用于隔离上一段迟到的上报
      this.sendControl({ action: 'play', seq: ++this.curPlaySeq })
      let seq = 0
      let playbackMs = 0 // 本次实际要播放的时长（从 start 开始），不含已跳过的句子
      let lastTwo = '' // 最近 2 句拼接，用于 echo 过滤（避免整页拼接导致误判）
      for (let i = start; i < sentences.length; i++) {
        const s = sentences[i]
        // 被打断或代际失效（打断/翻页使 activeSeq 变化）→ 停止发送
        if (!this.speaking || this.activeSeq !== gen) break
        // 更新"最近播放窗口"为当前句（窗口 = 当前句 + 前一句，跨句 echo 也能覆盖）
        lastTwo = (lastTwo + (s.text ?? '')).slice(-120)
        this.currentSpeechText = lastTwo
        const raw = s.pcm
        const pcm = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
        win.webContents.send(IPC.Speech.TtsFrame, {
          buffer: pcm,
          sampleRate: s.sampleRate,
          seq: seq++,
          sentenceIndex: i
        })
        for (const cb of this.ttsFrameCbs) cb(raw, s.sampleRate, seq)
        this.sentMs += s.durationMs
        this.spokenMs = this.sentMs
        playbackMs += s.durationMs
      }
      // 所有帧已发送 → 明确告知 audioWorker 不再追加，让"整段播完"信号可靠触发（避免恢复播报时卡等）
      this.sendControl({ action: 'pause' })
      // 等待本段音频真正播放完成（避免"没播完就翻页"导致瞬间翻完所有页）；
      // 总时长用"本次实际播放时长"（从打断句起），否则恢复播报时进度永远达不到总量而卡死
      await this.waitForPlaybackDone(gen, playbackMs)
    } finally {
      this.sendControl({ action: 'pause' })
      this.speaking = false
      this.precomputedPlaying = false
      // 本段播报结束 → 该代际失效，后续在途回调被丢弃
      this.activeSeq = -1
      opts.onEnd?.()
      this.emit({ type: 'tts-end' })
      this._lastTotalMs = this.sentMs
    }
  }

  /** 返回最近一次播报段的音频总时长（ms），供字幕按播放进度同步 */
  get lastTotalMs(): number {
    return this._lastTotalMs
  }
  private _lastTotalMs = 0
  /** 订阅 audioWorker 播放进度（playedMs=已播时长；sentMs=主进程实时已合成时长，供估算段总时长） */
  onPlaybackProgress(cb: (playedMs: number, sentMs: number) => void): void {
    this.playbackProgressCbs.push(cb)
  }
  private playbackProgressCbs: Array<(playedMs: number, sentMs: number) => void> = []

  /** 整段播放完成的等待者（audioWorker 明确上报播放完成时触发） */
  private playbackEndWaiters: Array<() => void> = []

  /**
   * 等待本段预合成音频真正播放完成（audioWorker 明确上报完成 / 播放进度达总时长 / 被打断 / 超时兜底）。
   * 用于让翻页在"当前页播完"之后进行，避免瞬间翻完所有页。
   */
  private waitForPlaybackDone(gen: number, totalMs: number, timeoutMs = Math.max(60000, totalMs + 15000)): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const startedAt = Date.now()
      let lastPlayed = 0
      const finish = (reason: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const i = this.playbackProgressCbs.indexOf(cb)
        if (i >= 0) this.playbackProgressCbs.splice(i, 1)
        const w = this.playbackEndWaiters.indexOf(onEnd)
        if (w >= 0) this.playbackEndWaiters.splice(w, 1)
        // 诊断：若"实际耗时"远小于 totalMs，说明进度被上一段残帧污染（画面会超前于语音）
        console.log(
          `[Speech] 播完判定结束(${reason}): played=${Math.round(lastPlayed)}/${Math.round(totalMs)}ms, 实际耗时=${
            Date.now() - startedAt
          }ms`
        )
        resolve()
      }
      const cb = (playedMs: number): void => {
        lastPlayed = playedMs
        // 代际失效（被打断）或播放完成（接近总时长）→ 结束等待
        if (this.activeSeq !== gen) finish('代际失效/被打断')
        else if (!this.speaking) finish('已停止播报')
        else if (playedMs >= totalMs - 50) finish('进度达标')
      }
      const onEnd = (): void => finish('播放器播完')
      const timer = setTimeout(() => finish('超时兜底'), timeoutMs)
      this.playbackProgressCbs.push(cb)
      this.playbackEndWaiters.push(onEnd)
      // 注册后立即检查：代际已失效（已被打断/停止）或不再播报 → 立即结束等待。
      // 否则若 audioWorker 此刻恰好无缓冲帧在播（打断发生在句间间隙），不会上报进度，
      // cb 永不触发，waitForPlaybackDone 会一直等到超时，导致"松开按钮不继续讲解"。
      if (this.activeSeq !== gen) finish('代际失效/被打断')
      else if (!this.speaking) finish('已停止播报')
    })
  }

  /** audioWorker 明确上报整段播放完成 */
  /**
   * 只接受"当前播报段"的上报。
   * audioWorker 播完一段时会连发"进度上报"+"播放完成"两条消息：主进程收到前者即判定播完并
   * 进入下一段注册新的等待者，随后送达的后者会误结算新一段（表现为画面/字幕超前整整一页）。
   * 故每段下发段号、上报时带回，不匹配的一律丢弃。
   */
  private isCurrentSegment(seq?: number): boolean {
    if (seq === undefined) return true // 旧版 audioWorker 未带段号 → 兼容放行
    return seq === this.curPlaySeq
  }

  onPlaybackEnded(seq?: number): void {
    if (!this.isCurrentSegment(seq)) return
    while (this.playbackEndWaiters.length) {
      this.playbackEndWaiters.shift()!()
    }
  }

  /** audioWorker 上报播放进度 */
  onPlaybackProgressReport(playedMs: number, seq?: number): void {
    if (!this.isCurrentSegment(seq)) return
    // 无有效播报（已结束/被打断）→ 丢弃在途回调
    if (this.activeSeq === -1) return
    for (const cb of this.playbackProgressCbs) cb(playedMs, this.sentMs)
  }
  /** 订阅某句音频开始播放（预合成逐句字幕同步） */
  onSentenceStart(cb: (index: number) => void): void {
    this.sentenceStartCbs.push(cb)
  }
  private sentenceStartCbs: Array<(index: number) => void> = []
  /** audioWorker 上报某句开始播放 */
  onSentenceStartReport(index: number, seq?: number): void {
    if (!this.isCurrentSegment(seq)) return
    // 无有效播报（已结束/被打断）→ 丢弃在途回调，防止幽灵字幕
    if (this.activeSeq === -1) return
    for (const cb of this.sentenceStartCbs) cb(index)
  }

  /** 主动打断当前播报（用户指令等场景） */
  interrupt(): void {
    this.abortSpeaking()
  }

  /**
   * 手机"按住说话"按钮触发：按下（active=true）立即打断当前讲解，进入暂停等待用户发言。
   * 这是明确的用户人为信号，不依赖 ASR 转写/回声判断，精准可靠。
   */
  bargeInFromButton(active: boolean): void {
    if (!active) {
      // 唤醒模式（空闲态）下无需通知上层"继续讲解"
      if (this.wakeMode) return
      // 松开按钮 → 不立即视为"继续"：先补送静音推动 ASR 产出本次话语的 final，
      // 并开启宽限窗口——窗口内识别到话语则走问答，确认没说话才通知上层继续讲解。
      // （否则 final 晚于"继续"信号到达，用户的问题会被丢弃并污染下一次等待）
      this.flushAsrSilence()
      const releaseAt = Date.now()
      this.clearReleaseGrace()
      this.releaseGraceTimer = setTimeout(() => {
        this.releaseGraceTimer = null
        // 宽限窗口内已有话语上抛 → 由问答流程处理，不再触发"继续"
        if (this.lastUtteranceAt >= releaseAt) return
        for (const cb of this.bargeInReleaseCbs) cb()
      }, 2200)
      return
    }
    // 按下按钮 → 取消挂起的"继续"与静音补送（用户又要说话，避免静音插入新话语造成误切句）
    this.clearReleaseGrace()
    this.clearSilenceFlush()
    // 按下即明确要说话：立即启动 ASR（不等 VAD，避免轻声/短句音量不足导致漏启动、漏听输入）
    void this.ensureAsr()
    if (this.wakeMode) return
    if (this.speaking) {
      console.log('[语音监听] 手机按钮按下 → 打断讲解，等待您说话')
      this.abortSpeaking()
      this.emit({ type: 'interrupt' })
    }
    // 无论是否正在播报都通知上层：播放间隙/回答间隙按下也要进入倾听流程，避免话语被静默吞掉
    this.onInterrupted?.()
  }

  private clearReleaseGrace(): void {
    if (this.releaseGraceTimer) {
      clearTimeout(this.releaseGraceTimer)
      this.releaseGraceTimer = null
    }
  }

  private clearSilenceFlush(): void {
    if (this.silenceFlushTimer) {
      clearInterval(this.silenceFlushTimer)
      this.silenceFlushTimer = null
    }
  }

  /**
   * 松开按钮后向 ASR 补送 ~1.2s 静音帧（按实时节奏）。
   * paraformer 依靠后续静音做句尾判定：松开后音频流戛然而止，最后一句话可能永远不出 final。
   */
  private flushAsrSilence(): void {
    this.clearSilenceFlush()
    if (!this.asr.isRunning) return
    const frame = Buffer.alloc(3200) // 100ms @16kHz/16bit
    let sent = 0
    this.silenceFlushTimer = setInterval(() => {
      sent++
      if (!this.asr.isRunning || sent > 12) {
        this.clearSilenceFlush()
        return
      }
      this.asr.sendAudio(frame)
    }, 100)
  }

  /** 订阅"用户松开按钮"（用于取消打断后的静默等待，继续讲解） */
  onBargeInRelease(cb: () => void): void {
    this.bargeInReleaseCbs.push(cb)
  }
  private bargeInReleaseCbs: Array<() => void> = []

  /**
   * 设置是否处于"对话/暂停处理中"。
   * 进入对话处理（如 handleInterruptPause）时设为 true，期间不响应新的 ASR 打断，
   * 避免用户后续话语反复打断 LLM 回答；处理结束（resuming/继续）时设为 false。
   */
  setInConversation(active: boolean): void {
    this.inConversation = active
  }

  // ==================== 唤醒词与意图 ====================
  private async handleFinalText(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return

    if (this.wakeMode) {
      // 唤醒模式：宽松匹配唤醒词
      if (isWakeMatch(trimmed)) {
        this.wakePending = true
        console.log(`[语音监听] 🎯 唤醒命中: "${trimmed}"`)
        this.emit({ type: 'wakeup', text: trimmed })
        this.onWakeup?.(trimmed)
      }
      // 非唤醒内容，静默丢弃
    } else {
      // 交互模式
      // 对话/暂停处理中（如 handleInterruptPause 内）：
      if (this.inConversation) {
        // 先过滤"刚被打断的讲解声残留"（按下打断瞬间麦克风拾取的讲解回声），
        // 避免它污染 waitForUserInput，导致"还没听用户说话就提示继续"。
        // 手机在线时音频只来自"按住说话"（按住才收音且带回声消除，不可能是回声），
        // 跳过过滤，避免把引用讲解词的真实提问误杀。
        if (!this.phoneActive && this.isLikelyEcho(trimmed)) return
        if (this.phoneActive) {
          // 手机在线：用户"按住说话"主动发声，接收话语（提问/指令都能回答）
          this.emitUserUtterance(trimmed)
        } else if (/继续|接着|好的|好|嗯|是的|是|可以|讲吧|来吧/.test(trimmed)) {
          // 手机离线（电脑麦克风）：只响应"继续"类确认，避免回答播报回声污染 pendingUserText
          this.emitUserUtterance(trimmed)
        }
        return
      }
      // 讲解播放中收到 ASR 转写的非空文本 = 用户真实说话 → 触发"转写确认打断"
      //（OpenMAIC 模式：用转写文本确认打断，而非 VAD 能量，避免回声/环境音误触发）
      // 讲解声回声（麦克风拾取的扬声器声音被转写）→ 忽略，既不打断也不上抛。
      // 注意：手机在线时用户是"按住说话"主动发声，一定是真话，跳过回声过滤以免误杀提问。
      if (this.speaking && !this.phoneActive && this.isLikelyEcho(trimmed)) {
        return
      }
      if (this.speaking && configStore.get('enableBargeIn')) {
        this.evaluateBargeInFromAsr(trimmed)
      }
      // 文本作为问题/指令上抛
      this.emitUserUtterance(trimmed)
    }
  }

  /** 上抛用户话语：记录时间戳（供松开宽限窗口判断"本次是否说了话"）并取消挂起的"继续"信号 */
  private emitUserUtterance(text: string): void {
    this.lastUtteranceAt = Date.now()
    this.clearReleaseGrace()
    this.emit({ type: 'final', text })
    this.onUserUtterance?.(text)
  }

  /** ASR 转写确认打断：用户说了一句非空的话 → 停讲解并进入暂停，等待用户发言 */
  private evaluateBargeInFromAsr(text: string): void {
    if (!configStore.get('enableBargeIn')) return
    // 处于对话/暂停处理中：不响应新打断，避免用户后续话语反复打断 LLM 回答
    if (this.inConversation) return
    // 保护：音频尚未实际输出（不足 1200ms）时不打断——讲解开场误判
    if (this.sentMs < 1200) return
    // 讲解回声过滤：讲解播放时麦克风会拾取扬声器声音，ASR 会把它转写出来。
    // 若转写文本与当前讲解词高度重叠，判定为回声而非真实打断，忽略。
    // 手机在线时用户是"按住说话"主动发声，跳过回声过滤以免误杀。
    if (!this.phoneActive && this.isLikelyEcho(text)) return
    // 防抖：打断后 1200ms 内忽略（防止同一句语音的连续转写重复触发）
    const now = Date.now()
    if (now - this.lastInterruptAt < 1200) return
    this.lastInterruptAt = now

    console.log(`[语音监听] 转写确认打断: "${text}"`)
    // 预合成播放时全部音频帧已一次性入队，"让当前句自然播完"会变成"让整页播完"，必须立即停
    const decision = this.precomputedPlaying ? 'immediate' : decideInterrupt(this.spokenMs, this.sentMs)
    if (decision === 'immediate') {
      // 急切打断：立即停
      this.abortSpeaking()
    } else {
      // 温和停：让当前句自然播完
      this.stopAppendingFrames()
    }
    this.emit({ type: 'interrupt' })
    this.onInterrupted?.()
  }

  /**
   * 判断 ASR 转写文本是否可能是"当前讲解声的回声"。
   * 讲解播放时麦克风会拾取扬声器声音，ASR 会把它转成与讲解词高度重叠的文本；
   * 真实用户提问通常不会与讲解词高度重叠。用字符重叠比例判断。
   */
  private isLikelyEcho(text: string): boolean {
    const speech = this.currentSpeechText.replace(/\s/g, '')
    const t = text.replace(/\s/g, '')
    if (!speech || t.length < 3) return false
    // 完全包含（转写文本是讲解词的一部分）→ 回声
    if (speech.includes(t)) return true
    // 字符重叠比例：统计 t 中每个字符在 speech 中出现的比例。
    // 阈值取 0.85：只有几乎每个字都出现在讲解词里才算回声，避免把真实提问（含引用词）误杀。
    let hit = 0
    for (const ch of t) {
      if (speech.includes(ch)) hit++
    }
    return hit / t.length >= 0.85
  }

  /** 唤醒成功回调（由 TourEngine/主流程设置） */
  onWakeup: ((text: string) => void) | null = null
  /** 交互模式用户话语回调（问题/指令） */
  onUserUtterance: ((text: string) => void) | null = null

  // ==================== 播放器通信 ====================
  private sendControl(msg: TtsControlMessage): void {
    const win = windowManager.audioWorker
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.Speech.TtsControl, msg)
    }
    for (const cb of this.ttsControlCbs) cb(msg)
  }
}

export const speechSession = new SpeechSession()
