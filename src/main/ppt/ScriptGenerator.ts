/**
 * 演讲稿生成：逐页调用大模型生成 v2 讲稿。
 * - 有文本层的页（PDF 导入）→ 文本模型（沿用配置的 llmModel）
 * - 无文本的页（扫描页 / 图片导入）→ 视觉模型 qwen-vl-plus 直接读页面图
 * 只生成讲稿文本与页标题；聚光框由用户在编辑器中框选（LLM 不猜坐标）。
 */

import { readFileSync } from 'fs'
import { configStore } from '../config/ConfigStore'
import { llmClient } from '../ai/LlmClient'
import { pptLibrary } from './PptLibrary'
import type { DeckScriptV2, SlideScriptV2 } from '@shared/ppt'
import { t } from '@shared/i18n'

const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const VISION_MODEL = 'qwen-vl-plus'

export interface GenScriptOptions {
  /** 用户提示词（讲解侧重、风格、受众等） */
  prompt?: string
  onProgress?: (done: number, total: number, message?: string) => void
}

function buildSystemPrompt(): string {
  // 提示词随语言切换：英文界面下要生成英文讲稿
  return [
    t('script.sys.role'),
    t('script.sys.task'),
    t('script.sys.req'),
    t('script.sys.r1'),
    t('script.sys.r2'),
    t('script.sys.r3'),
    t('script.sys.r4')
  ].join('\n')
}

/** 从模型输出中提取 JSON（容忍 ```json 围栏与前后杂谈） */
function extractJson(raw: string): { title?: string; speech?: unknown } | null {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

/** 视觉模型：读页面图生成讲稿 */
async function visionDescribe(imageDataUrl: string, userPrompt: string): Promise<string> {
  const apiKey = configStore.get('apiKey')
  if (!apiKey) throw new Error(t('tour.noApiKey'))
  const resp = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: userPrompt }
          ]
        }
      ],
      stream: false,
      enable_thinking: false
    })
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(t('script.visionFailed', { status: resp.status, msg: errText.slice(0, 200) }))
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

/** 为整个 PPT 生成 v2 演讲稿并写盘 */
export async function generateScript(deckId: string, opts: GenScriptOptions = {}): Promise<DeckScriptV2> {
  const deck = pptLibrary.get(deckId)
  if (!deck) throw new Error(t('ppt.deckNotFound', { id: deckId }))
  if (deck.source === 'builtin') throw new Error(t('ppt.builtinScriptHint'))

  const slideCount = pptLibrary.list().find((d) => d.id === deckId)?.slideCount ?? 0
  if (slideCount === 0) throw new Error(t('deck.noSlideImages'))
  const texts = pptLibrary.readPageTexts(deckId)
  const userHint = opts.prompt?.trim()
  const slides: SlideScriptV2[] = []

  for (let i = 1; i <= slideCount; i++) {
    opts.onProgress?.(i - 1, slideCount, t('script.progress', { i, n: slideCount }))
    const pageText = texts[i - 1] ?? ''
    let slide: SlideScriptV2
    try {
      let raw: string
      if (pageText.length >= 30) {
        // 文本层足够 → 文本模型
        const q = [
          t('script.user.textIntro', { i, n: slideCount, title: deck.name }),
          `"""${pageText.slice(0, 3000)}"""`,
          t('script.user.ask'),
          userHint ? t('script.user.hint', { hint: userHint }) : ''
        ].filter(Boolean).join('\n')
        raw = await llmClient.ask(q, '', buildSystemPrompt())
      } else {
        // 文本过少 → 视觉模型读图
        const png = readFileSync(pptLibrary.slideImagePath(deckId, i))
        const dataUrl = `data:image/png;base64,${png.toString('base64')}`
        const q = [
          t('script.user.imageIntro', { i, n: slideCount, title: deck.name }),
          t('script.user.observe'),
          userHint ? t('script.user.hint', { hint: userHint }) : ''
        ].filter(Boolean).join('\n')
        raw = await visionDescribe(dataUrl, q)
      }
      const parsed = extractJson(raw)
      const speech = Array.isArray(parsed?.speech)
        ? (parsed!.speech as unknown[])
            .map((t) => ({ text: String(t ?? '').trim() }))
            .filter((s) => s.text.length > 0)
        : []
      slide = {
        slide: i,
        title: String(parsed?.title ?? '').trim() || t('deck.slideTitle', { n: i }),
        speech
      }
      if (speech.length === 0) {
        console.warn(`[讲稿生成] 第 ${i} 页模型未产出有效讲解词`)
      }
    } catch (e) {
      console.error(`[讲稿生成] 第 ${i} 页失败:`, (e as Error).message)
      slide = { slide: i, title: t('deck.slideTitle', { n: i }), speech: [] }
    }
    slides.push(slide)
    opts.onProgress?.(i, slideCount)
  }

  const script: DeckScriptV2 = {
    version: 2,
    meta: {
      title: deck.name,
      slideCount,
      generatedBy: 'llm',
      updatedAt: new Date().toISOString()
    },
    slides
  }
  pptLibrary.writeScript(deckId, script)
  return script
}
