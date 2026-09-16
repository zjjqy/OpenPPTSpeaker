/** 讲解词音频预合成与缓存：讲解开始前一次性合成，缓存到磁盘，可重复使用 */

import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { getTtsEngine, TTS_MODEL } from '../speech/TtsEngine'
import { configStore } from '../config/ConfigStore'
import { resourcesRoot } from '../paths'
import type { TourSection } from '@shared/tour'

export interface CachedSentence {
  /** 该句讲解文本 */
  text: string
  /** PCM 16bit 单声道音频 */
  pcm: Buffer
  sampleRate: number
  /** 该句音频时长（ms），用于字幕精确同步 */
  durationMs: number
}

export interface CachedSectionAudio {
  title: string
  sentences: CachedSentence[]
}

/** 预合成结果：供开讲前判断是否需要提示用户重试 */
export interface PreloadReport {
  /** 本次新合成的页数 */
  synthesized: number
  /** 合成失败的页码（PPT 模式为 slide，网页模式为处理序号） */
  failedPages: number[]
}

interface DiskEntry {
  title: string
  sentences: Array<{ text: string; file: string; sampleRate: number; durationMs: number }>
}

interface DiskIndex {
  [sectionKey: string]: DiskEntry
}

/** 演讲稿 speech 文本 → 稳定缓存 key（文本变化即失效重合成） */
function sectionKey(section: TourSection): string {
  const texts = (section.speech ?? []).map((s) => (typeof s === 'string' ? s : s.text)).join('\u0001')
  // 混入 TTS 签名（模型+引擎+音色+发音标注）：换 TTS 模型/音色/多音字标注后旧缓存自动失效，
  // 否则会继续命中旧模型时代合成的音频（如 cosyvoice-v2 的缓存）
  const cfg = configStore.getAll()
  const ttsSig = `${TTS_MODEL}|${cfg.ttsEngine}|${cfg.ttsVoice}|${cfg.sambertVoice}|${cfg.edgeVoice}|${JSON.stringify(
    cfg.ttsPronunciations ?? []
  )}`
  return createHash('sha1').update(ttsSig).update('\u0000').update(texts).digest('hex').slice(0, 16)
}

export class SpeechCache {
  private dir: string
  private memory = new Map<string, CachedSectionAudio>()
  private index: DiskIndex = {}
  /** 正在合成的页 key → 完成信号，避免 ensure 与后台 preload 并发重复合成 */
  private inFlight = new Map<string, Promise<void>>()

  constructor() {
    // 开发模式：项目内 data/tts-cache（可写，直接复用）。
    // 打包模式：userData/tts-cache（可写、升级后保留）——安装目录/app.asar 只读，不能写缓存；
    //           首次运行从安装包 extraResources 的 tts-cache-seed 复制预合成缓存，直接复用。
    this.dir = app.isPackaged
      ? join(app.getPath('userData'), 'tts-cache')
      : join(app.getAppPath(), 'data', 'tts-cache')
    if (app.isPackaged) this.seedFromPackage()
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    const indexFile = join(this.dir, 'index.json')
    if (existsSync(indexFile)) {
      try {
        this.index = JSON.parse(readFileSync(indexFile, 'utf-8'))
      } catch {
        this.index = {}
      }
    }
  }

  /** 首次运行（打包版）：把安装包自带的预合成缓存复制到 userData（TTS 签名匹配即可直接复用，无需重新合成） */
  private seedFromPackage(): void {
    const seed = join(resourcesRoot(), 'tts-cache-seed')
    if (existsSync(this.dir) || !existsSync(seed)) return
    try {
      mkdirSync(this.dir, { recursive: true })
      let copied = 0
      for (const f of readdirSync(seed)) {
        copyFileSync(join(seed, f), join(this.dir, f))
        copied++
      }
      console.log(`[语音缓存] 已从安装包复制预合成缓存（${copied} 个文件）`)
    } catch (e) {
      console.error('[语音缓存] 种子缓存复制失败（将现场合成）:', (e as Error).message)
    }
  }

  private keyFor(section: TourSection): string | null {
    if (!section.speech || section.speech.length === 0) return null
    return sectionKey(section)
  }

  /** 该页讲解词音频是否已可用（内存或磁盘缓存命中） */
  has(section: TourSection): boolean {
    const key = this.keyFor(section)
    if (!key) return false
    if (this.memory.has(key)) return true
    const disk = this.index[key]
    return !!disk && disk.sentences.length === (section.speech?.length ?? 0)
  }

  /** 取该页音频（内存优先，未命中则从磁盘加载） */
  get(section: TourSection): CachedSectionAudio | undefined {
    const key = this.keyFor(section)
    if (!key) return undefined
    if (this.memory.has(key)) return this.memory.get(key)
    const disk = this.index[key]
    if (!disk) return undefined
    const loaded: CachedSectionAudio = {
      title: disk.title,
      sentences: disk.sentences.map((s) => {
        const file = join(this.dir, s.file)
        const pcm = existsSync(file) ? readFileSync(file) : Buffer.alloc(0)
        return { text: s.text, pcm, sampleRate: s.sampleRate, durationMs: s.durationMs }
      })
    }
    this.memory.set(key, loaded)
    return loaded
  }

