/** 讲解引擎：LLM 工具调用驱动的 Agent 式讲演，支持打断与自由问答 */

import { dialog } from 'electron'
import type { TourDeck, TourState, TourSection, TourStateEvent, TourDataEvent } from '@shared/tour'
import { loadSlideDeck, loadLibrarySlideDeck } from './deckLoader'
import { ContextManager } from './ContextManager'
import { browserController } from '../browser/BrowserController'
import { llmClient } from '../ai/LlmClient'
import { TOUR_TOOLS, TourTool } from '../ai/tools'
import { speechSession } from '../speech/SpeechSession'
import { windowManager } from '../windows/WindowManager'
import { configStore } from '../config/ConfigStore'
import { appProfile } from './assistantProfile'
import { t } from '@shared/i18n'
import { SpeechCache } from './SpeechCache'
import { getTtsEngine } from '../speech/TtsEngine'
import { pptLibrary } from '../ppt/PptLibrary'
import type { SpotlightRect } from '@shared/ppt'

const PRESENT_SYSTEM = `你是"OpenPPTSpeaker"，一位专业的开源 AI 讲演助手，正在通过语音向听众实时讲解一份 PPT 演示。
规则：
1. 讲解口语化、亲切、自然，每段控制在 2~4 句话，适合语音朗读，不要使用 Markdown 符号。
2. 聚光与翻页高亮由系统按讲稿自动处理，你只需专注讲解内容本身。
3. 当前区段讲解完毕，调用 go_next 进入下一区段；若需回顾调用 go_prev。
4. 在关键节点可调用 ask_user 主动询问听众是否有疑问，并根据回应继续讲解。
5. 全部区段讲解完成时调用 end_tour 做总结。
6. 只输出要念的讲解词本身，严禁输出任何解释、标题或注释。`

const QNA_SYSTEM = `你是"OpenPPTSpeaker"，正在讲解过程中回答听众的问题或处理指令。
规则：
1. 依据【讲解上下文】作答，口语化，2~4 句话，不要用 Markdown。
2. 若听众发出指令（如"下一页/上一页/重复一遍/停止/结束/继续"），调用相应工具（go_next/go_prev/end_tour），不要输出多余话术；若是要求重复，则复述刚才的重点内容。
3. 完全无关的问题，礼貌说明并引导回当前主题。`

export class TourEngine {
  state: TourState = 'idle'
  private deck: TourDeck | null = null
  private ctx = new ContextManager()
  private sectionIndex = 0
  private running = false
  private stopRequested = false
  private interruptedDuringSpeak = false
  private pendingUserText: { text: string; at: number } | null = null
  /** 最近一次打断发生时间：waitForUserInput 只消费打断之后缓存的话语，防止陈旧文本冒充本次提问 */
  private interruptAt = 0
  private userInputWaiters: Array<(text: string | null) => void> = []
  /** 用户已松开"按住说话"按钮但等待逻辑尚未消费该信号（防止松开发生在 waitForUserInput 注册前导致信号丢失） */
  private bargeInReleased = false
  /** 遥控暂停（手机暂停/翻页/网页跳转触发）：静默停止播报，等待手机【播放】指令恢复 */
  private remotePaused = false
  /** 遥控暂停的唤醒信号（手机按【播放】时 resolve） */
  private remoteResumeWaiter: (() => void) | null = null

  private listeners: Array<(ev: TourStateEvent) => void> = []
  private dataListeners: Array<(ev: TourDataEvent) => void> = []

  // 字幕与语音同步：当前讲解段的短句列表 / 每句时长边界(ms累计) / 段总时长 / 已展示到的句子索引
  private subtitleSentences: string[] = []
  private subtitleWeights: number[] = []
  private subtitleTotalMs = 0
  private subtitleIndex = -1
  /** 讲解词音频预合成与缓存 */
  private speechCache = new SpeechCache()
  /** 当前 PPT 已显示到的页（0 起，避免重复 showSlide） */
  private lastShownSlide = -1

  constructor() {
    // 讲解中被打断 → 暂停流程
    speechSession.setInterruptHandler(() => {
      this.interruptedDuringSpeak = true
      this.interruptAt = Date.now()
    })
    // 交互模式下用户话语（问题/指令）
    speechSession.onUserUtterance = (text) => {
      this.pendingUserText = { text, at: Date.now() }
      const w = this.userInputWaiters.shift()
      if (w) w(text)
    }
    // 手机"按住说话"松开 → 取消打断后的静默等待，继续讲解。
    // 记录 bargeInReleased：若松开发生在 waitForUserInput 注册之前（如打断流程尚未真正开始等待），
    // 该标志会在后续第一次 waitForUserInput 时被消费为"__resume__"，避免松开信号丢失导致不继续。
    speechSession.onBargeInRelease(() => {
      this.bargeInReleased = true
      this.resolveAllWaiters('__resume__')
    })
    // 按 audioWorker 实际播放进度同步字幕（不阻塞、不逐句 TTS 合成，避免卡顿）
    speechSession.onPlaybackProgress((playedMs, sentMs) => this.handlePlaybackProgress(playedMs, sentMs))
    // 预合成模式：某句音频真正开始播放时显示该句字幕，严格同步且不跳过任何句
    speechSession.onSentenceStart((index) => this.handleSentenceStart(index))
  }

