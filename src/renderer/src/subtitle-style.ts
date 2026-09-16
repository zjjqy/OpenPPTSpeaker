/**
 * 字幕样式换算工具（讲稿编辑预览 / AI 讲演字幕窗口共用）。
 * 所有长度参数以「1080 高的画面」为基准，按传入的画布高度等比缩放，
 * 保证同一份配置在编辑预览与讲演字幕上呈现一致的视觉比例。
 */
import type { SubtitleStyle } from '@shared/ppt'

/** 缩放系数：px 参数相对 1080 高画面 */
export function subScale(canvasH: number): number {
  return canvasH / 1080
}

function pxOf(k: number, v: number): string {
  return `${(v * k).toFixed(1)}px`
}

/** 容器样式：背景板、圆角、内边距、距底距离、最大宽度 */
export function subtitleShellStyle(s: SubtitleStyle, canvasH: number): Record<string, string> {
  const k = subScale(canvasH)
  const px = (v: number): string => pxOf(k, v)
  return {
    background: s.bgEnabled ? s.bgColor : 'transparent',
    borderRadius: px(s.bgRadius),
    padding: s.bgEnabled ? `${px(s.bgPaddingY)} ${px(s.bgPaddingX)}` : '0',
    bottom: `${s.bottomPct}%`,
    width: `${s.maxWidthPct}%`
  }
}

/** 文字样式：字体、字号、字重、行高、颜色、描边、投影 */
export function subtitleTextStyle(s: SubtitleStyle, canvasH: number): Record<string, string> {
  const k = subScale(canvasH)
  const px = (v: number): string => pxOf(k, v)
  const fs = canvasH * (s.fontSizePct / 100)
  const shadows: string[] = []
  if (s.strokeEnabled) {
    // 8 方向描边形成完整轮廓
    const dirs: ReadonlyArray<readonly [number, number]> = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ]
    for (const [dx, dy] of dirs) {
      shadows.push(`${px(dx * s.strokeWidth)} ${px(dy * s.strokeWidth)} 0 ${s.strokeColor}`)
    }
  }
  if (s.shadowEnabled) {
    shadows.push(`${px(s.shadowOffsetX)} ${px(s.shadowOffsetY)} ${px(s.shadowBlur)} ${s.shadowColor}`)
  }
  return {
    fontFamily: s.fontFamily,
    fontSize: `${fs.toFixed(1)}px`,
    fontWeight: String(s.fontWeight),
    lineHeight: String(s.lineHeight),
    color: s.color,
    textShadow: shadows.length > 0 ? shadows.join(', ') : 'none'
  }
}

/** 句序进度行（第 N / M 句）样式：位于字幕下方、右对齐（右下角），尺寸相对字号 */
export function subtitleProgressStyle(s: SubtitleStyle): Record<string, string> {
  return {
    fontSize: '0.35em',
    textAlign: 'right',
    marginTop: '0.18em',
    color: s.bgEnabled ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.65)',
    letterSpacing: '0.03em',
    textShadow: s.bgEnabled ? 'none' : '0 0 3px #fff, 0 0 6px #fff'
  }
}
