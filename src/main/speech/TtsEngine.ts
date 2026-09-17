/** TTS 三引擎：Qwen-Audio-TTS（WebSocket 流式）+ Sambert（HTTP）+ Edge TTS（微软免费，WebSocket 流式） */

import WebSocket from 'ws'
import { randomUUID, createHash } from 'node:crypto'
import { configStore } from '../config/ConfigStore'
import type { TtsEngineKind } from '@shared/speech'
import { t } from '@shared/i18n'

export interface TtsChunk {
  /** PCM 音频字节（16bit 单声道） */
  audio: Buffer
  sampleRate: number
}

export interface TtsEngine {
  kind: TtsEngineKind
  /** 合成一段文本，返回流式音频帧（可随时终止迭代以打断） */
  synthesize(text: string): AsyncGenerator<TtsChunk>
  abort(): void
  /**
   * 预热（可选）：开讲前先建立一次连接，把 DNS 解析 / TLS 握手等冷启动开销提前消化，
   * 避免"第一页合成超时、后面页都正常"。失败不算错误，交由正式合成与重试兜底。
   */
  warmup?(): Promise<void>
}

// ==================== Qwen-Audio-TTS（WS 流式；与 CosyVoice 同协议） ====================
const COSY_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'

/** 当前流式 TTS 模型（供音频缓存签名：换模型自动失效旧缓存） */
export const TTS_MODEL = 'qwen-audio-3.0-tts-flash'

/** qwen-audio-3.0-tts-flash 的音色自带版本号（如 longanhuan_v3.6），按原样传入，仅兜底默认音色 */
const normalizeVoice = (raw: string): string => (raw ? raw : 'longanfengyue')

/**
 * 多音字发音标注：把词典中的词替换为 SSML phoneme 标注，返回可嵌入 SSML 的内容片段。
 *
 * 引擎音素字母表不同，不可混用：
 * - CosyVoice/Qwen 用 `alphabet="py"`（拼音，声调数字）
 * - Edge（微软）用 `alphabet="sapi"`（同样是拼音 + 声调数字，如 hua2 shun4）
 *
 * 返回值中的文本已做 XML 转义，可直接嵌入 `<speak>`；未发生替换时应由调用方
 * 使用原始文本（避免无谓地走 SSML 解析）。
 *
 * @param alphabet 'py'（Qwen）| 'sapi'（微软 Edge）
 */
function applyPronunciations(
  text: string,
  alphabet: 'py' | 'sapi'
): { text: string; replaced: boolean } {
  const dict = configStore.get('ttsPronunciations') ?? []
  // 先整体转义，再在转义结果上做词替换，保证插入的标签之外的内容不会被 SSML 解析
  let out = xmlEscape(text)
  let replaced = false
  for (const item of dict) {
    const word = item?.word?.trim()
    const pinyin = item?.pinyin?.trim()
    if (!word || !pinyin) continue
    // 协议要求拼音个数与字数一致，不一致的条目跳过（防错误配置导致合成失败）
    const tokens = pinyin.split(/\s+/)
    if (tokens.length !== [...word].length) continue
    // 音素格式校验：仅接受"字母(含 ü) + 可选数字声调(1~5)"，非法值会让服务端直接拒绝合成
    if (!tokens.every((t) => /^[a-zA-ZüÜ]+[1-5]?$/.test(t))) continue
    const escapedWord = xmlEscape(word)
    if (!out.includes(escapedWord)) continue
    out = out
      .split(escapedWord)
      .join(`<phoneme alphabet="${alphabet}" ph="${xmlEscape(pinyin)}">${escapedWord}</phoneme>`)
    replaced = true
  }
  return { text: out, replaced }
}

class CosyVoiceAdapter implements TtsEngine {
  readonly kind: TtsEngineKind = 'cosyvoice'
  private ws: WebSocket | null = null
  private abortFlag = false

  abort(): void {
    this.abortFlag = true
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
    this.ws = null
  }

