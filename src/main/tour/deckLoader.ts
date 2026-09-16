/** 讲解轨迹加载器：内置演示（演讲稿.json）与 PPT 库（v2 讲稿） */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resourcesRoot } from '../paths'
import { pptLibrary } from '../ppt/PptLibrary'
import type { TourDeck, TourSection } from '@shared/tour'
import type { SubtitleStyle } from '@shared/ppt'

interface SpeechScriptData {
  meta?: Record<string, unknown>
  /** 整份讲稿统一的字幕样式（可选） */
  subtitleStyle?: SubtitleStyle
  slides?: Array<{
    slide: number
    id: string
    title: string
    /** 精简版重点讲解词（逐句短句，可带每句高亮）。存在时优先作为讲解素材 */
    speech?: Array<{
      text: string
      highlight?: string
      highlightId?: string
      spotlight?: { x: number; y: number; w: number; h: number }
    }>
    /** 重点高亮文本（兼容旧格式：该页统一高亮；新格式优先用 speech 每句的 highlight） */
    highlightText?: string
    /** 高亮定位路径（可选，优先用 highlightText 按文本高亮） */
    cssPath?: string
    modules?: Array<{
      role: string
      text?: string
      cssPath?: string
      xpath?: string
      positionHint?: string
    }>
  }>
}

/** 加载内置演示（introduceProduction/演讲稿.json + index.html） */
export function loadSlideDeck(scriptFile?: string): TourDeck {
  // 打包后从安装目录 resources/introduceProduction 读取（extraResources，可替换、免重新打包）
  const scriptPath = scriptFile
    ? resolve(scriptFile)
    : join(resourcesRoot(), 'introduceProduction', '演讲稿.json')

  if (!existsSync(scriptPath)) {
    throw new Error(`未找到讲稿文件: ${scriptPath}`)
  }

  const raw = readFileSync(scriptPath, 'utf-8').replace(/^\uFEFF/, '')
  const data = JSON.parse(raw) as SpeechScriptData
  const slides = data.slides ?? []
  if (slides.length === 0) throw new Error('演讲稿.json 中没有幻灯片数据')

  const htmlFile = join(dirname(scriptPath), 'index.html')

  const sections: TourSection[] = slides.map((s) => {
    const modules = s.modules ?? []
    const bodyModule = modules.find((m) => m.role === 'body') ?? modules[0] ?? {}
    // 优先用精简版重点讲解词（speech），突出要点、不逐条播报整页文字；
    // 缺省时才回退到逐字提取的模块文本。兼容旧格式（speech 为 string[]）。
    const rawSpeech: Array<{
      text: string
      highlight?: string
      highlightId?: string
      spotlight?: { x: number; y: number; w: number; h: number }
    }> = (s.speech ?? []).map((t) => (typeof t === 'string' ? { text: t } : t))
    const speech = rawSpeech.filter((t) => t.text?.trim())
    const content = speech.length
      ? speech.map((t) => t.text).join('\n')
      : modules
          .map((m) => (m.text ? `[${m.role}] ${m.text}` : ''))
          .filter(Boolean)
          .join('\n')
    return {
      id: `page-${s.slide}`,
      title: s.title || `第 ${s.slide} 页`,
      slide: s.slide,
      cssPath: s.cssPath,
      highlightText: s.highlightText,
      content: content || bodyModule.text,
      speech: speech.length ? speech : undefined,
      description: `第 ${s.slide} 页：${s.title}`
    }
  })

  return {
    type: 'slide',
    id: 'ppt-deck',
    title: (data.meta?.title as string | undefined) || '产品介绍',
    description: (data.meta?.description as string | undefined) ?? 'PPT 讲演',
    file: htmlFile,
    scriptFile: scriptPath,
    startSlide: 1,
    subtitleStyle: data.subtitleStyle as SubtitleStyle | undefined,
    sections
  }
}

/**
 * 加载 PPT 库中的演示（v2 演讲稿，聚光为坐标框）。
 * 无讲稿时 sections 的 speech 为空 → 讲到该页回退 LLM 实时讲解（素材=PDF 文本层）。
 */
export function loadLibrarySlideDeck(deckId: string): TourDeck {
  const meta = pptLibrary.get(deckId)
  if (!meta) throw new Error(`PPT 不存在: ${deckId}`)
  if (meta.source === 'builtin') throw new Error('内置演示请走默认加载路径')
  if (meta.slideCount === 0) throw new Error('该 PPT 没有页面图片')

  const script = pptLibrary.readScript(deckId)
  const texts = pptLibrary.readPageTexts(deckId)

  const sections: TourSection[] = []
  for (let i = 1; i <= meta.slideCount; i++) {
    const s = script?.slides[i - 1]
    const speech = s?.speech?.length
      ? s.speech.map((x) => ({ text: x.text, spotlight: x.spotlight }))
      : undefined
    sections.push({
      id: `page-${i}`,
      title: s?.title || `第 ${i} 页`,
      speech,
      content:
        texts[i - 1] ||
        (speech ?? []).map((x) => x.text).join(' ') ||
        `${meta.name} 第 ${i} 页`,
      slide: i
    })
  }

  return {
    type: 'slide',
    id: deckId,
    title: script?.meta.title || meta.name,
    file: pptLibrary.htmlPath(deckId),
    scriptFile: script ? pptLibrary.scriptPath(deckId) : undefined,
    startSlide: 1,
    subtitleStyle: script?.subtitleStyle,
    sections
  }
}

function dirname(p: string): string {
  const idx = p.replace(/\\/g, '/').lastIndexOf('/')
  return idx === -1 ? '.' : p.slice(0, idx)
}
