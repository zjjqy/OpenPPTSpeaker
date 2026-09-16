/**
 * PPT 导入：PDF（pdf.js 渲染为页面图 + 提取文本层）或图片组 → PPT 库条目。
 * 导入产物：slides/NNN.png + index.html（可控演示页）+ page-texts.json（PDF 时）。
 */

import { readFileSync, readdirSync } from 'fs'
import { basename, extname } from 'path'
import { pptLibrary } from './PptLibrary'
import { generateDeckHtml } from './DeckHtmlGen'
import { hiddenRenderer } from './HiddenRenderer'
import type { PptDeckMeta } from '@shared/ppt'
import { t } from '@shared/i18n'

/** 页面图输出宽度（px），16:9 时高度 1080，满足 1080p 视频导出 */
const RENDER_WIDTH = 1920

export interface ImportResult {
  deck: PptDeckMeta
  slideCount: number
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const i = dataUrl.indexOf('base64,')
  return Buffer.from(dataUrl.slice(i + 7), 'base64')
}

/** 导入 PDF：逐页渲染为 PNG + 提取文本层 */
export async function importPdf(
  filePath: string,
  name: string,
  onProgress?: (done: number, total: number) => void
): Promise<ImportResult> {
  const meta = pptLibrary.create(name || basename(filePath, extname(filePath)), 'pdf')
  try {
    const bytes = readFileSync(filePath)
    const b64 = bytes.toString('base64')
    // 载入 PDF（base64 经 atob 还原为字节），返回页数
    const pageCount = await hiddenRenderer.eval<number>(
      'pdf-render',
      `window.__pdfLoad(Uint8Array.from(atob("${b64}"), c => c.charCodeAt(0)))`
    )
    const texts: string[] = []
    for (let i = 1; i <= pageCount; i++) {
      const dataUrl = await hiddenRenderer.eval<string>(
        'pdf-render',
        `window.__pdfRenderPage(${i}, ${RENDER_WIDTH})`
      )
      pptLibrary.writeSlideImage(meta.id, i, dataUrlToBuffer(dataUrl))
      const text = await hiddenRenderer.eval<string>('pdf-render', `window.__pdfPageText(${i})`)
      texts.push((text ?? '').replace(/\s+/g, ' ').trim())
      onProgress?.(i, pageCount)
    }
    pptLibrary.writePageTexts(meta.id, texts)
    finalizeHtml(meta)
    return { deck: pptLibrary.get(meta.id)!, slideCount: pageCount }
  } catch (e) {
    // 失败清理半成品
    pptLibrary.delete(meta.id)
    throw e
  }
}

/** 导入图片组（jpg/png 等，按文件名排序） */
export async function importImages(
  filePaths: string[],
  name: string,
  onProgress?: (done: number, total: number) => void
): Promise<ImportResult> {
  const meta = pptLibrary.create(name || t('ppt.imageDeck'), 'images')
  try {
    const sorted = [...filePaths].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    pptLibrary.importImages(meta.id, sorted)
    sorted.forEach((_f, i) => onProgress?.(i + 1, sorted.length))
    finalizeHtml(meta)
    return { deck: pptLibrary.get(meta.id)!, slideCount: sorted.length }
  } catch (e) {
    pptLibrary.delete(meta.id)
    throw e
  }
}

/** 按 slides/ 下实际图片生成可控 index.html */
function finalizeHtml(meta: PptDeckMeta): void {
  const files = readdirSync(pptLibrary.slidesDir(meta.id))
    .filter((f) => /\.png$/i.test(f))
    .sort()
  pptLibrary.writeHtml(meta.id, generateDeckHtml(meta.name, files))
  pptLibrary.touch(meta.id)
}