  /** 确保某一页音频已合成（缓存命中立即返回；否则现场合成）。讲解播放前调用。 */
  async ensure(section: TourSection): Promise<CachedSectionAudio | undefined> {
    const key = this.keyFor(section)
    if (!key) return undefined
    if (this.has(section)) return this.get(section)
    // 若后台 preload 正在合成该页，则等待而非重复合成
    const existing = this.inFlight.get(key)
    if (existing) {
      await existing
      const done = this.get(section)
      if (done && done.sentences.length > 0) return done
    }
    // 网络型 TTS（如 Edge）偶发 WebSocket 建立失败：失败后重试一次再放弃，
    // 避免一次抖动就让该页静音降级
    for (let attempt = 0; attempt < 2; attempt++) {
      const task = this.synthesizeSection(section, key).then(() => this.persist())
      this.inFlight.set(key, task.catch(() => undefined))
      await task
      this.inFlight.delete(key)
      const got = this.get(section)
      if (got && got.sentences.length > 0) return got
      if (attempt === 0) {
        console.log('[语音缓存] 合成未成功，1 秒后重试一次…')
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
    return this.get(section)
  }

  /**
   * 预合成所有含 speech 的页，缓存到磁盘（已命中的页跳过，不重复合成）。
   * 每页 speech 逐句合成，记录每句时长用于字幕同步。
   * onProgress：每处理完一页回调（含缓存命中页），供 UI 显示"准备音频 x/y"；
   * shouldAbort：返回 true 时提前终止（如用户已取消讲解）。
   */
  async preload(
    sections: TourSection[],
    onProgress?: (done: number, total: number) => void,
    shouldAbort?: () => boolean
  ): Promise<PreloadReport> {
    let synthesized = 0
    let processed = 0
    const failedPages: number[] = []
    for (const section of sections) {
      if (shouldAbort?.()) break
      const key = this.keyFor(section)
      if (!key) continue
      processed++
      // 已缓存或正在合成 → 跳过（重试调用时会自动只补缺的页）
      if (this.has(section) || this.inFlight.has(key)) {
        onProgress?.(processed, sections.length)
        continue
      }
      let ok = false
      try {
        await this.ensure(section)
        ok = this.has(section)
        if (ok) {
          synthesized++
          console.log(`[语音缓存] 已预合成: 第 ${section.slide} 页 ${section.title}（${(section.speech ?? []).length} 句）`)
        }
      } catch (e) {
        console.error(`[语音缓存] 第 ${section.slide} 页合成失败:`, (e as Error).message)
      }
      if (!ok) {
        // 合成失败（异常或产出为空）→ 记录页码，交由调用方决定是否重试
        failedPages.push(section.slide ?? processed)
        console.warn(`[语音缓存] 第 ${section.slide} 页无可用音频（合成失败）`)
      }
      onProgress?.(processed, sections.length)
    }
    return { synthesized, failedPages }
  }

  private async synthesizeSection(section: TourSection, key: string): Promise<void> {
    const engine = getTtsEngine()
    const sentences = section.speech ?? []
    const entry: DiskEntry = { title: section.title, sentences: [] }
    const memSentences: CachedSentence[] = []
    const writtenFiles: string[] = []
    for (let i = 0; i < sentences.length; i++) {
      // 提取到局部变量再收窄：直接对 sentences[i] 三元判断时 TS 不保留索引访问的 narrowing
      const item = sentences[i] as string | { text: string }
      const text = typeof item === 'string' ? item : item.text
      const chunks: Buffer[] = []
      let sampleRate = 24000
      let durationMs = 0
      for await (const chunk of engine.synthesize(text)) {
        chunks.push(chunk.audio)
        sampleRate = chunk.sampleRate || sampleRate
        durationMs += (chunk.audio.length / 2 / (chunk.sampleRate || sampleRate)) * 1000
      }
      const pcm = Buffer.concat(chunks)
      if (pcm.length === 0) {
        // 任一句合成失败 → 整页不缓存（跳过会造成缓存句与 speech 句索引错位，
        // 字幕/高亮/打断恢复全部对不上）。调用方回退 LLM 实时讲解；
        // has() 句数校验不通过，下次开讲会自动重试合成。
        console.warn(`[语音缓存] 第 ${section.slide} 页第 ${i + 1} 句合成产出为空，本页不缓存（回退 LLM 讲解）`)
        for (const f of writtenFiles) {
          try {
            unlinkSync(join(this.dir, f))
          } catch {
            /* ignore */
          }
        }
        this.memory.delete(key)
        delete this.index[key]
        return
      }
      const file = `${key}_${i}.pcm`
      writeFileSync(join(this.dir, file), pcm)
      writtenFiles.push(file)
      entry.sentences.push({ text, file, sampleRate, durationMs: Math.round(durationMs) })
      memSentences.push({ text, pcm, sampleRate, durationMs: Math.round(durationMs) })
    }
    this.index[key] = entry
    this.memory.set(key, { title: section.title, sentences: memSentences })
  }

  private persist(): void {
    writeFileSync(join(this.dir, 'index.json'), JSON.stringify(this.index, null, 2), 'utf-8')
  }

  /** 清空全部缓存（含磁盘） */
  clear(): void {
    for (const file of readdirSync(this.dir)) {
      if (file === 'index.json') continue
      try {
        unlinkSync(join(this.dir, file))
      } catch {
        /* ignore */
      }
    }
    this.index = {}
    this.memory.clear()
    this.persist()
  }
}
