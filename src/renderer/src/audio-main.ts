/**
 * 音频工作进程（隐藏窗口）
 * 职责：1) 麦克风采集 PCM(16k/16bit) 上行  2) VAD 人声检测
 *       3) 接收 TTS 音频帧并播放（可中断）
 * AI 逻辑不在此处，全部在主进程。
 */

import './styles/base.css'

const TARGET_SAMPLE_RATE = 16000

// ==================== TTS 播放器 ====================
class TtsPlayer {
  private ctx: AudioContext | null = null
  private queue: Array<{ ab: AudioBuffer; sentenceIndex: number; frameSeq: number }> = []
  private current: AudioBufferSourceNode | null = null
  private currentSentenceIndex = -1
  private appending = true
  private playing = false
  /** 标记"追加结束"是由 pause() 主动发起的（正常播完流程）；interrupt 触发的结束不带此标记，不上报播放完成 */
  private appendEndedByPause = false
  /** 用户主动暂停（手机按住说话按下）：冻结 AudioContext 输出，heartbeat 不得拉起 */
  private suspendedByUser = false
  private draining = false
  private heartbeat: number | null = null
  private playedFrames = 0
  /** 累计已播放时长（ms），用于字幕按播放进度同步 */
  private playedMs = 0
  /** 进度上报节流时间戳 */
  private lastProgressAt = 0
  /** 串行链：保证 TTS 帧按到达顺序入队 */
  private chain: Promise<void> = Promise.resolve()
  /**
   * 播放会话号：每次 play() 自增。
   * 上一段"播完判定"通过后其最后几帧可能仍在播（判定留 50ms 余量），
   * 这些残帧的 onended 若继续计入 playedMs / 上报句首 / 上报播放完成，
   * 会污染新一段的进度 → 新段提前判定播完 → 画面字幕逐页超前于语音。
   * 故帧在入队时记住所属会话号，回调里只处理"当前会话"的帧。
   */
  private playSeq = 0

