/** 讲解上下文管理：断点 / 历史 / 页面素材 / 用户关注点 */

import type { TourContext, TourDeck } from '@shared/tour'
import { t } from '@shared/i18n'
import { configStore } from '../config/ConfigStore'

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class ContextManager {
  private ctx: TourContext | null = null

  init(deck: TourDeck): void {
    this.ctx = {
      deck,
      currentIndex: (deck.startSlide ?? 1) - 1,
      presented: [],
      history: [],
      focuses: []
    }
  }

  get(): TourContext | null {
    return this.ctx
  }

  setCurrent(index: number, sectionText?: string, pageSummary?: string): void {
    if (!this.ctx) return
    this.ctx.currentIndex = index
    if (sectionText !== undefined) this.ctx.sectionText = sectionText
    if (pageSummary !== undefined) this.ctx.pageSummary = pageSummary
  }

  markPresented(id: string): void {
    if (!this.ctx) return
    if (!this.ctx.presented.includes(id)) {
      this.ctx.presented.push(id)
    }
  }

  addHistory(role: 'user' | 'assistant', content: string): void {
    if (!this.ctx) return
    this.ctx.history.push({ role, content })
    const max = configStore.get('maxHistory')
    if (this.ctx.history.length > max) {
      this.ctx.history = this.ctx.history.slice(-max)
    }
  }

  addFocus(text: string): void {
    if (!this.ctx) return
    if (!this.ctx.focuses.includes(text) && this.ctx.focuses.length < 10) {
      this.ctx.focuses.push(text)
    }
  }

  /** 组装讲解消息（含上下文 + 历史） */
  buildMessages(userInstruction: string): ContextMessage[] {
    const ctx = this.ctx
    const section = ctx?.deck.sections[ctx.currentIndex]
    const parts: string[] = []
    parts.push(t('ctx.deckTitle', { v: ctx?.deck.title ?? '' }))
    if (ctx?.pageSummary) parts.push(t('ctx.pageSummary', { v: ctx.pageSummary }))
    if (ctx?.sectionText || section?.content) {
      parts.push(t('ctx.sectionContent', { v: ctx?.sectionText || section?.content || '' }))
    }
    if (!ctx?.sectionText && !section?.content) {
      parts.push(t('ctx.noSection'))
    }
    if (section?.prompt) parts.push(t('ctx.sectionPrompt', { v: section.prompt }))
    parts.push(
      t('ctx.progress', {
        i: (ctx?.currentIndex ?? 0) + 1,
        n: ctx?.deck.sections.length ?? 0
      })
    )
    if (ctx?.presented.length) {
      parts.push(t('ctx.presented', { v: ctx.presented.join(t('list.sep')) }))
    }
    if (ctx?.focuses.length) {
      parts.push(t('ctx.focuses', { v: ctx.focuses.join(t('list.semi')) }))
    }

    const messages: ContextMessage[] = [{ role: 'user', content: parts.join('\n').slice(0, 6000) }]
    // 附带最近对话历史
    const history = ctx?.history ?? []
    if (history.length) {
      messages.push({
        role: 'system',
        content: t('ctx.recentQa', {
          v: history
            .map(
              (h) => `${h.role === 'user' ? t('ctx.roleUser') : t('ctx.roleAssistant')}: ${h.content}`
            )
            .join('\n')
        })
      })
    }
    messages.push({ role: 'user', content: userInstruction })
    return messages
  }
}