  async *synthesize(text: string): AsyncGenerator<TtsChunk> {
    const apiKey = configStore.get('apiKey')
    if (!apiKey) throw new Error(t('tts.noApiKey'))
    this.abortFlag = false

    const voice = configStore.get('ttsVoice')
    // 多音字发音标注（在 TTS 文本层替换，字幕仍显示原文）：Qwen 用 py 音素
    const pron = applyPronunciations(text, 'py')
    const tts = pron.replaced
      ? { text: `<speak>${pron.text}</speak>`, useSsml: true }
      : { text, useSsml: false }
    const taskId = randomUUID()
    const ws = new WebSocket(COSY_WS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    this.ws = ws

    const pendingQueue: TtsChunk[] = []
    let waiters: Array<(value: IteratorResult<TtsChunk>) => void> = []
    let finished = false
    let errored: Error | null = null

    const push = (chunk: TtsChunk): void => {
      const w = waiters.shift()
      if (w) {
        w({ value: chunk, done: false })
      } else {
        pendingQueue.push(chunk)
      }
    }

    const fail = (err: Error): void => {
      errored = err
      finished = true
      while (waiters.length) {
        waiters.shift()!({ value: undefined, done: true })
      }
    }

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          // 握手阶段鉴权已在 headers 完成，随后通过 run-task 开启合成任务
          ws.send(
            JSON.stringify({
              header: {
                action: 'run-task',
                task_id: taskId,
                streaming: 'duplex'
              },
              payload: {
                model: TTS_MODEL,
                task_group: 'audio',
                task: 'tts',
                function: 'SpeechSynthesizer',
                // 协议要求 input 必须存在且为空对象 {}（不能塞 text）
                input: {},
                parameters: {
                  voice: normalizeVoice(voice),
                  format: 'pcm',
                  sample_rate: 24000,
                  // 仅在文本含发音标注（SSML phoneme）时开启，普通文本走纯文本解析
                  ...(tts.useSsml ? { enable_ssml: true } : {})
                }
              }
            })
          )
          resolve()
        })
        ws.on('error', (err) => {
          fail(new Error(t('tts.cosyvoiceConnectError', { msg: err.message })))
          reject(err)
        })
      }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error(t('tts.cosyvoiceTimeout'))), 10000)
      )
    ])

    let audioChunks = 0
    // 统一处理 JSON 事件（无论来自文本帧还是【二进制帧包装的 JSON】）
    const processJson = (msg: { header?: Record<string, string>; payload?: any }): void => {
      const header = msg.header ?? {}
      const ev = header.event || header.action
      if (ev === 'task-started') {
        // 任务启动后提交文本（continue-task），随后强制合成剩余缓存（finish-task）
        ws.send(
          JSON.stringify({
            header: { action: 'continue-task', task_id: taskId },
            payload: { input: { text: tts.text } }
          })
        )
        ws.send(
          JSON.stringify({
            header: { action: 'finish-task', task_id: taskId },
            // 协议要求 finish-task 也必须带 payload.input（空对象 {}）
            payload: { input: {} }
          })
        )
      } else if (ev === 'result-generated' || ev === 'sentence-generated') {
        // DashScope 流式音频：payload.output.audio.data 是 base64 编码的 PCM 片段
        const out = msg.payload?.output?.audio
        if (out?.data) {
          const buf = Buffer.from(String(out.data), 'base64')
          if (buf.length > 0) {
            audioChunks++
            if (audioChunks === 1) {
              console.log('[TTS] CosyVoice 开始输出音频, sampleRate =', out.sample_rate || 24000, ', bytes/frame =', buf.length)
            }
            push({ audio: buf, sampleRate: out.sample_rate || 24000 })
          }
        }
        if (msg.payload?.usage) {
          // usage 出现表示整段合成结束
          console.log('[TTS] CosyVoice 合成完成, 共', audioChunks, '帧')
          finished = true
          while (waiters.length) {
            waiters.shift()!({ value: undefined, done: true })
          }
        }
      } else if (ev === 'task-finished') {
        console.log('[TTS] CosyVoice 任务结束, 共', audioChunks, '帧')
        finished = true
        while (waiters.length) {
          waiters.shift()!({ value: undefined, done: true })
        }
      } else if (ev === 'task-failed' || header.error_code) {
        fail(
          new Error(
            t('tts.cosyvoiceSynthError', {
              code: header.error_code ?? '',
              msg: header.error_message ?? ''
            }).slice(0, 300)
          )
        )
      }
    }

    ws.on('message', (data: WebSocket.RawData) => {
      if (this.abortFlag) return
      if (Buffer.isBuffer(data)) {
        // 实测：DashScope cosyvoice-v2 会【用二进制帧发送 JSON 文本】
        // （首个消息 task-started 就是二进制 JSON，234 字节）。
        // 首字节为 '{' 时先按 JSON 解析；否则才是真正的 PCM 音频帧。
        if (data.length > 0 && data[0] === 0x7b) {
          const raw = data.toString()
          if (raw.trimStart().startsWith('{')) {
            try {
              processJson(JSON.parse(raw))
              return
            } catch {
              /* 非合法 JSON，按 PCM 处理 */
            }
          }
        }
        // 二进制帧 = PCM 音频
        push({ audio: Buffer.from(data), sampleRate: 24000 })
        audioChunks++
        if (audioChunks === 1) console.log('[TTS] CosyVoice 二进制音频首帧')
        return
      }
      try {
        processJson(JSON.parse(data.toString()))
      } catch (e) {
        console.warn('[TTS] CosyVoice 消息解析失败:', (e as Error).message)
      }
    })

    ws.on('close', () => {
      finished = true
      while (waiters.length) {
        waiters.shift()!({ value: undefined, done: true })
      }
    })

    try {
      while (!finished && !this.abortFlag) {
        if (errored) throw errored
        if (pendingQueue.length > 0) {
          yield pendingQueue.shift()!
        } else {
          // 关键修复：waiter 必须把 chunk 作为 resolve 值传回再 yield，
          // 否则 push() 唤醒 waiter 时 chunk 会被直接丢弃，生成器空转 → 永远 0 帧
          const result = await new Promise<IteratorResult<TtsChunk>>((resolve) => {
            waiters.push(resolve)
          })
          if (result.done) break
          yield result.value as TtsChunk
        }
      }
      if (errored) throw errored
    } finally {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      if (audioChunks === 0 && !errored && !this.abortFlag) {
        console.warn(
          '[TTS] CosyVoice 合成结束但未产出任何音频帧（可能 output.audio.data 解析失败或 API 返回格式变化）'
        )
      }
      this.ws = null
    }
  }
}

