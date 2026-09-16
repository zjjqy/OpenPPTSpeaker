/** OpenPPTSpeaker —— 主进程入口 */

import { app, session, BrowserWindow, globalShortcut } from 'electron'
import { windowManager } from './windows/WindowManager'
import { registerIpc } from './ipc/register'
import { speechSession } from './speech/SpeechSession'
import { phoneBridgeServer } from './phone/PhoneBridgeServer'
import { tourEngine } from './tour/TourEngine'
import { configStore } from './config/ConfigStore'
import { pptLibrary } from './ppt/PptLibrary'
import { IPC } from '@shared/ipc'

/** 应用版本号：构建时由 electron-vite 从 package.json 注入（见 electron.vite.config.ts） */
declare const __APP_VERSION__: string

// ===== 渲染稳定性 =====
app.commandLine.appendSwitch('disable-background-timer-throttling')
// 隐藏窗口播放 TTS：禁止自动播放策略拦截，保证 AudioContext 可直接出声
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let wakeIdleTimer: NodeJS.Timeout | null = null

function clearWakeTimer(): void {
  if (wakeIdleTimer) {
    clearTimeout(wakeIdleTimer)
    wakeIdleTimer = null
  }
}

/**
 * 空闲状态下的语音命令判断：用户唤醒后说"讲解PPT / 开始讲解 / 讲演示文稿"等，
 * 直接启动 PPT 讲演，而不必用鼠标点悬浮球菜单。
 */
function isStartPptCmd(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /讲解.*(ppt|pp t|演示文稿|幻灯片|幻灯片讲解)|开始讲解|讲一下ppt|讲ppt|打开ppt|讲演示文稿|讲幻灯片|开始(讲解|讲演)/i.test(t)
}

function wireEvents(): void {
  // 语音事件 → 渲染层（悬浮球/字幕）
  speechSession.on((ev) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.Speech.Event, ev)
      }
    }
  })

  // 讲解状态/数据 → 渲染层
  // 注意：isDestroyed() 检查与 send() 之间存在竞态（窗口可能刚好被销毁，
  // 例如每次开讲都会重建讲解窗口），send 会抛 "Object has been destroyed" 并中断调用方
  // （曾在讲解启动失败的错误处理中触发，导致清理代码不执行）。故逐个 try/catch。
  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      try {
        win.webContents.send(channel, payload)
      } catch {
        /* 窗口刚好销毁，忽略 */
      }
    }
  }

  tourEngine.onState((ev) => {
    broadcast(IPC.Tour.StateChanged, ev)
  })
  tourEngine.onData((ev) => {
    broadcast(IPC.Tour.Data, ev)
  })

  // 唤醒：唤出主界面（悬浮球）+ 问候 + 进入短暂交互
  speechSession.onWakeup = async () => {
    windowManager.showOrb()
    speechSession.setWakeMode(false)
    clearWakeTimer()
    await speechSession.speak('您好，我是 OpenPPTSpeaker 讲演助手。请问需要我讲解哪份演示？')
    // 30 秒无话语自动回到唤醒监听
    wakeIdleTimer = setTimeout(() => {
      if (tourEngine.state === 'idle') {
        speechSession.setWakeMode(true)
      }
    }, 30000)
  }

  // 空闲状态下，语音命令"讲解PPT/开始讲解"直接启动 PPT 讲演；
  // 其余话语仍交回 TourEngine（讲解中处理指令/问答）。
  const origUserUtterance = speechSession.onUserUtterance
  speechSession.onUserUtterance = (text) => {
    if (tourEngine.state === 'idle' && isStartPptCmd(text)) {
      // 语音里带 PPT 名称（如"讲解产品介绍"）→ 直接讲对应 deck；否则讲当前活动 deck
      const target = pptLibrary
        .list()
        .find((d) => d.source !== 'builtin' && d.name && d.name !== '未命名演示' && text.includes(d.name))
      console.log(`[语音命令] 识别到讲解指令: "${text}"，启动 PPT 讲演${target ? `（匹配到「${target.name}」）` : ''}`)
      void tourEngine.startDeck(target ? { deckId: target.id } : {})
      return
    }
    origUserUtterance?.(text)
  }
}

app.whenReady().then(() => {
  // 醒目标识：用户重启时一眼能确认是不是新版本
  console.log(`\n========== OpenPPTSpeaker v${__APP_VERSION__} 启动 ==========`)
  console.log(`[OPS] 启动时间：${new Date().toISOString()}`)
  console.log(`[OPS] Electron ${process.versions.electron} / Node ${process.versions.node}`)
  console.log(`[OPS] userData: ${app.getPath('userData')}`)
  console.log(`================================================\n`)

  // ====== 麦克风权限 ======
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    // 麦克风在 Electron 中对应 'media' 权限；剪贴板写入用于"复制地址"按钮
    if (permission === 'media' || permission === 'clipboard-sanitized-write') {
      callback(true)
    } else {
      callback(false)
    }
  })

  registerIpc()
  wireEvents()
  pptLibrary.init()

  windowManager.createAll()

  // F12 打开/关闭当前窗口的 DevTools（窗口内 before-input-event 已做兜底）
  const ok = globalShortcut.register('F12', () => windowManager.toggleDevTools())
  console.log(`[OPS] F12 DevTools 全局快捷键注册${ok ? '成功' : '失败（被其他程序占用，改用窗口内监听）'}`)

  // 启动语音会话（若已配置 Key）
  if (configStore.hasApiKey() && configStore.get('enableWake')) {
    void speechSession.start()
  }

  // 启动手机桥接（若已开启）
  if (configStore.get('phoneBridgeEnabled')) {
    void phoneBridgeServer.start().catch((e) => {
      console.error('[手机桥接] 启动失败:', e.message)
    })
  }

  windowManager.orbWindow?.show()

  app.on('activate', () => {
    windowManager.orbWindow?.show()
  })
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  phoneBridgeServer.stop()
  windowManager.setQuitting()
  clearWakeTimer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// GPU 崩溃自动重启
app.on('gpu-process-crashed', () => {
  app.relaunch()
  app.exit()
})
