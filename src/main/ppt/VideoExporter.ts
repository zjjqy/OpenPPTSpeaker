/**
 * 视频导出：把"页面图 + 聚光遮罩 + 逐句字幕 + TTS 音频"离线合成为 MP4。
 * 流程：
 *   1. 确保全部讲解句已 TTS 合成（复用 SpeechCache 磁盘缓存）
 *   2. 逐句用隐藏 Chromium 窗口合成帧 PNG（与现场画面一致）
 *   3. 拼接 PCM 音频
 *   4. ffmpeg（ffmpeg-static）合成 MP4
 */

import { app } from 'electron'
import { execFile } from 'child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'
import { pptLibrary } from './PptLibrary'
import { loadLibrarySlideDeck } from '../tour/deckLoader'
import { SpeechCache } from '../tour/SpeechCache'
import { hiddenRenderer } from './HiddenRenderer'
import { DEFAULT_SUBTITLE_STYLE } from '@shared/ppt'
import { t } from '@shared/i18n'

const VIDEO_W = 1920
const VIDEO_H = 1080

/** ffmpeg-static 在 asar 中无法直接执行，需替换到 unpacked 目录 */
function resolveFfmpeg(): string {
  let p = ffmpegPath as unknown as string
  if (app.isPackaged && p.includes('app.asar')) {
    p = p.replace('app.asar', 'app.asar.unpacked')
  }
  return p
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const i = dataUrl.indexOf('base64,')
  return Buffer.from(dataUrl.slice(i + 7), 'base64')
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(resolveFfmpeg(), args, { maxBuffer: 16 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(t('video.ffmpegFailed', { msg: stderr?.slice(-500) || err.message })))
      else resolve()
    })
  })
}

export interface ExportVideoOptions {
  onProgress?: (done: number, total: number, message?: string) => void
}

/**
 * 导出讲解视频。返回输出文件路径。
 * 要求：已有演讲稿（v2）；音频缺失的句子会现场合成（受 TTS 引擎可用性影响）。
 */
export async function exportVideo(deckId: string, outPath: string, opts: ExportVideoOptions = {}): Promise<string> {
  const meta = pptLibrary.get(deckId)
  if (!meta) throw new Error(t('ppt.deckNotFound', { id: deckId }))
  if (meta.source === 'builtin') throw new Error(t('ppt.builtinNoExport'))
  const script = pptLibrary.readScript(deckId)
  if (!script) throw new Error(t('video.needScript'))
  if (!script.slides.some((s) => s.speech.length > 0)) throw new Error(t('video.emptyScript'))
  // 字幕样式：整份讲稿统一（缺省用默认），导出视频与讲演字幕保持一致
  const subStyle = script.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE

  const deck = loadLibrarySlideDeck(deckId)
  const cache = new SpeechCache()
  const tmpDir = join(app.getPath('temp'), `hs-video-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    // ---------- 1. 确保音频 ----------
    const spoken = deck.sections.filter((s) => s.speech && s.speech.length > 0)
    let step = 0
    for (const section of spoken) {
      await cache.ensure(section)
      step++
      opts.onProgress?.(step, spoken.length, t('video.progressAudio', { done: step, total: spoken.length }))
    }

    // 收集逐句素材
    interface Sent {
      slideNo: number
      text: string
      spotlight: { x: number; y: number; w: number; h: number } | null
      pcm: Buffer
      durationMs: number
      sampleRate: number
    }
    const sents: Sent[] = []
    for (const section of spoken) {
      const audio = cache.get(section)
      if (!audio) continue
      audio.sentences.forEach((s, i) => {
        sents.push({
          slideNo: section.slide ?? 1,
          text: s.text,
          spotlight: section.speech?.[i]?.spotlight ?? null,
          pcm: s.pcm,
          durationMs: s.durationMs,
          sampleRate: s.sampleRate
        })
      })
    }
    if (sents.length === 0) throw new Error(t('video.noAudio'))
    const sampleRate = sents[0].sampleRate

    // ---------- 2. 逐句合成帧 ----------
    const slideDataUrls = new Map<number, string>()
    const listLines: string[] = []
    const audioChunks: Buffer[] = []
    for (let i = 0; i < sents.length; i++) {
      const s = sents[i]
      let imgUrl = slideDataUrls.get(s.slideNo)
      if (!imgUrl) {
        imgUrl = `data:image/png;base64,${readFileSync(pptLibrary.slideImagePath(deckId, s.slideNo)).toString('base64')}`
        slideDataUrls.set(s.slideNo, imgUrl)
      }
      const frame = await hiddenRenderer.eval<string>(
        'video-render',
        `window.__renderFrame(${JSON.stringify(imgUrl)}, ${JSON.stringify(s.spotlight)}, ${JSON.stringify(s.text)}, ${VIDEO_W}, ${VIDEO_H}, ${JSON.stringify(subStyle)})`
      )
      const frameFile = join(tmpDir, `f${String(i).padStart(5, '0')}.png`)
      writeFileSync(frameFile, dataUrlToBuffer(frame))
      listLines.push(`file '${frameFile.replace(/\\/g, '/')}'`, `duration ${(s.durationMs / 1000).toFixed(3)}`)
      audioChunks.push(s.pcm)
      opts.onProgress?.(i + 1, sents.length, t('video.progressFrame', { done: i + 1, total: sents.length }))
    }
    // concat demuxer 要求最后一帧重复一次（否则末帧时长被忽略）
    listLines.push(`file '${join(tmpDir, `f${String(sents.length - 1).padStart(5, '0')}.png`).replace(/\\/g, '/')}'`)
    const listFile = join(tmpDir, 'list.txt')
    writeFileSync(listFile, listLines.join('\n'))
    const pcmFile = join(tmpDir, 'all.pcm')
    writeFileSync(pcmFile, Buffer.concat(audioChunks))

    // ---------- 3. ffmpeg 合成 ----------
    opts.onProgress?.(0, 1, t('video.progressEncode'))
    await runFfmpeg([
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', pcmFile,
      '-vf', `fps=30,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      outPath
    ])
    opts.onProgress?.(1, 1, t('video.progressDone'))
    return outPath
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