// ==================== Sambert（HTTP 一次性合成） ====================
const SAMBERT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/generation'

class SambertAdapter implements TtsEngine {
  readonly kind: TtsEngineKind = 'sambert'
  private aborted = false

  abort(): void {
    this.aborted = true
  }

  async *synthesize(text: string): AsyncGenerator<TtsChunk> {
    const apiKey = configStore.get('apiKey')
    if (!apiKey) throw new Error(t('tts.noApiKey'))
    this.aborted = false

    const resp = await fetch(SAMBERT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: configStore.get('sambertVoice'),
        text
      })
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(t('tts.sambertFailed', { status: resp.status, msg: errText.slice(0, 200) }))
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    // Sambert 返回 WAV，需解析出 PCM。WAV 头通常 44 字节
    const pcm = buf.slice(44)
    if (!this.aborted) {
      yield { audio: pcm, sampleRate: 16000 }
    }
  }
}

// ==================== Edge TTS（微软 Edge 大声朗读，免费免 Key） ====================
// 注意：该服务早已不再支持 raw-24khz-16bit-mono-pcm，请求 PCM 也会静默返回 MP3。
// 因此请求 audio-24khz-48kbitrate-mono-mp3，再用 mpg123-decoder（WASM）流式解码为 16bit PCM。
import { MPEGDecoder } from 'mpg123-decoder'

/** Float32 [-1,1] → Int16 PCM Buffer */
function floatToInt16Pcm(samples: Float32Array): Buffer {
  const out = Buffer.allocUnsafe(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out.writeInt16LE(Math.round(s * 32767), i * 2)
  }
  return out
}
const EDGE_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
// 微软会校验 Chromium 版本（过期版本返回 403）——跟随官方 edge-tts 仓库常量的最新值更新
// （当前对应 rany2/edge-tts master: CHROMIUM_FULL_VERSION = 143.0.3650.75）
const EDGE_VERSION = '1-143.0.3650.75'
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'