  /** 创建 AudioContext 并强制恢复运行（隐藏窗口可能被 Chromium 挂起） */
  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) {
      const ctx = new AudioContext()
      this.ctx = ctx
      this.startHeartbeat()
      try {
        await ctx.resume()
      } catch (e) {
        console.error('[audio] AudioContext resume 异常:', e)
      }
      console.log('[audio] AudioContext 创建完成, state =', ctx.state, ', sampleRate =', ctx.sampleRate)
    }
    return this.ctx
  }

  /** 尽力把 AudioContext 恢复到 running（suspended 时输出静音且 onended 不触发） */
  private async ensureRunning(): Promise<void> {
    const ctx = this.ctx
    if (!ctx || ctx.state === 'running') return
    console.warn('[audio] AudioContext 被挂起 (suspended)，尝试恢复…')
    for (let i = 0; i < 5; i++) {
      try {
        await ctx.resume()
      } catch {
        /* ignore */
      }
      // 断言为完整类型：TS 会把 53 行 early-return 的收窄传播到此处，导致误判 'running' 无交集
      if ((ctx.state as AudioContextState) === 'running') return
      await new Promise((r) => setTimeout(r, 120))
    }
    console.error('[audio] AudioContext 恢复失败，本次播报可能无声')
  }

  /** 保活：隐藏窗口里 AudioContext 可能被周期性挂起，定时拉起（用户主动暂停时除外） */
  private startHeartbeat(): void {
    if (this.heartbeat !== null) return
    this.heartbeat = window.setInterval(() => {
      if (this.ctx && this.ctx.state === 'suspended' && !this.suspendedByUser) {
        void this.ctx.resume().catch(() => {})
      }
    }, 500)
  }

  /** 用户主动暂停播放（手机"按住说话"按下）：冻结 AudioContext 输出，从暂停处可原样继续 */
  suspend(): void {
    this.suspendedByUser = true
    const ctx = this.ctx
    if (ctx && ctx.state === 'running') {
      void ctx.suspend().catch((e) => console.error('[audio] 暂停失败:', e))
    }
  }

  /** 恢复播放（手机松开）：从暂停处继续 */
  resume(): void {
    this.suspendedByUser = false
    const ctx = this.ctx
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch((e) => console.error('[audio] 恢复失败:', e))
    }
    this.appending = true
  }

  play(seq?: number): void {
    // 开启新的播放会话：会话号取主进程下发的播报段号（缺省自增兜底）。
    // 上一段尚未播完的帧归为旧会话，其回调不再计入本段。
    this.playSeq = seq ?? this.playSeq + 1
    this.appending = true
    this.appendEndedByPause = false
    this.playedMs = 0
    this.lastProgressAt = 0
    this.drain()
  }

  push(buffer: Uint8Array | ArrayBuffer, sampleRate: number, sentenceIndex = -1): void {
    if (!this.appending) return
    this.chain = this.chain
      .then(async () => {
        const ctx = await this.ensureCtx()
        await this.ensureRunning()
        const ab = this.toAudioBuffer(ctx, buffer, sampleRate || 24000)
        if (!ab) return
        this.queue.push({ ab, sentenceIndex, frameSeq: this.playSeq })
        this.drain()
      })
      .catch((e) => console.error('[audio] TTS 帧处理失败:', e))
  }

  /** 暂停追加新帧（让已缓冲自然播完） */
  pause(): void {
    this.appending = false
    this.appendEndedByPause = true
  }

  /** 累计播放进度并节流上报主进程（字幕据此同步） */
  private reportProgress(durationMs: number): void {
    this.playedMs += durationMs
    const now = Date.now()
    if (now - this.lastProgressAt < 120) return
    this.lastProgressAt = now
    window.ops.speech.sendPlaybackProgress(Math.round(this.playedMs), this.playSeq)
  }

  /** 立即打断 */
  interrupt(): void {
    this.appending = false
    // 打断不算"正常追加结束"，清掉 pause 标记，避免被打断的 stop 触发的延迟 onended
    // 把"播放完成"信号误报给后续恢复播报，导致恢复时立即结束（"只说一句就停"）
    this.appendEndedByPause = false
    this.queue = []
    const cur = this.current
    this.current = null
    this.currentSentenceIndex = -1
    this.playing = false
    if (cur) {
      try {
        // 解绑 onended 再 stop：被打断帧的延迟 onended 会把整帧时长计入 playedMs
        // （幽灵进度）。这笔旧账在下一段 play() 归零后到达，会让主进程
        // "playedMs >= 总时长" 的播完判定瞬间满足 → 音频还没讲完就提前翻页。
        cur.onended = null
        cur.stop()
      } catch {
        /* ignore */
      }
    }
  }

  private toAudioBuffer(ctx: AudioContext, pcm: Uint8Array | ArrayBuffer, sampleRate: number): AudioBuffer | null {
    try {
      // 兼容 Uint8Array 视图（可能有 byteOffset）与裸 ArrayBuffer 两种 IPC 形态
      let int16: Int16Array
      if (pcm instanceof Uint8Array) {
        if (pcm.byteLength < 2 || pcm.byteLength % 2 !== 0) {
          console.warn('[audio] PCM 帧长度异常:', pcm.byteLength)
          return null
        }
        int16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 1)
      } else if (pcm instanceof ArrayBuffer) {
        if (pcm.byteLength < 2 || pcm.byteLength % 2 !== 0) {
          console.warn('[audio] PCM 帧长度异常:', pcm.byteLength)
          return null
        }
        int16 = new Int16Array(pcm)
      } else {
        console.error('[audio] 未知的 PCM 数据类型:', Object.prototype.toString.call(pcm))
        return null
      }
      if (int16.length === 0) return null
      const float = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float[i] = int16[i] / 32768
      }
      const ab = ctx.createBuffer(1, float.length, sampleRate)
      ab.copyToChannel(float, 0)
      return ab
    } catch (e) {
      console.error('[audio] PCM 转换失败:', e)
      return null
    }
  }

  /** 顺序取出缓冲播放；播放失败自动续播下一帧 */
  private drain(): void {
    if (this.draining) return
    this.draining = true
    void (async () => {
      try {
        while (!this.playing && this.queue.length > 0) {
          const ctx = await this.ensureCtx()
          await this.ensureRunning()
          if (this.playing || this.queue.length === 0) break
          const { ab, sentenceIndex, frameSeq } = this.queue.shift()!
          // 该帧是否属于"当前播放会话"：上一段判定播完后仍在响的残帧属于旧会话
          const stale = frameSeq !== this.playSeq
          const src = ctx.createBufferSource()
          src.buffer = ab
          src.connect(ctx.destination)
          this.current = src
          this.playing = true
          this.playedFrames++
          src.onended = () => {
            this.playing = false
            if (this.current === src) this.current = null
            // 只处理"当前播放会话"的帧：上一段残留帧的时长/完成信号一律不计入本段，
            // 否则会把本段的播完判定提前（画面字幕超前于语音）
            if (!stale) {
              // 上报本帧已播时长（字幕按播放进度同步）
              this.reportProgress((ab.duration || 0) * 1000)
              // 整段播完（不再追加 + 缓冲已空 + 是由 pause() 主动结束的正常完成）→ 明确上报播放完成
              // 注意：interrupt() 触发的 stop 也会走到这里，但不带 appendEndedByPause 标记，不能误报"播放完成"，
              // 否则主进程恢复播报时会被这个延迟到达的"完成"信号错误地立即结束，造成"只说一句就停"
              if (!this.appending && this.queue.length === 0 && this.appendEndedByPause) {
                window.ops.speech.sendPlaybackEnd(this.playSeq)
              }
            }
            this.drain()
          }
          try {
            // 句首帧开始播放时上报"第 N 句"，主进程据此显示字幕，严格与声音同步
            if (!stale && sentenceIndex >= 0 && sentenceIndex !== this.currentSentenceIndex) {
              this.currentSentenceIndex = sentenceIndex
              window.ops.speech.sendSentenceStart(sentenceIndex, this.playSeq)
            }
            src.start()
          } catch (e) {
            console.error('[audio] 播放启动失败:', e)
            this.playing = false
            this.current = null
          }
        }
      } finally {
        this.draining = false
      }
    })()
  }
}

