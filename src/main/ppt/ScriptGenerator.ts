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

const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const VISION_MODEL = 'qwen-vl-plus'

export interface GenScriptOptions {
  /** 用户提示词（讲解侧重、风格、受众等） */
  prompt?: string
  onProgress?: (done: number, total: number, message?: string) => void
}

function buildSystemPrompt(): string {
  return [
    '你是一位专业的企业演示演讲稿撰写专家。',
    '你的任务是为 PPT 的每一页撰写口语化的现场讲解词。',
    '要求：',
    '1. 讲解词口语化、自然流畅，适合照稿播报，不要出现"本页""这张幻灯片"等元描述；',
    '2. 每页 2~6 句，每句是一个完整句子，总时长约 30~60 秒；',
    '3. 先给页标题（10 字以内，概括该页主题），再给逐句讲解词；',
    '4. 严格输出 JSON，不要输出任何其他内容：{"title":"页标题","speech":["第一句","第二句"]}'
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
  if (!apiKey) throw new Error('未配置 DashScope API Key，请在设置中填写')
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
    throw new Error(`视觉模型请求失败 (${resp.status}): ${errText.slice(0, 200)}`)
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

/** 为整个 PPT 生成 v2 演讲稿并写盘 */
export async function generateScript(deckId: string, opts: GenScriptOptions = {}): Promise<DeckScriptV2> {
  const deck = pptLibrary.get(deckId)
  if (!deck) throw new Error(`PPT 不存在: ${deckId}`)
  if (deck.source === 'builtin') throw new Error('内置演示的讲稿请直接编辑 introduceProduction/演讲稿.json')

  const slideCount = pptLibrary.list().find((d) => d.id === deckId)?.slideCount ?? 0
  if (slideCount === 0) throw new Error('该 PPT 没有页面图片')
  const texts = pptLibrary.readPageTexts(deckId)
  const userHint = opts.prompt?.trim()
  const slides: SlideScriptV2[] = []

  for (let i = 1; i <= slideCount; i++) {
    opts.onProgress?.(i - 1, slideCount, `正在生成第 ${i}/${slideCount} 页讲稿…`)
    const pageText = texts[i - 1] ?? ''
    let slide: SlideScriptV2
    try {
      let raw: string
      if (pageText.length >= 30) {
        // 文本层足够 → 文本模型
        const q = [
          `这是 PPT 第 ${i} 页（共 ${slideCount} 页，整篇主题：${deck.name}）的文本内容：`,
          `"""${pageText.slice(0, 3000)}"""`,
          '请为这一页撰写讲解词。',
          userHint ? `补充要求：${userHint}` : ''
        ].filter(Boolean).join('\n')
        raw = await llmClient.ask(q, '', buildSystemPrompt())
      } else {
        // 文本过少 → 视觉模型读图
        const png = readFileSync(pptLibrary.slideImagePath(deckId, i))
        const dataUrl = `data:image/png;base64,${png.toString('base64')}`
        const q = [
          `这是 PPT 第 ${i} 页（共 ${slideCount} 页，整篇主题：${deck.name}）的页面截图。`,
          '请观察页面内容，为这一页撰写讲解词。',
          userHint ? `补充要求：${userHint}` : ''
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
        title: String(parsed?.title ?? '').trim() || `第 ${i} 页`,
        speech
      }
      if (speech.length === 0) {
        console.warn(`[讲稿生成] 第 ${i} 页模型未产出有效讲解词`)
      }
    } catch (e) {
      console.error(`[讲稿生成] 第 ${i} 页失败:`, (e as Error).message)
      slide = { slide: i, title: `第 ${i} 页`, speech: [] }
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
