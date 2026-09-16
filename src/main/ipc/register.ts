/** 集中注册所有 IPC Handler */

import { ipcMain, app, clipboard, dialog, nativeImage, BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { IPC } from '@shared/ipc'
import { setLang, t } from '@shared/i18n'
import { configStore, notifyConfigChanged } from '../config/ConfigStore'
import { speechSession } from '../speech/SpeechSession'
import { phoneBridgeServer } from '../phone/PhoneBridgeServer'
import { tourEngine } from '../tour/TourEngine'
import { windowManager } from '../windows/WindowManager'
import { llmClient } from '../ai/LlmClient'
import * as pptCtrl from '../ppt/ppt-control'
import { loadSlideDeck } from '../tour/deckLoader'
import { appProfile } from '../tour/assistantProfile'
import { pptLibrary } from '../ppt/PptLibrary'
import { importPdf, importImages } from '../ppt/PptImporter'
import { generateScript } from '../ppt/ScriptGenerator'
import { exportVideo } from '../ppt/VideoExporter'
import type { DeckScriptV2, PptProgressEvent } from '@shared/ppt'
import {
  DEFAULT_EDGE_VOICE,
  LANG_TO_VOICE_LANG,
  edgeVoiceLang
} from '../config/schema'

/** 广播 PPT 相关进度到所有窗口 */
function broadcastPptProgress(ev: PptProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.PptLib.Progress, ev)
  }
}

/**
 * 语言切换的连带处理。
 *
 * 1. 同步主进程 i18n（托盘菜单、窗口标题、文件对话框标题都在主进程取词）
 * 2. Edge 音色跟随语言：当前音色不属于新语言时切到该语言的默认音色。
 *    否则会出现「英文界面 + 中文音色」这种念不出英文的组合。
 * 3. 重刷主进程持有的文案
 *
 * 必须在 notifyConfigChanged() 之前调用，保证渲染层收到的是最终配置。
 */
function applyLanguageChange(): void {
  const lang = configStore.get('language')
  setLang(lang)
  const target = LANG_TO_VOICE_LANG[lang]
  if (configStore.get('ttsEngine') === 'edge' && edgeVoiceLang(configStore.get('edgeVoice')) !== target) {
    configStore.set('edgeVoice', DEFAULT_EDGE_VOICE[target])
  }
  windowManager.refreshLocale()
}