// ==================== 麦克风采集 + VAD ====================
class MicCapture {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private active = false
  private idleFrames = 0
  private readonly activeThreshold = 0.012
  private readonly idleLimit = 12 // 60ms * 12 = 720ms 静音判定结束
  private onPcm?: (buf: ArrayBuffer) => void

  // 环形缓冲：缓存最近 ~3 秒 PCM，ASR 就绪后补发（唤醒词等早期音频不丢失）
  private ring: ArrayBuffer[] = []
  private readonly ringMaxBytes = 16000 * 2 * 3

  setPcmHandler(fn: (buf: ArrayBuffer) => void): void {
    this.onPcm = fn
  }

  /** ASR 就绪后补发缓冲音频 */
  resendRing(): void {
    const snap = this.ring.slice()
    for (const b of snap) this.onPcm?.(b)
  }

  private pushRing(buf: ArrayBuffer): void {
    this.ring.push(buf)
    let total = 0
    for (const b of this.ring) total += b.byteLength
    while (total > this.ringMaxBytes && this.ring.length > 0) {
      total -= this.ring.shift()!.byteLength
    }
  }

  private handlePcm(buf: ArrayBuffer): void {
    this.pushRing(buf)
    this.onPcm?.(buf)
  }

  async start(): Promise<void> {
    if (this.ctx) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      })
      const ctx = new AudioContext()
      this.ctx = ctx
      const source = ctx.createMediaStreamSource(stream)

      // 分析节点（VAD）
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      this.analyser = analyser

      // 采集节点（PCM 上行）
      const workletCode = `
        class PcmProcessor extends AudioWorkletProcessor {
          constructor() { super(); this.buf = []; }
          process(inputs) {
            const input = inputs[0];
            if (input && input[0]) {
              for (let i = 0; i < input[0].length; i++) this.buf.push(input[0][i]);
              if (this.buf.length >= 1600) {
                const out = new Float32Array(this.buf);
                this.port.postMessage(out, [out.buffer]);
                this.buf = [];
              }
            }
            return true;
          }
        }
        registerProcessor('pcm-processor', PcmProcessor);
      `
      const blob = new Blob([workletCode], { type: 'application/javascript' })
      await ctx.audioWorklet.addModule(URL.createObjectURL(blob))
      const node = new AudioWorkletNode(ctx, 'pcm-processor')
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (!this.onPcm) return
        const pcm16 = this.resampleToInt16(e.data, ctx.sampleRate)
        if (pcm16.byteLength > 0) this.handlePcm(pcm16)
      }
      source.connect(node)

      // VAD 循环
      setInterval(() => this.tick(), 60)
      console.log('[audio] 麦克风已启动', ctx.sampleRate)
    } catch (e) {
      console.error('[audio] 麦克风启动失败:', e)
      window.ops.speech.sendAudioEvent({ type: 'mic-error', db: undefined })
    }
  }

  /** 降采样到 16k 并转 int16 */
  private resampleToInt16(input: Float32Array, fromRate: number): ArrayBuffer {
    const ratio = fromRate / TARGET_SAMPLE_RATE
    if (ratio <= 1) {
      const out = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) out[i] = this.clamp16(input[i])
      return out.buffer
    }
    const outLen = Math.floor(input.length / ratio)
    const out = new Int16Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio)
      const end = Math.min(Math.floor((i + 1) * ratio), input.length)
      let sum = 0
      for (let j = start; j < end; j++) sum += input[j]
      out[i] = this.clamp16(sum / (end - start || 1))
    }
    return out.buffer
  }

  private clamp16(v: number): number {
    return Math.max(-32768, Math.min(32767, Math.round(v * 32768)))
  }

  private tick(): void {
    if (!this.analyser || !this.ctx) return
    const data = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)
    const db = rms > 0 ? Math.max(-60, 20 * Math.log10(rms)) : -60

    if (rms > this.activeThreshold) {
      if (!this.active) {
        this.active = true
        this.idleFrames = 0
        window.ops.speech.sendAudioEvent({ type: 'vad-activity' })
      } else {
        this.idleFrames = 0
      }
    } else {
      if (this.active) {
        this.idleFrames++
        if (this.idleFrames >= this.idleLimit) {
          this.active = false
          window.ops.speech.sendAudioEvent({ type: 'vad-idle' })
        }
      }
    }
    window.ops.speech.sendAudioEvent({ type: 'level', db })
  }
}