/** Sec-MS-GEC 防伪令牌：SHA-256(ticks + TrustedClientToken)。ticks = (Unix秒 + 11644473600) × 10^7 转 100ns 后向下取整到 300 秒窗口。用 BigInt 保证大数精度（double 在 1.3e17 量级会丢低位） */
function edgeSecMsGec(): string {
  const ticks = BigInt(Math.floor(Date.now() / 1000) + 11644473600) * 10000000n
  const rounded = ticks - (ticks % 3000000000n)
  return createHash('sha256').update(`${rounded}${EDGE_TOKEN}`).digest('hex').toUpperCase()
}

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Edge 单次合成的独立状态（引擎可能被并发调用：如后台预合成 + 前台实时播报，
 * 共享 this.ws/decoder 会互相释放导致对已 free 解码器 decode → 无限刷 MPG123_ERR） */
interface EdgeSynthState {
  ws: WebSocket | null
  decoder: MPEGDecoder
  decoderFreed: boolean
  done: boolean
  finish: () => void
}

class EdgeTtsAdapter implements TtsEngine {
  readonly kind: TtsEngineKind = 'edge'
  private current: EdgeSynthState | null = null
  /**
   * 本进程是否已成功建连过。
   * 首次连接要完成 DNS 解析 + TLS 握手 + 端点协商（国内网络常需十几秒），
   * 因此首次给更长的超时；之后系统已缓存 DNS/TLS 会话，短超时即可。
   */
  private connectedOnce = false

  /** 预热：用极短文本建连一次，拿到首帧即结束，只为消化冷启动开销 */
  async warmup(): Promise<void> {
    if (this.connectedOnce) return
    try {
      for await (const _chunk of this.synthesize('。')) {
        break // 首帧到手即止
      }
      this.connectedOnce = true
      console.log('[TTS] Edge 语音服务预热完成')
    } catch (e) {
      // 预热失败不阻断：正式合成时还有一次重试（SpeechCache.ensure）
      console.warn('[TTS] Edge 语音服务预热失败:', (e as Error).message)
    }
  }

  private get connectTimeoutMs(): number {
    return this.connectedOnce ? 12000 : 25000
  }

  abort(): void {
    const state = this.current
    if (!state) return
    state.done = true
    state.finish()
    try {
      state.ws?.close()
    } catch {
      /* ignore */
    }
    this.freeDecoder(state)
    if (this.current === state) this.current = null
  }

  private freeDecoder(state: EdgeSynthState): void {
    if (state.decoderFreed) return
    state.decoderFreed = true
    try {
      state.decoder.free()
    } catch {
      /* ignore */
    }
  }