export function registerIpc(): void {
  // ==================== 配置 ====================
  ipcMain.handle(IPC.Config.Get, () => configStore.getAll())
  // 同步返回语言：preload 在页面脚本执行前调用，保证渲染层首帧语言正确
  ipcMain.on(IPC.Config.GetLangSync, (e) => {
    e.returnValue = configStore.get('language')
  })
  ipcMain.handle(IPC.Config.Set, (_e, key: string, value: unknown) => {
    configStore.set(key as never, value as never)
    // 讲解中改悬浮球位置即时生效（仅需重新停放，不必等下次讲解）
    if (key === 'orbPosition') windowManager.applyOrbDock()
    if (key === 'language') applyLanguageChange()
    notifyConfigChanged()
    return configStore.getAll()
  })
  ipcMain.handle(IPC.Config.SetMany, (_e, partial: Record<string, unknown>) => {
    configStore.setMany(partial as never)
    if ('orbPosition' in partial) windowManager.applyOrbDock()
    if ('language' in partial) applyLanguageChange()
    notifyConfigChanged()
    return configStore.getAll()
  })

  // ==================== 语音 ====================
  ipcMain.handle(IPC.Speech.Start, async () => {
    await speechSession.start()
    return true
  })
  ipcMain.handle(IPC.Speech.Stop, async () => {
    await speechSession.stop()
    return true
  })
  ipcMain.handle(IPC.Speech.ToggleWake, (_e, on: boolean) => {
    speechSession.setWakeMode(on)
    return on
  })
  ipcMain.handle(IPC.Speech.Ask, async (_e, text: string) => {
    // 空闲状态下的直接提问
    if (tourEngine.state === 'idle') {
      const reply = await llmClient.ask(text, '', t('assistant.persona') + '\n\n' + appProfile())
      await speechSession.speak(reply)
      return reply
    }
    return null
  })

  // audioWorker 上行：PCM 帧（电脑端收音开关关闭时忽略；手机在线时也忽略，避免双路收音）
  ipcMain.on(IPC.Speech.AudioFrame, (_e, frame: { buffer: ArrayBuffer; sampleRate: number }) => {
    if (!configStore.get('pcMicEnabled')) return
    if (phoneBridgeServer.connected) return
    speechSession.onAudioFrame(Buffer.from(frame.buffer))
  })
  // audioWorker 上行：采集事件
  ipcMain.on(IPC.Speech.AudioEvent, (_e, ev: { type: string; db?: number }) => {
    speechSession.onAudioEvent(ev)
  })
  // audioWorker 上行：播放进度 / 句开始播放（用于字幕与语音同步）
  ipcMain.on(
    IPC.Speech.PlaybackEvent,
    (_e, d: { playedMs?: number; sentenceIndex?: number; playbackEnded?: boolean; seq?: number }) => {
      if (d?.playbackEnded) {
        speechSession.onPlaybackEnded(d?.seq)
      } else if (typeof d?.sentenceIndex === 'number') {
        speechSession.onSentenceStartReport(d.sentenceIndex, d?.seq)
      } else {
        speechSession.onPlaybackProgressReport(d?.playedMs ?? 0, d?.seq)
      }
    }
  )

  // ==================== 讲解 ====================
  ipcMain.handle(IPC.Tour.Start, async (_e, args: { scriptFile?: string; deckId?: string }) => {
    return tourEngine.startDeck(args ?? {})
  })
  ipcMain.handle(IPC.Tour.Next, () => tourEngine.next())
  ipcMain.handle(IPC.Tour.Prev, () => tourEngine.prev())
  ipcMain.handle(IPC.Tour.Pause, () => tourEngine.remotePause())
  ipcMain.handle(IPC.Tour.Resume, () => tourEngine.resume())
  ipcMain.handle(IPC.Tour.End, () => tourEngine.end())
  ipcMain.handle(IPC.Tour.Interrupt, () => tourEngine.stop())

  // ==================== 窗口 ====================
  ipcMain.on(IPC.Window.OrbMinimize, () => {
    // 讲解过程中禁止收起到托盘（即使渲染层按钮被绕过也兜底拦截）
    if (tourEngine.state !== 'idle' && tourEngine.state !== 'ended') return
    windowManager.orbWindow?.hide()
  })
  ipcMain.on(IPC.Window.OrbRestore, () => windowManager.restoreOrb())
  ipcMain.on(IPC.Window.OpenSettings, () => windowManager.openSettings())
  ipcMain.on(IPC.Window.OpenPpt, () => windowManager.openPptWindow())
  ipcMain.on(IPC.Window.Quit, () => {
    windowManager.setQuitting()
    void tourEngine.stop()
    void speechSession.stop()
    windowManager.orbWindow?.destroy()
    windowManager.orbWindow = null
    windowManager.subtitleWindow?.destroy()
    windowManager.audioWorker?.destroy()
    app.quit()
  })

  // ==================== 无边框窗口的自定义标题栏 ====================
  // 以「事件来源窗口」为目标，设置窗与 PPT 窗共用同一套按钮，不必按窗口区分通道
  ipcMain.on(IPC.WindowCtl.Minimize, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.WindowCtl.ToggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.WindowCtl.Close, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle(IPC.WindowCtl.IsMaximized, (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })

  // ==================== 剪贴板 ====================
  // 字幕窗口按内容高度自适应（字幕样式可调字号/行高，固定高度会裁剪）
  ipcMain.on(IPC.Subtitle.Fit, (_e, h: number) => {
    windowManager.resizeSubtitle(typeof h === 'number' ? h : 0)
  })

  ipcMain.handle(IPC.Clipboard.WriteText, (_e, text: string) => {
    try {
      clipboard.writeText(String(text ?? ''))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message ?? String(e) }
    }
  })

  // ==================== 手机桥接 ====================
  ipcMain.handle(IPC.Phone.GetInfo, () => phoneBridgeServer.getInfo())
  ipcMain.handle(IPC.Phone.SetEnabled, async (_e, on: boolean) => {
    configStore.set('phoneBridgeEnabled', on)
    notifyConfigChanged()
    if (on) {
      try {
        await phoneBridgeServer.start()
        return { ok: true as const, info: await phoneBridgeServer.getInfo() }
      } catch (e) {
        phoneBridgeServer.stop()
        return { ok: false as const, error: (e as Error).message }
      }
    }
    phoneBridgeServer.stop()
    return { ok: true as const, info: await phoneBridgeServer.getInfo() }
  })

  // ==================== PPT（旧版 COM 操控，保留） ====================
  ipcMain.handle(IPC.Ppt.Open, (_e, file: string) => {
    const r = pptCtrl.openPPT(file)
    if (r.success) windowManager.minimizeOrb()
    return r
  })
  ipcMain.handle(IPC.Ppt.GoSlide, (_e, n: number) => pptCtrl.goToSlide(n))
  ipcMain.handle(IPC.Ppt.Prev, () => pptCtrl.prevSlide())
  ipcMain.handle(IPC.Ppt.Next, () => pptCtrl.nextSlide())
  ipcMain.handle(IPC.Ppt.Close, () => {
    const r = pptCtrl.closePPT()
    windowManager.restoreOrb()
    return r
  })
  ipcMain.handle(IPC.Ppt.LoadDeck, (_e, scriptFile?: string) => loadSlideDeck(scriptFile))

  // ==================== PPT 库 ====================
  ipcMain.handle(IPC.PptLib.List, () => ({
    activeDeckId: pptLibrary.getActiveId(),
    decks: pptLibrary.list()
  }))

  ipcMain.handle(IPC.PptLib.SetActive, (_e, deckId: string) => {
    pptLibrary.setActive(deckId)
    return { ok: true as const }
  })

  /** 导入：打开对话框选 PDF（单选）或图片（多选）→ 转页面图 → 可选生成讲稿 */
  ipcMain.handle(
    IPC.PptLib.Import,
    async (
      _e,
      args: { kind: 'pdf' | 'images'; name?: string; genScript?: boolean; prompt?: string }
    ) => {
      const win =
        BrowserWindow.getFocusedWindow() ?? windowManager.pptWindow ?? windowManager.settingsWindow ?? undefined
      const picked =
        args.kind === 'pdf'
          ? await dialog.showOpenDialog(win!, {
              title: t('dlg.choosePdf'),
              filters: [{ name: t('dlg.pdfDocs'), extensions: ['pdf'] }],
              properties: ['openFile']
            })
          : await dialog.showOpenDialog(win!, {
              title: t('dlg.chooseImages'),
              filters: [{ name: t('dlg.images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
              properties: ['openFile', 'multiSelections']
            })
      if (picked.canceled || picked.filePaths.length === 0) {
        return { ok: false as const, cancelled: true, error: t('tip.cancelled') }
      }

      try {
        const result =
          args.kind === 'pdf'
            ? await importPdf(picked.filePaths[0], args.name ?? '', (done, total) =>
                broadcastPptProgress({
                  deckId: '',
                  stage: 'convert',
                  done,
                  total,
                  message: t('progress.convert', { done, total })
                })
              )
            : await importImages(picked.filePaths, args.name ?? '', (done, total) =>
                broadcastPptProgress({
                  deckId: '',
                  stage: 'convert',
                  done,
                  total,
                  message: t('progress.importImages', { done, total })
                })
              )
        const deckId = result.deck.id

        // 勾选"生成演讲稿" → 逐页调用大模型
        if (args.genScript) {
          await generateScript(deckId, {
            prompt: args.prompt,
            onProgress: (done, total, message) =>
              broadcastPptProgress({ deckId, stage: 'script', done, total, message })
          })
        }
        pptLibrary.setActive(deckId)
        return { ok: true as const, deck: pptLibrary.get(deckId) }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle(IPC.PptLib.Delete, (_e, deckId: string) => {
    try {
      pptLibrary.delete(deckId)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle(IPC.PptLib.Rename, (_e, deckId: string, name: string) => {
    try {
      pptLibrary.rename(deckId, name)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle(IPC.PptLib.GenScript, async (_e, args: { deckId: string; prompt?: string }) => {
    try {
      await generateScript(args.deckId, {
        prompt: args.prompt,
        onProgress: (done, total, message) =>
          broadcastPptProgress({ deckId: args.deckId, stage: 'script', done, total, message })
      })
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle(IPC.PptLib.GetScript, (_e, deckId: string) => ({
    script: pptLibrary.readScript(deckId),
    slideCount: pptLibrary.get(deckId)?.slideCount ?? 0,
    name: pptLibrary.get(deckId)?.name ?? ''
  }))

  ipcMain.handle(IPC.PptLib.SaveScript, (_e, deckId: string, script: DeckScriptV2) => {
    try {
      if (!script || script.version !== 2 || !Array.isArray(script.slides)) {
        throw new Error(t('err.scriptFormat'))
      }
      pptLibrary.writeScript(deckId, script)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  /** 导入演讲稿 JSON：对话框选文件 → 校验 v2 结构 → 保存 */
  ipcMain.handle(IPC.PptLib.ImportScript, async (_e, deckId: string) => {
    const win =
        BrowserWindow.getFocusedWindow() ?? windowManager.pptWindow ?? windowManager.settingsWindow ?? undefined
    const picked = await dialog.showOpenDialog(win!, {
      title: t('dlg.chooseScript'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false as const, error: '已取消' }
    try {
      const raw = JSON.parse(readFileSync(picked.filePaths[0], 'utf-8').replace(/^﻿/, '')) as DeckScriptV2
      if (raw?.version !== 2 || !Array.isArray(raw.slides)) {
        throw new Error(t('err.scriptFormatFull'))
      }
      pptLibrary.writeScript(deckId, raw)
      return { ok: true as const, script: pptLibrary.readScript(deckId) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  /** 页面图片 dataURL：thumb=true 时缩放为 360px 宽缩略图 */
  ipcMain.handle(IPC.PptLib.SlideImage, (_e, args: { deckId: string; slide: number; thumb?: boolean }) => {
    const file = pptLibrary.slideImagePath(args.deckId, args.slide)
    if (!existsSync(file)) return ''
    try {
      const img = nativeImage.createFromPath(file)
      if (img.isEmpty()) return ''
      const out = args.thumb ? img.resize({ width: 360, quality: 'good' }) : img
      return out.toDataURL()
    } catch {
      return ''
    }
  })

  ipcMain.handle(IPC.PptLib.ExportVideo, async (_e, deckId: string) => {
    const meta = pptLibrary.get(deckId)
    if (!meta) return { ok: false as const, error: t('err.deckMissing') }
    const win =
        BrowserWindow.getFocusedWindow() ?? windowManager.pptWindow ?? windowManager.settingsWindow ?? undefined
    const picked = await dialog.showSaveDialog(win!, {
      title: t('dlg.exportVideo'),
      defaultPath: `${meta.name}.mp4`,
      filters: [{ name: t('dlg.mp4'), extensions: ['mp4'] }]
    })
    if (picked.canceled || !picked.filePath) {
      return { ok: false as const, cancelled: true, error: t('tip.cancelled') }
    }
    try {
      const out = await exportVideo(deckId, picked.filePath, {
        onProgress: (done, total, message) =>
          broadcastPptProgress({ deckId, stage: 'video', done, total, message })
      })
      return { ok: true as const, path: out }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })
}
