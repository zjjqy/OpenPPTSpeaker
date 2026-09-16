/** 会话状态 store：订阅主进程推送的语音/讲解事件 */

import { defineStore } from 'pinia'
import type { TourState } from '@shared/tour'

interface State {
  micLevel: number
  speaking: boolean
  listening: boolean
  wakeup: boolean
  tourState: TourState
  currentTitle: string
  currentIndex: number
  totalSections: number
  tourMessage: string
  lastText: string
  apiReady: boolean
  bound: boolean
}

export const useSessionStore = defineStore('session', {
  state: (): State => ({
    micLevel: -60,
    speaking: false,
    listening: false,
    wakeup: false,
    tourState: 'idle',
    currentTitle: '',
    currentIndex: 0,
    totalSections: 0,
    tourMessage: '',
    lastText: '',
    apiReady: false,
    bound: false
  }),
  getters: {
    isPresenting: (s) => s.tourState === 'presenting' || s.tourState === 'opening' || s.tourState === 'resuming',
    isAnswering: (s) => s.tourState === 'answering' || s.tourState === 'paused'
  },
  actions: {
    bind(): void {
      if (this.bound) return
      this.bound = true
      const api = window.ops

      api.speech.onEvent((ev) => {
        if (ev.type === 'level' && ev.db !== undefined) {
          this.micLevel = Math.max(-60, ev.db)
        } else if (ev.type === 'vad-activity') {
          this.listening = true
        } else if (ev.type === 'vad-idle') {
          this.listening = false
        } else if (ev.type === 'wakeup') {
          this.wakeup = true
          this.lastText = ev.text
        } else if (ev.type === 'tts-start') {
          this.speaking = true
        } else if (ev.type === 'tts-end') {
          this.speaking = false
        } else if (ev.type === 'interrupt') {
          this.speaking = false
        } else if (ev.type === 'answer' && ev.text) {
          this.lastText = ev.text
        }
      })

      api.tour.onStateChanged((ev) => {
        this.tourState = ev.state
        this.tourMessage = ev.message ?? ''
        this.currentTitle = ev.section?.title ?? ev.deck?.title ?? ''
        this.currentIndex = (ev.currentIndex ?? 0) + 1
        this.totalSections = ev.deck?.sections.length ?? 0
        if (ev.state === 'idle' || ev.state === 'ended') {
          this.speaking = false
        }
      })

      api.tour.onData((ev) => {
        if (ev.kind === 'chat' && ev.text) {
          this.lastText = ev.text
        } else if (ev.kind === 'subtitle' && ev.text) {
          this.lastText = ev.text
        }
      })

      void api.config.get().then((cfg) => {
        this.apiReady = Boolean(cfg.apiKey)
      })
      api.config.onChange((cfg) => {
        this.apiReady = Boolean(cfg.apiKey)
      })
    }
  }
})
