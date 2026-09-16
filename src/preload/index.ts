/** 渲染进程桥接层：类型化暴露主进程能力 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { SpeechEvent, TtsControlMessage } from '@shared/speech'
import type { TourStateEvent, TourDataEvent } from '@shared/tour'
import type { DeckScriptV2, PptDeckMeta, PptProgressEvent } from '@shared/ppt'
import type { AppConfig } from '../main/config/schema'

/** 应用版本号：构建时由 electron-vite 从 package.json 注入（见 electron.vite.config.ts） */
declare const __APP_VERSION__: string

const api = {
  /** 应用版本号（与 package.json 同步，构建时注入，无需手动维护） */
  appVersion: __APP_VERSION__,
  /**
   * 启动时的界面语言。同步取（sendSync）而非等 config.get() 的 Promise：
   * 页面脚本需要首帧就渲染正确语言，异步拿到会让英文模式先闪一下中文。
   */
  initialLang: ipcRenderer.sendSync(IPC.Config.GetLangSync) as string,
  window: {
    minimize: (): void => ipcRenderer.send(IPC.Window.OrbMinimize),
    restore: (): void => ipcRenderer.send(IPC.Window.OrbRestore),
    openSettings: (): void => ipcRenderer.send(IPC.Window.OpenSettings),
    openPpt: (): void => ipcRenderer.send(IPC.Window.OpenPpt),
    quit: (): void => ipcRenderer.send(IPC.Window.Quit),
    onOrbMinimized: (cb: (minimized: boolean) => void): void => {
      ipcRenderer.on(IPC.Window.OrbModeChanged, (_e, minimized: boolean) => cb(minimized))
    }
  },
  /** 无边框窗口的自定义标题栏：作用于调用方所在窗口 */
  windowCtl: {
    minimize: (): void => ipcRenderer.send(IPC.WindowCtl.Minimize),
    toggleMaximize: (): void => ipcRenderer.send(IPC.WindowCtl.ToggleMaximize),
    close: (): void => ipcRenderer.send(IPC.WindowCtl.Close),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WindowCtl.IsMaximized),
    /** 最大化状态变化（双击标题栏、Win+↑、拖到屏幕顶部等系统操作也会触发） */
    onMaximizedChanged: (cb: (maximized: boolean) => void): void => {
      ipcRenderer.on(IPC.WindowCtl.MaximizedChanged, (_e, maximized: boolean) => cb(maximized))
    }
  },
  subtitle: {
    hide: (): void => ipcRenderer.send(IPC.Window.SubtitleHide),
    setMode: (active: boolean): void => ipcRenderer.send(IPC.Window.SubtitleMode, active),
    /** 按内容高度自适应窗口高度（字幕窗口专用） */
    fit: (height: number): void => ipcRenderer.send(IPC.Subtitle.Fit, height)
  },
  clipboard: {
    copy: (text: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.Clipboard.WriteText, text)
  },
  speech: {
    start: (): Promise<boolean> => ipcRenderer.invoke(IPC.Speech.Start),
    stop: (): Promise<boolean> => ipcRenderer.invoke(IPC.Speech.Stop),
    toggleWake: (on: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.Speech.ToggleWake, on),
    ask: (text: string): Promise<string | null> => ipcRenderer.invoke(IPC.Speech.Ask, text),
    onEvent: (cb: (ev: SpeechEvent) => void): void => {
      const handler = (_e: Electron.IpcRendererEvent, ev: SpeechEvent): void => cb(ev)
      ipcRenderer.on(IPC.Speech.Event, handler)
    },
    // ---- audioWorker 专用 ----
    onTtsFrame: (cb: (frame: { buffer: Uint8Array | ArrayBuffer; sampleRate: number; seq: number; sentenceIndex?: number }) => void): void => {
      ipcRenderer.on(IPC.Speech.TtsFrame, (_e, frame) => cb(frame))
    },
    onTtsControl: (cb: (msg: TtsControlMessage) => void): void => {
      ipcRenderer.on(IPC.Speech.TtsControl, (_e, msg) => cb(msg))
    },
    sendAudioFrame: (buffer: ArrayBuffer, sampleRate: number): void => {
      ipcRenderer.send(IPC.Speech.AudioFrame, { buffer, sampleRate })
    },
    sendAudioEvent: (ev: { type: string; db?: number }): void => {
      ipcRenderer.send(IPC.Speech.AudioEvent, ev)
    },
    /** 音频播放进度上报（供主进程做字幕与语音同步） */
    /** seq = 当前播报段号，主进程据此丢弃上一段迟到的信号 */
    sendPlaybackProgress: (playedMs: number, seq?: number): void => {
      ipcRenderer.send(IPC.Speech.PlaybackEvent, { playedMs, seq })
    },
    /** 某句音频开始播放时上报句索引（供主进程显示对应字幕） */
    sendSentenceStart: (index: number, seq?: number): void => {
      ipcRenderer.send(IPC.Speech.PlaybackEvent, { sentenceIndex: index, seq })
    },
    /** 整段音频播放完成时上报（供主进程确认播完再翻页） */
    sendPlaybackEnd: (seq?: number): void => {
      ipcRenderer.send(IPC.Speech.PlaybackEvent, { playbackEnded: true, seq })
    },
    /** ASR 就绪：补发麦克风缓冲音频（唤醒词补听） */
    onAsrStarted: (cb: () => void): void => {
      ipcRenderer.on(IPC.Speech.AsrStarted, (_e) => cb())
    }
  },
  tour: {
    start: (args: { scriptFile?: string; deckId?: string }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.Tour.Start, args),
    next: (): Promise<void> => ipcRenderer.invoke(IPC.Tour.Next),
    prev: (): Promise<void> => ipcRenderer.invoke(IPC.Tour.Prev),
    pause: (): Promise<void> => ipcRenderer.invoke(IPC.Tour.Pause),
    resume: (): Promise<void> => ipcRenderer.invoke(IPC.Tour.Resume),
    end: (): Promise<void> => ipcRenderer.invoke(IPC.Tour.End),
    onStateChanged: (cb: (ev: TourStateEvent) => void): void => {
      ipcRenderer.on(IPC.Tour.StateChanged, (_e, ev: TourStateEvent) => cb(ev))
    },
    onData: (cb: (ev: TourDataEvent) => void): void => {
      ipcRenderer.on(IPC.Tour.Data, (_e, ev: TourDataEvent) => cb(ev))
    }
  },
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.Config.Get),
    set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.Config.Set, key, value),
    setMany: (partial: Partial<AppConfig>): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.Config.SetMany, partial),
    onChange: (cb: (cfg: AppConfig) => void): void => {
      ipcRenderer.on(IPC.Config.Changed, (_e, cfg: AppConfig) => cb(cfg))
    }
  },
  ppt: {
    open: (file: string): Promise<{ success: boolean; slideCount?: number; error?: string }> =>
      ipcRenderer.invoke(IPC.Ppt.Open, file),
    goSlide: (n: number): Promise<unknown> => ipcRenderer.invoke(IPC.Ppt.GoSlide, n),
    prev: (): Promise<unknown> => ipcRenderer.invoke(IPC.Ppt.Prev),
    next: (): Promise<unknown> => ipcRenderer.invoke(IPC.Ppt.Next),
    close: (): Promise<unknown> => ipcRenderer.invoke(IPC.Ppt.Close),
    loadDeck: (file?: string): Promise<unknown> => ipcRenderer.invoke(IPC.Ppt.LoadDeck, file)
  },
  pptLib: {
    list: (): Promise<{ activeDeckId: string; decks: PptDeckMeta[] }> =>
      ipcRenderer.invoke(IPC.PptLib.List),
    setActive: (deckId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.SetActive, deckId),
    /** cancelled = 用户在文件对话框点了取消，调用方应静默忽略而非报错 */
    importDeck: (args: { kind: 'pdf' | 'images'; name?: string; genScript?: boolean; prompt?: string }): Promise<{ ok: boolean; deck?: PptDeckMeta; cancelled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.Import, args),
    remove: (deckId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.Delete, deckId),
    rename: (deckId: string, name: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.Rename, deckId, name),
    genScript: (args: { deckId: string; prompt?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.GenScript, args),
    getScript: (deckId: string): Promise<{ script: DeckScriptV2 | null; slideCount: number; name: string }> =>
      ipcRenderer.invoke(IPC.PptLib.GetScript, deckId),
    saveScript: (deckId: string, script: DeckScriptV2): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.SaveScript, deckId, script),
    importScript: (deckId: string): Promise<{ ok: boolean; script?: DeckScriptV2 | null; cancelled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.ImportScript, deckId),
    slideImage: (args: { deckId: string; slide: number; thumb?: boolean }): Promise<string> =>
      ipcRenderer.invoke(IPC.PptLib.SlideImage, args),
    exportVideo: (deckId: string): Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PptLib.ExportVideo, deckId),
    onProgress: (cb: (ev: PptProgressEvent) => void): void => {
      ipcRenderer.on(IPC.PptLib.Progress, (_e, ev: PptProgressEvent) => cb(ev))
    }
  },
  phone: {
    getInfo: (): Promise<{
      enabled: boolean
      audioOutput: boolean
      port: number
      urls: string[]
      qrDataUrl: string
      connected: number
      error: string | null
      detectedIps: string[]
    }> => ipcRenderer.invoke(IPC.Phone.GetInfo),
    setEnabled: (on: boolean): Promise<{ ok: boolean; error?: string; info?: unknown }> =>
      ipcRenderer.invoke(IPC.Phone.SetEnabled, on),
    onStatus: (cb: (s: {
      enabled?: boolean
      audioOutput?: boolean
      urls?: string[]
      qrDataUrl?: string
      connected?: number
      error?: string | null
      detectedIps?: string[]
    }) => void): void => {
      ipcRenderer.on(IPC.Phone.Status, (_e, s) => cb(s))
    }
  }
}

export type OpsApi = typeof api

contextBridge.exposeInMainWorld('ops', api)
