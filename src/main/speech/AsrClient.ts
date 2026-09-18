/** paraformer-realtime 流式语音识别客户端（DashScope WebSocket，新版 run-task 协议） */

import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { configStore } from '../config/ConfigStore'
import { LANG_TO_ASR_HINTS } from '../config/schema'
import type { AsrEvent } from '@shared/speech'
import { t } from '@shared/i18n'

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'

export class AsrClient {
  private ws: WebSocket | null = null
  private taskId = ''
  private onEvent: (ev: AsrEvent) => void = () => {}

  setHandler(handler: (ev: AsrEvent) => void): void {
    this.onEvent = handler
  }

  get isRunning(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /** 建立连接并启动识别（鉴权在握手阶段：Authorization: Bearer） */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const apiKey = configStore.get('apiKey')
      if (!apiKey) {
        reject(new Error(t('tts.noApiKey')))
        return
      }
      this.taskId = randomUUID()

      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      this.ws = ws

      ws.on('open', () => {
        const startMsg = {
          header: {
            action: 'run-task',
            task_id: this.taskId,
            streaming: 'duplex'
          },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: configStore.get('asrModel'),
            parameters: {
              format: 'pcm',
              sample_rate: 16000,
              enable_partial_results: true,
              enable_intermediate_results: true,
              // 语种提示跟随界面语言。不传时服务端默认 ['zh','en'] 并自行判断语种，
              // 中英同时开着会让英文语音被往谐音中文上靠，故显式指定。
              language_hints: LANG_TO_ASR_HINTS[configStore.get('language')]
            },
            input: {}
          }
        }
        ws.send(JSON.stringify(startMsg))
        resolve()
      })

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString())
          const header = msg.header ?? {}
          const payload = msg.payload ?? {}
          const ev = header.event || header.action

          if (ev === 'task-started') {
            this.onEvent({ type: 'started' })
          } else if (ev === 'result-generated') {
            const sentence = payload.output?.sentence
            if (!sentence?.text) return
            // 新版协议按句返回；sentence.finished === false 时视为中间结果
            if (sentence.finished === false) {
              this.onEvent({ type: 'partial', text: sentence.text })
            } else {
              this.onEvent({ type: 'final', text: sentence.text })
            }
          } else if (ev === 'task-finished') {
            this.onEvent({ type: 'stopped' })
            try {
              ws.close()
            } catch {
              /* ignore */
            }
            if (this.ws === ws) this.ws = null
          } else if (ev === 'task-failed' || header.error_code) {
            this.onEvent({
              type: 'error',
              message: `${header.error_code ?? ''} ${header.error_message ?? ''}`.trim()
            })
          }
        } catch {
          /* 忽略非 JSON 帧 */
        }
      })

      ws.on('error', (err) => {
        this.onEvent({ type: 'error', message: err.message })
        reject(err)
      })

      ws.on('close', () => {
        if (this.ws === ws) this.ws = null
      })
    })
  }

  /** 发送 PCM 音频帧（16k 16bit mono） */
  sendAudio(buffer: Buffer): void {
    if (this.isRunning) {
      this.ws!.send(buffer)
    }
  }

  /** 结束识别：发送 finish-task，等服务端 task-finished 后关闭 */
  stop(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          header: { action: 'finish-task', task_id: this.taskId, streaming: 'duplex' },
          payload: { input: {} }
        })
      )
      // 兜底：3 秒内未收到 task-finished 则强制关闭
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.close()
          } catch {
            /* ignore */
          }
        }
        this.ws = null
      }, 3000)
    } else {
      this.ws = null
    }
  }
}
