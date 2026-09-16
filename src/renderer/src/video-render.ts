/**
 * 视频导出帧合成工作页（隐藏窗口）。
 * 用 Canvas 把"页面图 + 聚光遮罩 + 字幕"合成为一帧 PNG，
 * 与现场播报画面一致（遮罩压暗 + 框内高亮 + 底部字幕条）。
 * 主进程通过 executeJavaScript 调用 window.__renderFrame。
 */

import { DEFAULT_SUBTITLE_STYLE, type SubtitleStyle } from '@shared/ppt'
import { t } from './i18n'

interface SpotlightRect {
  x: number // %（相对图片）
  y: number
  w: number
  h: number
}

declare global {
  interface Window {
    __renderFrame: (
      imgDataUrl: string,
      rect: SpotlightRect | null,
      subtitle: string,
      outW: number,
      outH: number,
      style?: SubtitleStyle
    ) => Promise<string>
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('video.errImageLoad')))
    img.src = src
  })
}

/**
 * 合成一帧：
 * - 页面图按比例居中（letterbox 黑边）
 * - rect 存在时：其余区域压暗 55% + 框内高亮 + 橙色描边
 * - subtitle 非空时：底部字幕条（黑底白字，自动换行）
 * 返回 PNG dataURL。
 */
window.__renderFrame = async (
  imgDataUrl: string,
  rect: SpotlightRect | null,
  subtitle: string,
  outW: number,
  outH: number,
  style?: SubtitleStyle
): Promise<string> => {
  const img = await loadImage(imgDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')!

  // 黑底 + 图片居中适配
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, outW, outH)
  const scale = Math.min(outW / img.naturalWidth, outH / img.naturalHeight)
  const dw = Math.round(img.naturalWidth * scale)
  const dh = Math.round(img.naturalHeight * scale)
  const dx = Math.round((outW - dw) / 2)
  const dy = Math.round((outH - dh) / 2)
  ctx.drawImage(img, dx, dy, dw, dh)

  // 聚光遮罩：evenodd 路径让压暗层只覆盖框外区域，框内保持原图高亮
  if (rect) {
    const rx = dx + (rect.x / 100) * dw
    const ry = dy + (rect.y / 100) * dh
    const rw = (rect.w / 100) * dw
    const rh = (rect.h / 100) * dh
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, outW, outH)
    ctx.rect(rx, ry, rw, rh)
    ctx.fill('evenodd')
    ctx.strokeStyle = 'rgba(255, 170, 60, 0.95)'
    ctx.lineWidth = Math.max(2, Math.round(outW / 640))
    ctx.strokeRect(rx, ry, rw, rh)
  }

  // 字幕：按讲稿配置的字幕样式绘制（与讲稿编辑预览、AI 讲演字幕同一套配置）
  if (subtitle) {
    const s: SubtitleStyle = style ?? { ...DEFAULT_SUBTITLE_STYLE }
    const k = outH / 1080 // px 参数相对 1080 高画面换算
    const fontSize = Math.round(outH * (s.fontSizePct / 100))
    ctx.font = `${s.fontWeight} ${fontSize}px ${s.fontFamily}`
    const maxWidth = outW * (s.maxWidthPct / 100)

    const lines: string[] = []
    let line = ''
    for (const ch of subtitle) {
      if (ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    if (line) lines.push(line)
    const show = lines.slice(0, 6) // 防止异常长文本溢出画面

    const lineH = Math.round(fontSize * s.lineHeight)
    const padX = s.bgEnabled ? Math.round(s.bgPaddingX * k) : 0
    const padY = s.bgEnabled ? Math.round(s.bgPaddingY * k) : 0
    const boxH = lineH * show.length + padY * 2
    const boxW = s.bgEnabled ? Math.min(outW, Math.round(maxWidth + padX * 2)) : 0
    const boxX = s.bgEnabled ? Math.round((outW - boxW) / 2) : 0
    const boxY = outH - boxH - Math.round(outH * (s.bottomPct / 100))

    // 背景板（圆角矩形，居中自适应宽度）
    if (s.bgEnabled) {
      ctx.fillStyle = s.bgColor
      ctx.beginPath()
      const radius = Math.min(Math.round(s.bgRadius * k), Math.round(boxH / 2))
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(boxX, boxY, boxW, boxH, radius)
      } else {
        ctx.rect(boxX, boxY, boxW, boxH)
      }
      ctx.fill()
    }

    // 文字：投影 → 描边 → 填充（先描后填，描边不压字）
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (s.shadowEnabled) {
      ctx.shadowColor = s.shadowColor
      ctx.shadowBlur = s.shadowBlur * k
      ctx.shadowOffsetX = s.shadowOffsetX * k
      ctx.shadowOffsetY = s.shadowOffsetY * k
    }
    const strokeW = s.strokeEnabled ? Math.max(1, s.strokeWidth * k * 2) : 0
    show.forEach((l, i) => {
      const y = boxY + padY + lineH * i + lineH / 2
      if (s.strokeEnabled) {
        ctx.lineWidth = strokeW
        ctx.strokeStyle = s.strokeColor
        ctx.lineJoin = 'round'
        ctx.strokeText(l, outW / 2, y)
      }
      ctx.fillStyle = s.color
      ctx.fillText(l, outW / 2, y)
    })
    // 复位，避免影响后续绘制
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.textAlign = 'left'
  }

  return canvas.toDataURL('image/png')
}

export {}