  async *synthesize(text: string): AsyncGenerator<TtsChunk> {
    const decoder = new MPEGDecoder()
    await decoder.ready
    const state: EdgeSynthState = { ws: null, decoder, decoderFreed: false, done: false, finish: () => {} }
    this.current = state
    const voice = configStore.get('edgeVoice') || 'zh-CN-XiaoxiaoNeural'
    const url =
      `${EDGE_WS_URL}?TrustedClientToken=${EDGE_TOKEN}` +
      `&Sec-MS-GEC=${edgeSecMsGec()}&Sec-MS-GEC-Version=${EDGE_VERSION}` +
      `&ConnectionId=${randomUUID().replace(/-/g, '')}`
    const ws = new WebSocket(url, {
      headers: {
        // 官方 edge-tts WSS_HEADERS 完整集（缺这些头微软会 403）
        'User-Agent': EDGE_UA,
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    state.ws = ws

    const pendingQueue: TtsChunk[] = []
    let waiters: Array<(value: IteratorResult<TtsChunk>) => void> = []
    let finished = false
    let errored: Error | null = null

    const push = (chunk: TtsChunk): void => {
      const w = waiters.shift()
      if (w) w({ value: chunk, done: false })
      else pendingQueue.push(chunk)
    }
    const finishAll = (): void => {
      finished = true
      while (waiters.length) waiters.shift()!({ value: undefined, done: true })
    }
    state.finish = finishAll
    const fail = (err: Error): void => {
      errored = err
      finishAll()
    }

    // 首次建连要吃满 DNS + TLS 冷启动开销，给更长的超时；之后收紧
    const connectTimeoutMs = this.connectTimeoutMs
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          // 建连成功：后续请求可复用系统 DNS / TLS 缓存
          this.connectedOnce = true
          // 1) speech.config：该服务仅支持 MP3 输出（raw PCM 格式会被静默忽略仍返回 MP3），
          // 故请求 24kHz 单声道 MP3，收到后用 mpg123-decoder 流式解码为 PCM
          ws.send(
            'X-Timestamp:' + new Date().toISOString() + '\r\n' +
            'Content-Type:application/json; charset=utf-8\r\n' +
            'Path:speech.config\r\n\r\n' +
            JSON.stringify({
              context: {
                synthesis: {
                  audio: {
                    metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                    outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                  }
                }
              }
            })
          )
          // 2) SSML 合成请求
          // 多音字发音标注：微软音素字母表为 sapi（拼音 + 声调数字），与 Qwen 的 py 不通用
          const pron = applyPronunciations(text, 'sapi')
          const inner = pron.replaced ? pron.text : xmlEscape(text)
          const ssml =
            `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='zh-CN'>` +
            `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${inner}</prosody></voice></speak>`
          ws.send(
            'X-RequestId:' + randomUUID().replace(/-/g, '') + '\r\n' +
            'Content-Type:application/ssml+xml\r\n' +
            'X-Timestamp:' + new Date().toISOString() + '\r\n' +
            'Path:ssml\r\n\r\n' + ssml
          )
          resolve()
        })
        ws.on('error', (err) => {
          fail(new Error(t('tts.edgeConnectError', { msg: err.message })))
          reject(err)
        })
      }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(t('tts.edgeTimeout', { n: connectTimeoutMs / 1000 }))),
          connectTimeoutMs
        )
      )
    ])

    // 连接建立期间可能已被 abort（此时 finish 尚是空操作，这里兜底退出）
    if (state.done) {
      this.freeDecoder(state)
      if (this.current === state) this.current = null
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      return
    }

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (state.done || state.decoderFreed) return
      if (isBinary) {
        // Path:audio 二进制帧：2 字节大端头长 + 文本头 + MP3 载荷
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        if (buf.length < 2) return
        const headerLen = buf.readUInt16BE(0)
        const header = buf.subarray(2, 2 + headerLen).toString()
        if (header.includes('Path:audio')) {
          const mp3 = buf.subarray(2 + headerLen)
          if (mp3.length === 0) return
          // 流式解码 MP3 → Float32 → Int16 PCM（单声道）。
          // decoder.decode 内部是增量喂给 mpg123 的，数据不足时返回 0 样本（MPG123_NEED_MORE），
          // 后续帧到达时会继续产出，因此逐帧调用即可实现流式解码。
          const { channelData, samplesDecoded, sampleRate, errors } = decoder.decode(new Uint8Array(mp3))
          if (errors.length > 0) console.warn('[TTS] Edge MP3 解码告警:', errors[0]?.message)
          if (samplesDecoded > 0 && channelData[0]) {
            push({ audio: floatToInt16Pcm(channelData[0].subarray(0, samplesDecoded)), sampleRate })
          }
        }
      } else if (String(data).includes('Path:turn.end')) {
        finishAll()
      }
    })
    ws.on('close', () => {
      if (!finished) finishAll()
    })

    // finished 后仍要排空 pendingQueue（如 turn.end 时 flush 出的尾部 PCM）
    while (!finished || pendingQueue.length > 0) {
      const result = pendingQueue.length
        ? ({ value: pendingQueue.shift()!, done: false } as IteratorResult<TtsChunk>)
        : await new Promise<IteratorResult<TtsChunk>>((resolve) => waiters.push(resolve))
      if (result.done) break
      yield result.value
    }
    if (errored) throw errored
    this.freeDecoder(state)
    if (this.current === state) this.current = null
    try {
      ws.close()
    } catch {
      /* ignore */
    }
  }
}

// ==================== 引擎工厂 ====================
let currentEngine: TtsEngine | null = null

export function getTtsEngine(kind: TtsEngineKind = configStore.get('ttsEngine')): TtsEngine {
  if (currentEngine && currentEngine.kind === kind) return currentEngine
  currentEngine?.abort()
  // 兜底与默认保持一致：未知/空值走 Edge（免 Key、开箱可用）
  currentEngine =
    kind === 'cosyvoice'
      ? new CosyVoiceAdapter()
      : kind === 'sambert'
        ? new SambertAdapter()
        : new EdgeTtsAdapter()
  return currentEngine
}

export function abortCurrentTts(): void {
  currentEngine?.abort()
}
