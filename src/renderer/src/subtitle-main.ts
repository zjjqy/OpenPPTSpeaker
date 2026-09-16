/** 字幕窗口入口（轻量，不引入 Vue 框架） */
import './styles/base.css'
import { DEFAULT_SUBTITLE_STYLE, type SubtitleStyle } from '@shared/ppt'
import { subtitleShellStyle, subtitleTextStyle, subtitleProgressStyle } from './subtitle-style'

const el = document.getElementById('subtitle-app')!

let subtitleText = ''
let currentRole: 'assistant' | 'user' = 'assistant'
let progress = { index: 0, total: 0 }
/** 当前字幕样式：讲稿里配置，讲演开始时由主进程下发；未下发时用默认样式 */
let style: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE }

/** 以屏幕高度作为画布基准（与 1080 高画面同比例），保证与编辑预览观感一致 */
function canvasH(): number {
  return window.screen.height || 1080
}

function applyStyle(): void {
  const shell = el.querySelector('.subtitle-shell') as HTMLElement | null
  const text = el.querySelector('.subtitle-text') as HTMLElement | null
  const prog = el.querySelector('.subtitle-progress') as HTMLElement | null
  if (!shell || !text) return

  const ch = canvasH()
  const shellCss = subtitleShellStyle(style, ch)
  // 字幕窗口是独立窗口（非画面内元素），百分比会相对窗口而非屏幕 → 换算成 px
  const screenW = window.screen.width || 1920
  const bottomPx = Math.round((ch * style.bottomPct) / 100)
  const widthPx = Math.round(Math.min((screenW * style.maxWidthPct) / 100, window.innerWidth))
  shellCss.bottom = `${bottomPx}px`
  shellCss.width = `${widthPx}px`

  Object.assign(shell.style, shellCss)
  Object.assign(text.style, subtitleTextStyle(style, ch))
  if (prog) Object.assign(prog.style, subtitleProgressStyle(style))
  // 用户话语仍用蓝色区分（行内样式优先级高于 base.css 的 .is-user 规则，需在此覆盖）
  if (currentRole === 'user') text.style.color = '#2563eb'

  // 内容高度自适应：字号/行高可调，固定窗口高度会裁剪
  requestAnimationFrame(() => {
    const s = el.querySelector('.subtitle-shell') as HTMLElement | null
    if (!s) return
    window.ops.subtitle.fit(s.offsetHeight + bottomPx + 12)
  })
}

const render = (): void => {
  // 没有字幕文本时整个内容清空：启用背景板时不会残留一个空黑框横在屏幕底部；
  // 同时请求主进程把窗口收缩到最小，视觉上完全消失
  if (!subtitleText) {
    el.innerHTML = ''
    window.ops.subtitle.fit(90)
    return
  }
  el.innerHTML = `
    <div class="subtitle-shell ${currentRole === 'user' ? 'is-user' : ''}">
      <div class="subtitle-text">${escapeHtml(subtitleText)}</div>
      ${style.showProgress ? `<div class="subtitle-progress">${progress.index > 0 ? `${progress.index} / ${progress.total}` : ''}</div>` : ''}
    </div>
  `
  applyStyle()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

window.ops.tour.onData((ev) => {
  if (ev.kind === 'subtitle') {
    subtitleText = ev.text ?? ''
    currentRole = ev.role ?? 'assistant'
  } else if (ev.kind === 'chat' && ev.role === 'assistant') {
    subtitleText = ev.text ?? ''
    currentRole = 'assistant'
  } else if (ev.kind === 'progress') {
    progress = { index: ev.index ?? 0, total: ev.total ?? 0 }
  } else if (ev.kind === 'subtitle-style' && ev.style) {
    style = ev.style
  }
  render()
})

window.ops.tour.onStateChanged((ev) => {
  if (ev.state === 'idle' || ev.state === 'ended') {
    subtitleText = ''
    render()
  }
})

render()
