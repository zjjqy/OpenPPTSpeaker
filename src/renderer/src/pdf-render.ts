/**
 * PDF 渲染工作页（隐藏窗口）：pdf.js 把 PDF 页渲染为 PNG dataURL，并提取文本层。
 * 主进程通过 executeJavaScript 调用 window.__pdf* 系列函数。
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { t } from './i18n'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface PdfDoc {
  numPages: number
  getPage(n: number): Promise<PdfPage>
}
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }): { promise: Promise<void> }
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>
}

let doc: PdfDoc | null = null
/** 各页尺寸（原始 pt），渲染时按比例缩放 */
const pageSizes: Array<{ w: number; h: number }> = []

declare global {
  interface Window {
    __pdfLoad: (bytes: Uint8Array) => Promise<number>
    __pdfRenderPage: (n: number, targetWidth: number) => Promise<string>
    __pdfPageText: (n: number) => Promise<string>
    __pdfPageSizes: () => Promise<Array<{ w: number; h: number }>>
  }
}

/** 载入 PDF（字节通过 IPC 预先放到 window.__pdfBytes），返回页数 */
window.__pdfLoad = async (bytes: Uint8Array): Promise<number> => {
  doc = (await pdfjsLib.getDocument({ data: bytes }).promise) as unknown as PdfDoc
  pageSizes.length = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    pageSizes.push({ w: vp.width, h: vp.height })
  }
  return doc.numPages
}

/** 渲染第 n 页（1 起）为 PNG dataURL；targetWidth 为输出像素宽（高度按比例） */
window.__pdfRenderPage = async (n: number, targetWidth: number): Promise<string> => {
  if (!doc) throw new Error(t('pdf.errNotLoaded'))
  const page = await doc.getPage(n)
  const base = pageSizes[n - 1]
  const scale = targetWidth / base.w
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return canvas.toDataURL('image/png')
}

/** 提取第 n 页文本层（无文本层的扫描页返回空串） */
window.__pdfPageText = async (n: number): Promise<string> => {
  if (!doc) throw new Error(t('pdf.errNotLoaded'))
  const page = await doc.getPage(n)
  const tc = await page.getTextContent()
  return tc.items.map((it) => it.str ?? '').join('')
}

window.__pdfPageSizes = async (): Promise<Array<{ w: number; h: number }>> => pageSizes