// ==================== 初始化 ====================
console.log('[audio] audio-main 启动, huashun =', typeof window.ops, ', hidden =', document.hidden)

const player = new TtsPlayer()
const mic = new MicCapture()
let frameCount = 0
let controlCount = 0

// TTS 下行
window.ops.speech.onTtsFrame((frame) => {
  frameCount++
  if (frameCount <= 3 || frameCount === 10) {
    console.log('[audio] 收到 TTS 帧 #', frameCount, ', bytes =', frame.buffer.byteLength, ', sampleRate =', frame.sampleRate, ', seq =', frame.seq)
  }
  player.push(frame.buffer, frame.sampleRate, frame.sentenceIndex ?? -1)
})
window.ops.speech.onTtsControl((msg) => {
  controlCount++
  if (controlCount <= 5) console.log('[audio] 收到 TTS 控制 #', controlCount, ', action =', msg.action)
  switch (msg.action) {
    case 'play':
      player.play(msg.seq)
      break
    case 'pause':
      player.pause()
      break
    case 'resume':
      player.resume()
      break
    case 'suspend':
      player.suspend()
      break
    case 'interrupt':
      player.interrupt()
      break
  }
})

// 采集上行：持续发送 PCM 流，保证 ASR 连续性（主进程按需转发）
mic.setPcmHandler((buf) => {
  window.ops.speech.sendAudioFrame(buf, TARGET_SAMPLE_RATE)
})

// ASR 就绪：补发缓冲音频（唤醒词等早期语音不再丢失）
window.ops.speech.onAsrStarted(() => {
  mic.resendRing()
})

void mic.start()
