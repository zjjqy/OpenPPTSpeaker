/** 集中注册所有 IPC Handler */

import { ipcMain, app, clipboard, dialog, nativeImage, BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { IPC } from '@shared/ipc'
import { configStore, notifyConfigChanged } from '../config/ConfigStore'
import { speechSession } from '../speech/SpeechSession'
import { phoneBridgeServer } from '../phone/PhoneBridgeServer'
import { tourEngine } from '../tour/TourEngine'
import { windowManager } from '../windows/WindowManager'
import { llmClient } from '../ai/LlmClient'
import * as pptCtrl from '../ppt/ppt-control'
import { loadSlideDeck } from '../tour/deckLoader'
import { APP_PROFILE } from '../tour/assistantProfile'
import { pptLibrary } from '../ppt/PptLibrary'
import { importPdf, importImages } from '../ppt/PptImporter'
import { generateScript } from '../ppt/ScriptGenerator'
import { exportVideo } from '../ppt/VideoExporter'
import type { DeckScriptV2, PptProgressEvent } from '@shared/ppt'

/** 广播 PPT 相关进度到所有窗口 */
function broadcastPptProgress(ev: PptProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.PptLib.Progress, ev)
  }
}

export function registerIpc(): void {
  // ==================== 配置 ====================
  ipcMain.handle(IPC.Config.Get, () => configStore.getAll())
  ipcMain.handle(IPC.Config.Set, (_e, key: string, value: unknown) => {
    configStore.set(key as never, value as never)
    // 讲解中改悬浮球位置即时生效（仅需重新停放，不必等下次讲解）
    if (key === 'orbPosition') windowManager.applyOrbDock()
    notifyConfigChanged()
    return configStore.getAll()
  })
  ipcMain.handle(IPC.Config.SetMany, (_e, partial: Record<string, unknown>) => {
    configStore.setMany(partial as never)
    if ('orbPosition' in partial) windowManager.applyOrbDock()
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
      const reply = await llmClient.ask(text, '', '你是 OpenPPTSpeaker，一位友好的开源讲演助手。\n\n' + APP_PROFILE)
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
              title: '选择 PDF 文件',
              filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
              properties: ['openFile']
            })
          : await dialog.showOpenDialog(win!, {
              title: '选择页面图片（多选，按文件名排序）',
              filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
              properties: ['openFile', 'multiSelections']
            })
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false as const, error: '已取消' }

      try {
        const result =
          args.kind === 'pdf'
            ? await importPdf(picked.filePaths[0], args.name ?? '', (done, total) =>
                broadcastPptProgress({ deckId: '', stage: 'convert', done, total, message: `转换页面 ${done}/${total}…` })
              )
            : await importImages(picked.filePaths, args.name ?? '', (done, total) =>
                broadcastPptProgress({ deckId: '', stage: 'convert', done, total, message: `导入图片 ${done}/${total}…` })
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
        throw new Error('演讲稿格式不正确（需要 version: 2）')
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
      title: '选择演讲稿 JSON',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false as const, error: '已取消' }
    try {
      const raw = JSON.parse(readFileSync(picked.filePaths[0], 'utf-8').replace(/^﻿/, '')) as DeckScriptV2
      if (raw?.version !== 2 || !Array.isArray(raw.slides)) {
        throw new Error('演讲稿格式不正确（需要 version: 2 的新格式，含 slides 数组）')
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
    if (!meta) return { ok: false as const, error: 'PPT 不存在' }
    const win =
        BrowserWindow.getFocusedWindow() ?? windowManager.pptWindow ?? windowManager.settingsWindow ?? undefined
    const picked = await dialog.showSaveDialog(win!, {
      title: '导出讲解视频',
      defaultPath: `${meta.name}.mp4`,
      filters: [{ name: 'MP4 视频', extensions: ['mp4'] }]
    })
    if (picked.canceled || !picked.filePath) return { ok: false as const, error: '已取消' }
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