  /** 预合成逐句同步：显示第 index 句字幕，并切换该句对应的聚光 */
  private handleSentenceStart(index: number): void {
    if (this.subtitleSentences.length === 0) return
    if (index < 0 || index >= this.subtitleSentences.length) return
    if (index !== this.subtitleIndex) {
      this.subtitleIndex = index
      this.emitData({ kind: 'subtitle', text: this.subtitleSentences[index], role: 'assistant' })
    }
    // v2 坐标聚光优先：有坐标 → 遮罩聚光；无坐标 → 清除遮罩（避免残留上一句的框）
    const rect = this.currentSpotlights[index] ?? null
    if (rect || this.deckUsesCoordSpotlight) {
      void browserController.spotlightRect(rect)
      return
    }
    // v1 兼容：元素 id（sp=文本 / sg=容器）→ 按 id 精确定位聚光灯
    const hl = this.currentHighlights[index]
    if (hl && /^(sp|sg)\d+_/.test(hl)) {
      void browserController.spotlight('#' + hl).catch(() => undefined)
    }
    // 旧文本格式无元素 id，无法定位聚光灯，跳过
  }

  /** 字幕切句方式：true=按每句音频时长边界精确同步（预合成）；false=按字符权重估算（LLM 实时生成） */
  private subtitleUseDurationBoundary = false
  /** 当前讲解页每句对应的重点高亮文本（与 speech 一一对应；null=该句无高亮） */
  private currentHighlights: Array<string | null> = []
  /** 当前讲解页每句对应的坐标聚光框（v2，与 speech 一一对应；null=该句不聚光） */
  private currentSpotlights: Array<SpotlightRect | null> = []
  /** 当前 deck 是否使用坐标聚光（v2 讲稿；决定无坐标句是否主动清除遮罩） */
  private deckUsesCoordSpotlight = false
  /** 打断时最后播放到的句子索引（-1 表示无记录，从头播放） */
  private interruptedSentenceIndex = -1

  /** 根据播放进度更新字幕：字幕显示"当前正在播放"的短句 */
  private handlePlaybackProgress(playedMs: number, sentMs: number): void {
    if (this.subtitleSentences.length === 0) return
    // 预合成模式：字幕已由 onSentenceStart（每句音频开始播放）精确驱动，这里不再按进度估算
    if (this.subtitleUseDurationBoundary) return
    if (playedMs <= 0) return
    // LLM 实时：段总时长取准确值或合成中实时值作下界，按字符权重估算
    const total = Math.max(this.subtitleTotalMs, sentMs)
    if (total <= 0) return
    const targetMs = Math.min(playedMs, total)
    const totalChars = this.subtitleWeights[this.subtitleWeights.length - 1] ?? 1
    const targetChar = (targetMs / total) * totalChars
    let idx = this.subtitleWeights.findIndex((w) => targetChar <= w)
    if (idx === -1) idx = this.subtitleSentences.length - 1
    if (idx !== this.subtitleIndex) {
      this.subtitleIndex = idx
      this.emitData({ kind: 'subtitle', text: this.subtitleSentences[idx], role: 'assistant' })
    }
  }

  // ==================== 订阅 ====================
  onState(listener: (ev: TourStateEvent) => void): void {
    this.listeners.push(listener)
  }

  onData(listener: (ev: TourDataEvent) => void): void {
    this.dataListeners.push(listener)
  }

  private emitState(partial: Partial<TourStateEvent>): void {
    const ev: TourStateEvent = {
      state: this.state,
      deck: this.deck ?? undefined,
      currentIndex: this.sectionIndex,
      section: this.deck?.sections[this.sectionIndex] ?? null,
      ...partial
    }
    for (const l of this.listeners) l(ev)
  }

  private emitData(ev: TourDataEvent): void {
    for (const l of this.dataListeners) l(ev)
  }

  private setState(s: TourState, message?: string): void {
    this.state = s
    this.emitState({ message })
  }

