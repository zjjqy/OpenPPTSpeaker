/** 千问 LLM 客户端（DashScope OpenAI 兼容模式，SSE 流式） */

import { configStore } from '../config/ConfigStore'
import { t } from '@shared/i18n'

const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  tool_calls?: unknown
}

export interface LlmStreamOptions {
  messages: ChatMessage[]
  tools?: unknown[]
  temperature?: number
  /** 系统提示词 */
  system?: string
  onDelta?: (text: string) => void
  onToolCall?: (name: string, args: Record<string, unknown>) => void
  signal?: AbortSignal
}

export interface LlmResponse {
  text: string
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>
}

/** 解析 SSE 流 */
async function* streamLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data:')) {
          yield trimmed.slice(5).trim()
        }
      }
    }
    if (buffer.trim().startsWith('data:')) {
      yield buffer.trim().slice(5).trim()
    }
  } finally {
    reader.releaseLock()
  }
}

export class LlmClient {
  /** 发起流式对话，返回完整文本 + 工具调用 */
  async chat(opts: LlmStreamOptions): Promise<LlmResponse> {
    const apiKey = configStore.get('apiKey')
    if (!apiKey) {
      throw new Error(t('tour.noApiKey'))
    }

    const messages: ChatMessage[] = []
    if (opts.system) {
      messages.push({ role: 'system', content: opts.system })
    }
    messages.push(...opts.messages)

    const body: Record<string, unknown> = {
      model: configStore.get('llmModel'),
      messages,
      stream: true,
      // 部分千问模型默认开启思考模式（首字延迟高、多耗思考 token），讲解/问答场景直出即可；
      // 非思考模型会忽略此参数，无副作用
      enable_thinking: false
    }
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools
    }
    if (opts.temperature !== undefined) body.temperature = opts.temperature

    const resp = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: opts.signal
    })

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => '')
      throw new Error(t('llm.requestFailed', { status: resp.status, msg: errText.slice(0, 200) }))
    }

    let text = ''
    const toolCalls: LlmResponse['toolCalls'] = []
    let pendingTool: { name: string; args: string } | null = null

    const commitTool = (): void => {
      if (!pendingTool) return
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(pendingTool.args || '{}')
      } catch {
        args = {}
      }
      toolCalls.push({ name: pendingTool.name, arguments: args })
      pendingTool = null
    }

    for await (const line of streamLines(resp.body)) {
      if (line === '[DONE]') break
      let json: Record<string, unknown>
      try {
        json = JSON.parse(line)
      } catch {
        continue
      }
      const choices = json.choices as Array<{
        delta?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }
        finish_reason?: string
      }>
      if (!choices?.length) continue
      const delta = choices[0].delta
      if (!delta) continue

      if (delta.content) {
        text += delta.content
        opts.onDelta?.(delta.content)
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            commitTool()
            pendingTool = { name: tc.function.name, args: '' }
          }
          if (tc.function?.arguments) {
            if (!pendingTool) pendingTool = { name: '', args: '' }
            pendingTool.args += tc.function.arguments
          }
        }
      }
    }
    commitTool()

    return { text: text.trim(), toolCalls }
  }

  /** 非流式快速问答（单次，用于追问等） */
  async ask(question: string, context: string, system?: string): Promise<string> {
    const messages: ChatMessage[] = []
    if (context) {
      messages.push({
        role: 'system',
        content: t('prompt.contextWrap', { v: context })
      })
    }
    messages.push({ role: 'user', content: question })
    const res = await this.chat({ messages, system, temperature: 0.6 })
    return res.text
  }
}

export const llmClient = new LlmClient()