  // ==================== 对外接口 ====================
  /** 开始讲解 */
  async startDeck(args: { scriptFile?: string; deckId?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.running) await this.stop()
      if (!configStore.hasApiKey()) {
        return { success: false, error: t('tour.noApiKey') }
      }

      // PPT 演示路由：指定讲稿走内置加载器；
      // 其余按 PPT 库的活动 deck（'builtin' = 内置 introduceProduction 演示）
      let deck: TourDeck
      if (args.scriptFile) {
        deck = loadSlideDeck(args.scriptFile)
      } else {
        const deckId = args.deckId || pptLibrary.getActiveId()
        deck = deckId === 'builtin' ? loadSlideDeck() : loadLibrarySlideDeck(deckId)
      }
      this.deck = deck
      this.ctx.init(deck)
      this.sectionIndex = Math.max(0, (deck.startSlide ?? 1) - 1)
      this.stopRequested = false
      this.running = true
      this.interruptedDuringSpeak = false
      this.interruptedSentenceIndex = -1
      this.bargeInReleased = false
      this.pendingUserText = null
      this.interruptAt = 0
      this.remotePaused = false

      // 开讲前先把全部讲解词预合成完（已缓存的页秒过）：
      // 保证每页音频就绪、字幕逐句精确同步，避免边讲边合成的时序问题
      const preloadable = deck.sections.filter((s) => s.speech && s.speech.length > 0)
      if (preloadable.length) {
        // 先预热语音服务：首次建连要完成 DNS 解析 + TLS 握手（国内网络常需十几秒），
        // 若留到第一页合成时才做，很容易撞上连接超时，表现为"第一页失败、后面都正常"
        this.setState('opening', t('tour.connecting'))
        await getTtsEngine().warmup?.()
        if (this.stopRequested || !this.running) return { success: false, error: t('tip.cancelled') }

        this.setState('opening', t('tour.preparingAudio'))
        let report = await this.speechCache.preload(
          preloadable,
          (done, total) => this.setState('opening', t('tour.preparingAudioProgress', { done, total })),
          () => this.stopRequested || !this.running
        )
        if (this.stopRequested || !this.running) return { success: false, error: t('tip.cancelled') }

        // 有页合成失败 → 开讲前弹窗让用户决定，不直接进入播报
        if (report.failedPages.length > 0) {
          let action = await this.askPreloadFailure(report.failedPages, deck.title)
          if (action === 'retry') {
            // 重试：仍传全部页，内部只补缺的（已缓存的跳过）
            this.setState('opening', t('tour.retryingAudio'))
            report = await this.speechCache.preload(
              preloadable,
              (done, total) => this.setState('opening', t('tour.retryingProgress', { done, total })),
              () => this.stopRequested || !this.running
            )
            if (this.stopRequested || !this.running) return { success: false, error: t('tip.cancelled') }
            if (report.failedPages.length > 0) {
              // 重试仍失败 → 再问一次，但不再提供"重试"，避免死循环
              action = await this.askPreloadFailure(report.failedPages, deck.title, true)
            }
          }
          if (action === 'cancel' || (action === 'retry' && report.failedPages.length > 0)) {
            this.stopRequested = true
            this.running = false
            this.setState('idle', t('tour.cancelledAudio'))
            return { success: false, error: t('tip.cancelled') }
          }
          // action === 'continue' → 继续开讲，失败页走静音逐句（播放作者原文，不回退 LLM）
        }
      }

      this.setState('opening', t('tour.openingDeck', { title: deck.title }))

      // 打开讲解目标
      await browserController.open({ file: deck.file })
      await browserController.showSlide(this.sectionIndex + 1)
      this.lastShownSlide = this.sectionIndex

      // 进入交互模式（取消唤醒词，直接说话即可打断/提问）
      speechSession.setWakeMode(false)
      if (configStore.get('enableWake')) {
        void speechSession.start()
      }
      windowManager.minimizeOrb()

      // 下发当前讲稿的字幕样式给字幕窗口（无配置时窗口保持默认样式）
      if (deck.subtitleStyle) {
        this.emitData({ kind: 'subtitle-style', style: deck.subtitleStyle })
      }

      // PPT 打开后先等待 5 秒（静默），让观众看清第一页，再开始播报（支持中途停止）
      // 注意：等待期间保持 opening 状态，避免被"语音命令 idle 判断"误触发重新启动
      this.setState('opening', t('tour.starting'))
      const waitMs = 5000
      const t0 = Date.now()
      while (Date.now() - t0 < waitMs) {
        if (this.stopRequested) break
        await new Promise((r) => setTimeout(r, 500))
      }
      if (this.stopRequested) return { success: false, error: t('tip.cancelled') }

      // 不播开场白，直接进入逐页讲解（第一页的内容即是开头）
      await this.runPresentation()
      return { success: true }
    } catch (e) {
      console.error('[Tour] 讲解启动失败:', e)
      // 注意：下面的清理务必保持幂等且不抛异常（详见 catch 内的 try/catch）
      // 先彻底清理再切状态：残留的讲解窗口 / 悬浮球迷你态会污染下一次讲解，
      // 表现为字幕与语音错位、开场白重复播放。清理自身出错也不能中断。
      try {
        await browserController.clearSpotlight().catch(() => undefined)
        windowManager.closeBrowser()
        windowManager.restoreOrb()
      } catch (cleanupErr) {
        console.error('[Tour] 启动失败后的清理异常:', cleanupErr)
      }
      this.stopRequested = true
      this.running = false
      this.setState('idle', (e as Error).message)
      return { success: false, error: (e as Error).message }
    }
  }

  /**
   * 预合成失败时，在**开讲前**询问用户，不直接进入播报。
   * 有作者讲稿的页不能静默交给 LLM 现编，所以必须让用户先决定。
   * @param failedPages 失败页码
   * @param deckTitle 演示标题
   * @param isRetry 是否为"重试后仍失败"的二次询问（不再给重试选项，避免死循环）
   */
  private async askPreloadFailure(
    failedPages: number[],
    deckTitle: string,
    isRetry = false
  ): Promise<'retry' | 'continue' | 'cancel'> {
    const engine = configStore.get('ttsEngine')
    const shown = failedPages.slice(0, 12).join(t('list.sep'))
    const pages = shown + (failedPages.length > 12 ? t('tour.pagesMore', { n: failedPages.length }) : '')
    const parent = windowManager.pptWindow ?? windowManager.orbWindow ?? undefined

    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      title: isRetry ? t('tour.ttsRetryFailedTitle') : t('tour.ttsFailedTitle'),
      message: isRetry
        ? t('tour.ttsRetryFailedMsg', { n: failedPages.length })
        : t('tour.ttsFailedTitleMsg', { title: deckTitle, n: failedPages.length }),
      detail: t('tour.ttsFailedDetail', { pages, engine }),
      buttons: isRetry
        ? [t('tour.btnMutePlay'), t('action.cancel')]
        : [t('tour.btnRetrySynth'), t('tour.btnMutePlay'), t('action.cancel')],
      defaultId: 0,
      cancelId: isRetry ? 1 : 2
    }
    const res = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)

    if (isRetry) return res.response === 0 ? 'continue' : 'cancel'
    return res.response === 0 ? 'retry' : res.response === 1 ? 'continue' : 'cancel'
  }

  /** 外部手动下一步 */
  async next(): Promise<void> {
    if (this.state !== 'presenting' && this.state !== 'paused') return
    speechSession.interrupt()
    // 修正 off-by-one：推进到下一页（原 Math.min(len, idx+1) - 1 恒等于 idx，永不翻页）
    this.sectionIndex = Math.min((this.deck?.sections.length ?? 1) - 1, this.sectionIndex + 1)
    this.resumePresentation()
  }

  /** 外部手动上一步 */
  async prev(): Promise<void> {
    if (this.state !== 'presenting' && this.state !== 'paused') return
    speechSession.interrupt()
    this.sectionIndex = Math.max(0, this.sectionIndex - 1)
    this.resumePresentation()
  }

  /** 恢复讲解（被打断/暂停后） */
  async resume(): Promise<void> {
    this.pendingUserText = null
    // 若处于遥控/悬浮球暂停态，先唤醒主循环的静默等待（否则恢复无效）
    if (this.remotePaused) this.remoteResume()
    this.resumePresentation()
  }

  // ==================== 手机遥控（播放/暂停/翻页） ====================

  /**
   * 手机遥控：暂停播报。静默停止（不进问答、不出提示语），
   * 记住断点（页 + 句），等手机【播放】指令从断点继续。
   */
  remotePause(): void {
    if (!this.running || this.remotePaused) return
    // 仅正常讲解播报中响应；问答/倾听中忽略（用语音说"稍等"即可）
    if (this.state !== 'presenting' && this.state !== 'resuming') return
    this.remotePaused = true
    // 主循环进入 handleInterruptPause 后走遥控暂停分支（静默等待）
    this.interruptedDuringSpeak = true
    speechSession.interrupt()
    this.setState('paused', t('tour.pausedRemote'))
  }

  /**
   * 手机遥控：翻页（自动停止播报，静默停在新页）。
   * 只切换显示页，不改讲解断点（sectionIndex 保持不变）——
   * 按【播放】时主循环会自动跳回断点页，从被打断的那句继续讲。
   */
  remoteSlide(dir: 1 | -1): void {
    if (!this.running || !this.deck) return
    // 播报中翻页 → 先静默停播并记录断点
    if (!this.remotePaused) {
      if (this.state !== 'presenting' && this.state !== 'resuming') return
      this.remotePaused = true
      this.interruptedDuringSpeak = true
      speechSession.interrupt()
    }
    const total = this.deck.sections.length
    const target = Math.min(Math.max(this.lastShownSlide + dir, 0), total - 1)
    if (target === this.lastShownSlide) return
    this.lastShownSlide = target
    void browserController.showSlide(target + 1).catch(() => undefined)
    this.setState('paused', this.deck.sections[target]?.title ?? t('tour.paused'))
    // 翻页浏览期间隐藏字幕：旧句字幕停在屏幕上会误导观众（恢复播报时重新显示）
    windowManager.hideSubtitle()
  }

  /** 手机遥控：继续播报（跳回断点页、从断点句继续；仅在遥控暂停态有效，其余忽略） */
  remoteResume(): void {
    if (!this.running || !this.remotePaused) return
    this.remotePaused = false
    // 恢复播报时重新显示字幕（若翻页浏览时隐藏过）
    windowManager.showSubtitle()
    this.remoteResumeWaiter?.()
    this.remoteResumeWaiter = null
  }

  /**
   * 手机遥控【播放】按钮：已运行则恢复；处于初始/结束态则直接启动 PPT 讲解。
   * 异步执行，不阻塞消息处理。
   */
  remotePlay(): void {
    if (this.running) {
      this.remoteResume()
      return
    }
    // 初始/结束态 → 启动整场 PPT 讲解（与电脑端"开始讲解"一致）
    void this.startDeck({})
  }

  /** 结束讲解：立即停止播报、关闭播报页面、回到初始化状态（不依赖异步主循环收敛） */
  async end(): Promise<void> {
    this.stopRequested = true
    this.running = false
    // 打断当前播报（TTS / 预合成播放都立即停止）
    speechSession.interrupt()
    // 唤醒所有挂起的等待（遥控暂停 / 问答等待），让主循环尽快退出
    this.releaseRemotePause()
    this.resolveAllWaiters(null)
    // 立即清理：清高亮、关播报页面、恢复悬浮球、回到待机
    await browserController.clearSpotlight().catch(() => undefined)
    windowManager.closeBrowser()
    windowManager.restoreOrb()
    speechSession.setWakeMode(true)
    this.setState('idle')
  }

  /** 强制停止（窗口关闭等） */
  async stop(): Promise<void> {
    this.stopRequested = true
    this.running = false
    speechSession.interrupt()
    this.releaseRemotePause()
    this.resolveAllWaiters(null)
    await browserController.clearSpotlight().catch(() => undefined)
    windowManager.restoreOrb()
    this.setState('idle')
  }

  /** 释放遥控暂停状态（停止/结束时唤醒挂起的主循环） */
  private releaseRemotePause(): void {
    this.remotePaused = false
    this.remoteResumeWaiter?.()
    this.remoteResumeWaiter = null
  }

  // ==================== 主流程 ====================
  private resumePresentation(): void {
    this.interruptedDuringSpeak = false
    this.resolveAllWaiters('__resume__')
  }

  private async runPresentation(): Promise<void> {
    const deck = this.deck
    if (!deck) return

    while (this.sectionIndex < deck.sections.length) {
      if (this.stopRequested || !this.running) break
      const section = deck.sections[this.sectionIndex]
      // 同步 PPT 到当前讲解页（翻页/回页时都保持页面与讲解一致）
      if (deck.type === 'slide' && this.sectionIndex !== this.lastShownSlide) {
        await browserController.showSlide(this.sectionIndex + 1)
        // 清掉上一页的高亮框与聚光灯，避免残留到下一页
        await browserController.clearSpotlight().catch(() => undefined)
        this.lastShownSlide = this.sectionIndex
      }
      await this.presentSection(section)
      if (this.stopRequested || !this.running) break
      // 打断暂停流
      if (this.interruptedDuringSpeak) {
        this.interruptedDuringSpeak = false
        await this.handleInterruptPause()
        if (this.stopRequested || !this.running) break
      }
    }
    if (!this.stopRequested) {
      await this.finishTour()
    }
  }

  private async presentSection(section: TourSection): Promise<void> {
    this.setState('presenting', section.title)
    this.ctx.setCurrent(this.sectionIndex)
    this.ctx.markPresented(section.id)

    // 1.5 若本页有预设讲解词 → 确保音频就绪并直接播放（不走 LLM 生成讲解词），字幕精确同步。
    // 高亮改为逐句切换（每句播放时高亮该句对应内容），不做页级统一高亮。
    if (section.speech && section.speech.length > 0) {
      const precomputed = await this.speechCache.ensure(section)
      if (precomputed && precomputed.sentences.length > 0) {
        // 记录本页每句的高亮/聚光目标（与 speech 一一对应）：v2 坐标聚光优先，兼容 v1 元素 id/文本
        this.currentHighlights = (section.speech ?? []).map((s) => s.highlightId ?? s.highlight ?? null)
        this.currentSpotlights = (section.speech ?? []).map((s) => s.spotlight ?? null)
        // 本页存在坐标聚光 → 坐标模式（无坐标的句主动清框防残留）；否则保持 v1 元素 id 聚光。
        // 注意不能用 deck.id 判定（内置 deck id 是 'ppt-deck' 而非 'introduce-production'，
        // 旧判定恒真会把内置演示的 v1 元素聚光误清为坐标模式导致高亮失效）。
        this.deckUsesCoordSpotlight = this.currentSpotlights.some((r) => r !== null)
        await this.presentPrecomputed(section)
        return
      }
      // 音频合成失败：只要本页有作者写的讲解词，就绝不回退 LLM
      // （不能用 AI 现编的内容顶替作者原文），改为静音逐句播放作者讲稿。
      if (section.speech.some((s) => s.text?.trim())) {
        this.currentHighlights = (section.speech ?? []).map((s) => s.highlightId ?? s.highlight ?? null)
        this.currentSpotlights = (section.speech ?? []).map((s) => s.spotlight ?? null)
        this.deckUsesCoordSpotlight = this.currentSpotlights.some((r) => r !== null)
        await this.presentMuted(section)
        return
      }
      // 本页没有任何讲解词 → 才回退到下方 LLM 实时讲解
    }

    // 1. 页级聚焦（预合成失败回退 LLM 讲解时）：优先用讲稿里第一个坐标聚光框（v2），
    //    再退回 cssPath 元素聚光。导入的 PPT 没有 cssPath，
    //    聚光全靠讲稿坐标——没有这个兜底，LLM 兜底路径会全程无高亮。
    const firstSpot = (section.speech ?? []).find((s) => s.spotlight)?.spotlight ?? null
    if (firstSpot) {
      await browserController.spotlightRect(firstSpot).catch(() => undefined)
    } else if (section.cssPath) {
      await browserController.spotlight(section.cssPath).catch(() => undefined)
    }

    // 2. 素材：PPT 模式直接用讲稿/页面文本内容
    this.ctx.setCurrent(this.sectionIndex, section.content)

    // 3. LLM 生成讲解词（同一区段内可多轮：ask_user / 被打断重新讲）
    let done = false
    let guard = 0
    while (!done && !this.stopRequested && guard < 6) {
      guard++
      const resp = await llmClient.chat({
        system: PRESENT_SYSTEM,
        messages: this.ctx.buildMessages(
          t('tour.presentSection', { title: section.title }) +
          (this.ctx.get()?.history.length ? t('assistant.interruptedHint') : '')
        ),
        tools: TOUR_TOOLS as unknown as unknown[],
        onDelta: () => {}
      })

      if (resp.text) {
        await this.speakWithSubtitles(resp.text, true)
        this.ctx.addHistory('assistant', resp.text)
        if (this.interruptedDuringSpeak) return // 被打断，交给主循环暂停处理
        if (this.stopRequested) return
      }

      // 执行工具调用
      for (const tool of resp.toolCalls) {
        switch (tool.name) {
          case TourTool.GoNext: {
            if (this.sectionIndex < (this.deck?.sections.length ?? 1) - 1) {
              this.sectionIndex++
            }
            done = true
            break
          }
          case TourTool.GoPrev: {
            this.sectionIndex = Math.max(0, this.sectionIndex - 1)
            done = true
            break
          }
          case TourTool.AskUser: {
            const question = String(tool.arguments.question ?? t('assistant.anyQuestions'))
            await this.speakWithSubtitles(question, false)
            this.emitData({ kind: 'chat', role: 'assistant', text: question })
            const answer = await this.waitForUserInput(20000)
            if (answer && answer !== '__resume__') {
              this.ctx.addFocus(answer.slice(0, 40))
              this.ctx.addHistory('user', answer)
              const reply = await llmClient.ask(answer, this.buildContextBrief(), QNA_SYSTEM)
              if (reply) {
                await this.speakWithSubtitles(reply, true)
                this.ctx.addHistory('assistant', reply)
              }
            }
            // 提问并回应后，当前区段的重点已讲完，进入下一页，避免在同一页重复播报
            done = true
            break
          }
          case TourTool.EndTour: {
            this.stopRequested = true
            done = true
            break
          }
        }
        if (this.stopRequested) return
      }
      if (resp.toolCalls.length === 0) done = true
    }
  }

  /**
   * 播放预合成讲解词：整段音频已提前合成并缓存，直接播放；
   * 字幕按每句【真实音频时长边界】随播放进度精确同步（不依赖 LLM、无实时合成延迟）。
   */
  private async presentPrecomputed(section: TourSection): Promise<void> {
    const deck = this.deck!
    const audio = this.speechCache.get(section)
    if (!audio || audio.sentences.length === 0) {
      // 音频不可用（异常）→ 记入上下文后由主循环走 LLM 兜底
      console.warn(`[语音缓存] 第 ${section.slide} 页无可用音频，跳过`)
      return
    }
    // 设置字幕边界：每句文本 + 每句音频时长(ms) 累计
    this.subtitleSentences = audio.sentences.map((s) => s.text)
    let accMs = 0
    this.subtitleWeights = audio.sentences.map((s) => (accMs += s.durationMs))
    this.subtitleTotalMs = accMs
    this.subtitleUseDurationBoundary = true
    // 从打断句恢复时，字幕从该句开始；否则从头
    const startIndex = this.interruptedSentenceIndex >= 0 ? this.interruptedSentenceIndex : 0
    this.subtitleIndex = startIndex - 1
    // 立即显示起始句字幕（不等音频首帧的 sentenceStart 事件，消除首句字幕空窗）
    this.handleSentenceStart(startIndex)
    this.ctx.addHistory('assistant', audio.sentences.map((s) => s.text).join(' '))

    await speechSession.playPrecomputed(audio.sentences, { interruptible: true }, startIndex)
    if (this.interruptedDuringSpeak || this.stopRequested || !this.running) {
      // 被打断：记录当前播放到哪一句，供恢复时从该句继续
      if (this.interruptedDuringSpeak && !this.stopRequested) {
        this.interruptedSentenceIndex = this.subtitleIndex
      }
      return
    }

    // 讲解词播放完成：直接推进到下一页（提问/打断由 VAD 打断流程响应，这里不做页尾询问，
    // 避免"一直停在一页/不翻页"；领导调研场景应流畅逐页讲解）
    this.interruptedSentenceIndex = -1 // 正常播完，重置打断恢复位置
    if (this.sectionIndex < deck.sections.length - 1) {
      this.sectionIndex++
    } else {
      this.stopRequested = true // 最后一页讲完，结束
    }
  }

  /**
   * 语音合成失败时的降级播报：不出声，但字幕与聚光严格按**作者讲稿**逐句推进。
   * 时长按字数估算（中文约 4.5 字/秒），保证播放的始终是作者原文，
   * 而不是让 LLM 现编一段内容顶替——后者会让观众听到与讲稿无关的内容。
   */
  private async presentMuted(section: TourSection): Promise<void> {
    const deck = this.deck
    if (!deck) return
    const speech = (section.speech ?? []).filter((s) => s.text?.trim())
    if (speech.length === 0) return

    const pageNo = this.sectionIndex + 1
    console.warn(`[Tour] 第 ${pageNo} 页语音合成失败 → 静音播放作者讲稿（不回退 LLM）`)
    this.setState('presenting', t('tour.slideTtsFailed', { n: pageNo }))

    // 字幕由逐句索引驱动，不走"播放进度估算"（没有音频进度可估）
    this.subtitleSentences = speech.map((s) => s.text)
    this.subtitleUseDurationBoundary = true
    const startIndex = this.interruptedSentenceIndex >= 0 ? this.interruptedSentenceIndex : 0
    this.subtitleIndex = startIndex - 1
    this.handleSentenceStart(startIndex)
    this.ctx.addHistory('assistant', speech.map((s) => s.text).join(' '))

    for (let i = startIndex; i < speech.length; i++) {
      if (this.stopRequested || !this.running) return
      this.handleSentenceStart(i)
      // 按字数估算停留时长，限制在 1.5~12 秒之间
      const ms = Math.max(1500, Math.min(12000, (speech[i].text.length / 4.5) * 1000))
      const step = 200
      let waited = 0
      while (waited < ms) {
        if (this.stopRequested || !this.running) return
        if (this.interruptedDuringSpeak) {
          // 被打断：记录断点句，交回主循环处理（恢复后从该句继续）
          this.interruptedSentenceIndex = i
          return
        }
        await new Promise((r) => setTimeout(r, Math.min(step, ms - waited)))
        waited += step
      }
    }

    this.interruptedSentenceIndex = -1
    if (this.sectionIndex < deck.sections.length - 1) {
      this.sectionIndex++
    } else {
      this.stopRequested = true
    }
  }

  /** 打断后的暂停流：等用户输入 → 处理（支持连续追问）→ 恢复 */
  private async handleInterruptPause(): Promise<void> {
    // 遥控暂停（手机【暂停】/翻页/网页跳转触发的停止）：不进问答、不出声，静默等待【播放】指令
    if (this.remotePaused) {
      this.setState('paused')
      await new Promise<void>((resolve) => {
        this.remoteResumeWaiter = resolve
      })
      this.remoteResumeWaiter = null
      return
    }
    // 按下打断后进入"倾听中"状态：等待/倾听用户说话
    this.setState('listening', t('assistant.listeningTip'))
    speechSession.interrupt()
    // 进入对话处理：期间不响应新的 ASR 打断，避免用户后续话语反复打断 LLM 回答
    speechSession.setInConversation(true)
    try {
      // 首次等待：用户松开按钮且未说话 → '__resume__'；识别到话语 → 文本
      let text = await this.waitForUserInput(120000)
      while (!this.stopRequested && this.running) {
        // 沉默 / 松开按钮 / "继续"类指令 → 退出循环，恢复讲解
        if (!text || text === '__resume__' || isContinueCmd(text)) break
        // 暂停类指令（稍等/停一下）：用户要自己补充，暂停播报直到说"继续"或提出疑问
        if (isPauseCmd(text)) {
          this.setState('paused', t('assistant.holdTip'))
          await this.speak(t('assistant.holdOn'), false)
          text = null
          while (!this.stopRequested && this.running) {
            text = await this.waitForUserInput(120000)
            if (this.stopRequested || !this.running) return
            if (!text || text === '__resume__' || isContinueCmd(text)) break
            if (looksLikeQuestion(text)) break // 补充中提出疑问 → 转出回答
            text = null // 模糊补充 → 继续等"继续"
          }
          if (!text || text === '__resume__' || isContinueCmd(text)) break
          continue // 带着新问题回到主循环回答
        }
        // 只把【像真实问题】的输入交给大模型；模糊/寒暄直接当作继续，避免自由发挥
        if (!looksLikeQuestion(text)) break
        this.setState('answering')
        await this.respondToUser(text)
        if (this.stopRequested || !this.running) return
        // 回答完毕：允许连续追问；沉默超时 / 说"继续" / 松开按钮 → 恢复讲解
        this.setState('listening', t('assistant.askMoreTip'))
        // 若用户刚按按钮打断了回答播报（正在说话），跳过提示音，避免压住用户语音
        if (!this.interruptedDuringSpeak) {
          await this.speak(t('assistant.askMore'), false)
        }
        text = await this.waitForUserInput(10000)
      }
      this.setState('resuming')
      await this.speak(t('assistant.resume'), false)
    } finally {
      speechSession.setInConversation(false)
      // 打断已在本次暂停流中处理完毕：清除标志，避免主循环重复进入暂停流程。
      // 若遥控暂停在流程尾部（如"好，我们继续"播报中）到达，保留标志让主循环
      // 重新进入 handleInterruptPause → 走遥控暂停分支。
      this.interruptedDuringSpeak = this.remotePaused
    }
  }

  /** 处理用户话语：指令直接执行，问题则回答 */
  private async respondToUser(text: string): Promise<void> {
    this.ctx.addFocus(text.slice(0, 40))
    this.ctx.addHistory('user', text)
    this.emitData({ kind: 'chat', role: 'user', text })

    const resp = await llmClient.chat({
      system: QNA_SYSTEM + '\n\n' + appProfile(),
      messages: this.ctx.buildMessages(`听众说：「${text}」\n请处理：若是指令则调用工具，若是问题则直接回答。`),
      tools: TOUR_TOOLS as unknown as unknown[],
      onDelta: () => {}
    })

    if (resp.text) {
      await this.speakWithSubtitles(resp.text, true)
      this.ctx.addHistory('assistant', resp.text)
      this.emitData({ kind: 'chat', role: 'assistant', text: resp.text })
    }

    for (const tool of resp.toolCalls) {
      switch (tool.name) {
        case TourTool.GoNext: {
          if (this.sectionIndex < this.deck!.sections.length - 1) this.sectionIndex++
          break
        }
        case TourTool.GoPrev: {
          this.sectionIndex = Math.max(0, this.sectionIndex - 1)
          break
        }
        case TourTool.EndTour: {
          this.stopRequested = true
          break
        }
        default:
          break
      }
    }
  }

  /** 收尾总结 */
  private async finishTour(): Promise<void> {
    if (this.stopRequested) {
      // 正常停止/主动结束：回到初始化状态（end() 已做过清理，这里幂等兜底）
      this.setState('idle')
      this.running = false
      await browserController.clearSpotlight().catch(() => undefined)
      windowManager.closeBrowser()
      windowManager.restoreOrb()
      speechSession.setWakeMode(true)
      return
    }
    const deck = this.deck!
    this.setState('presenting')
    const resp = await llmClient.chat({
      system: PRESENT_SYSTEM,
      messages: this.ctx.buildMessages(`全部 ${deck.sections.length} 个区段已讲解完毕，请做一段简短的总结收尾（2~3 句话）。`),
      onDelta: () => {}
    })
    if (resp.text) {
      await this.speakWithSubtitles(resp.text, false)
    }
    this.setState('ended')
    this.running = false
    await browserController.clearSpotlight()
    windowManager.restoreOrb()
    speechSession.setWakeMode(true)
  }

  // ==================== 语音协同 ====================
  private async speak(text: string, interruptible: boolean): Promise<void> {
    const opts = interruptible ? {} : { interruptible: false }
    await speechSession.speak(text, opts)
  }

  /**
   * 带同步字幕的播报：整段合成一次（避免逐句 TTS 慢、卡顿），
   * 字幕由 audioWorker 的【实际播放进度】驱动，逐句切换、与语音同步。
   */
  private async speakWithSubtitles(text: string, interruptible: boolean): Promise<void> {
    if (!text) return
    // LLM 实时路径：字幕按"字符权重 × 播放进度"估算切句。
    // 必须显式关闭预合成的时长边界模式——上一页预合成会把它置 true 且不会自动复位，
    // 残留后 handlePlaybackProgress 直接 return，打断问答/总结播报时字幕卡在
    // 上一段内容不切换（语音与字幕不一致，恢复讲解后整体错位）。
    this.subtitleUseDurationBoundary = false
    // 记录本段短句、每句字符权重累计（按字符占比分配播放时长）与进度基准
    this.subtitleSentences = splitIntoSentences(text)
    let acc = 0
    this.subtitleWeights = this.subtitleSentences.map((s) => {
      acc += Math.max(1, Array.from(s.replace(/\s/g, '')).length)
      return acc
    })
    this.subtitleTotalMs = 0
    this.subtitleIndex = -1
    // 先显示第一句
    this.emitData({ kind: 'subtitle', text: this.subtitleSentences[0] ?? '', role: 'assistant' })
    this.subtitleIndex = 0
    await this.speak(text, interruptible)
    // 合成结束 → 段总时长已知，用于后续按进度切句
    this.subtitleTotalMs = speechSession.lastTotalMs
  }

  private buildContextBrief(): string {
    const ctx = this.ctx.get()
    if (!ctx) return ''
    const section = ctx.deck.sections[ctx.currentIndex]
    return [
      `主题: ${ctx.deck.title}`,
      `当前区段: ${section?.title ?? ''}`,
      `区段内容: ${(ctx.sectionText || section?.content || '').slice(0, 1500)}`,
      `已讲: ${ctx.presented.join('、')}`,
      `【应用背景知识】\n${appProfile()}`
    ].join('\n')
  }

  private waitForUserInput(timeoutMs: number): Promise<string | null> {
    // 用户已松开按钮（松开信号早于本次等待注册）→ 视为"继续"指令，避免等待空转
    if (this.bargeInReleased) {
      this.bargeInReleased = false
      return Promise.resolve('__resume__')
    }
    // 先消费缓冲：只接受本次打断之后到达的话语；打断前的陈旧文本（杂散语音/迟到的转写）
    // 直接丢弃，避免冒充本次提问导致"回答了上一个问题"
    if (this.pendingUserText) {
      const cached = this.pendingUserText
      this.pendingUserText = null
      if (cached.at >= this.interruptAt) {
        return Promise.resolve(cached.text)
      }
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.userInputWaiters.indexOf(w)
        if (idx >= 0) this.userInputWaiters.splice(idx, 1)
        resolve(null)
      }, timeoutMs)
      const w = (text: string | null): void => {
        clearTimeout(timer)
        resolve(text)
      }
      this.userInputWaiters.push(w)
    })
  }

  private resolveAllWaiters(text: string | null): void {
    let consumed = 0
    while (this.userInputWaiters.length) {
      this.userInputWaiters.shift()!(text)
      consumed++
    }
    // 若确实消费了 waiter，则本次"松开"信号已处理，清除遗留标记；
    // 若没有 waiter（松开早于等待注册），保留 bargeInReleased 供后续 waitForUserInput 消费
    if (consumed > 0 && text === '__resume__' && this.bargeInReleased) {
      this.bargeInReleased = false
    }
  }
}

/** "继续"类指令判断 */
function isContinueCmd(text: string): boolean {
  return /继续|接着|好的|好|嗯|是的|是|可以|讲吧|来吧/i.test(text)
}

/** "暂停/稍等"类指令判断：用户要自己补充说话，暂时停一下 */
function isPauseCmd(text: string): boolean {
  return /稍等|停一下|等一等|等一下|暂停|先别讲|等等|别急|我先说|先停|hold on|wait/i.test(text)
}

/**
 * 判断用户话语是否像【真实问题】（含问号/疑问词/够长），用于过滤"嗯/好/你好"等模糊输入，
 * 避免把它们交给大模型导致自由发挥产生不合适的字幕。
 */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[？?]/.test(t)) return true
  if (/为什么|怎么|如何|什么|哪个|哪|谁|多少|几|能否|可以|是不是|呢|吗|是否/.test(t)) return true
  if (t.length >= 8) return true
  return false
}

/**
 * 把一段讲解文本按中文/英文标点（。！？；，、：和换行）切分成若干短句。
 * 用于逐句同步播报：每句一个短句，字幕跟随语音一句句走。
 */
function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[。！？；，、：\n])/).map((s) => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts : [text]
}

export const tourEngine = new TourEngine()
