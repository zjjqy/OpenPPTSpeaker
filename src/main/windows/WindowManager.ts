/** 窗口管理器：悬浮球 / 字幕 / 音频工作窗 / 讲解浏览器窗 / 设置窗 / PPT 管理窗 */

import { BrowserWindow, screen, nativeImage, Tray, Menu, app, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { t } from '@shared/i18n'
import { configStore } from '../config/ConfigStore'
import type { OrbPosition } from '../config/schema'

export class WindowManager {
  orbWindow: BrowserWindow | null = null
  subtitleWindow: BrowserWindow | null = null
  audioWorker: BrowserWindow | null = null
  browserWindow: BrowserWindow | null = null
  settingsWindow: BrowserWindow | null = null
  /** PPT 管理 / 讲稿编辑窗口 */
  pptWindow: BrowserWindow | null = null
  /** 悬浮球可见性变更回调（手机端"隐藏/显示托盘"按钮状态同步用） */
  onOrbVisibilityChanged: ((visible: boolean) => void) | null = null
  tray: Tray | null = null

  /** 当前讲解窗口是否为本地 HTML（PPT 转换） */
  isLocalDeck = false
  /** 悬浮球是否处于"迷你讲解模式" */
  orbMinimized = false

  private isQuitting = false
  private readonly preloadPath = join(__dirname, '../preload/index.js')

  /** 迷你悬浮球尺寸 */
  private readonly miniW = 220
  private readonly miniH = 240
  /**
   * 悬浮球是否因"讲解中不显示"设置而被本管理器隐藏。
   * 用于与【用户主动收起到托盘】区分：后者讲解结束后不应被自动弹回。
   */
  private orbHiddenBySetting = false

  /**
   * 无边框窗口的最大化状态同步。
   *
   * 最大化不只由标题栏按钮触发：双击标题栏、Win+↑、拖到屏幕顶端、系统右键菜单
   * 都会改变状态，所以必须监听窗口事件回推给渲染层，而不是只在点击时翻转图标。
   */
  private attachFramelessChrome(win: BrowserWindow): void {
    const notify = (): void => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.WindowCtl.MaximizedChanged, win.isMaximized())
      }
    }
    win.on('maximize', notify)
    win.on('unmaximize', notify)
  }

  /** 窗口内 F12 兜底：无论全局快捷键是否注册成功，窗口聚焦时按 F12 必生效 */
  private attachDevToolsShortcut(win: BrowserWindow): void {
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        if (win.webContents.isDevToolsOpened()) {
          win.webContents.closeDevTools()
        } else {
          win.webContents.openDevTools({ mode: 'detach' })
        }
      }
    })
  }

  createAll(): void {
    this.createOrbWindow()
    this.createSubtitleWindow()
    this.createAudioWorker()
    this.createTray()
  }

  // ==================== 悬浮球 ====================
  createOrbWindow(): void {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const winW = 420
    const winH = 540

    this.orbWindow = new BrowserWindow({
      width: winW,
      height: winH,
      x: Math.round((sw - winW) / 2),
      y: Math.round((sh - winH) / 2),
      frame: false,
      transparent: true,
      // 不常驻置顶（避免遮挡设置/文件选择等窗口）；仅讲解迷你模式期间置顶（minimizeOrb 中开启）
      alwaysOnTop: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    this.orbWindow.loadFile(join(__dirname, '../renderer/orb.html'))

    // 悬浮球可见性变更 → 通知订阅方（手机端按钮状态同步；show/hide 事件覆盖所有触发途径）
    this.orbWindow.on('show', () => this.onOrbVisibilityChanged?.(true))
    this.orbWindow.on('hide', () => this.onOrbVisibilityChanged?.(false))

    this.orbWindow.webContents.on('render-process-gone', () => {
      console.error('[OPS·渲染崩溃] 2秒后重启悬浮球')
      setTimeout(() => {
        if (this.orbWindow && !this.orbWindow.isDestroyed()) {
          this.orbWindow.reload()
        }
      }, 2000)
    })

    this.orbWindow.webContents.on('console-message', (_e, level, message) => {
      const method: 'log' | 'warn' | 'error' | 'info' = (['log', 'warn', 'error', 'info'] as const)[level] ?? 'info'
      console[method]('[Orb]', message)
    })

    this.orbWindow.on('close', (e) => {
      if (!this.isQuitting) {
        e.preventDefault()
        this.orbWindow?.hide()
      }
    })

    this.attachDevToolsShortcut(this.orbWindow)
  }

  // ==================== 字幕窗口 ====================
  createSubtitleWindow(): void {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const winW = Math.min(sw, 1400)

    this.subtitleWindow = new BrowserWindow({
      width: winW,
      height: 170,
      x: Math.round((sw - winW) / 2),
      y: sh - 180,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    this.subtitleWindow.loadFile(join(__dirname, '../renderer/subtitle.html'))
    this.subtitleWindow.setIgnoreMouseEvents(true, { forward: true })
    // 字幕页没有任何其它观察窗口：把它的 console 转发到主进程终端，
    // 否则页面脚本一旦报错（preload 未生效、样式换算抛异常等），
    // 现场只能看到"字幕不显示"这一个现象，无法定位
    this.subtitleWindow.webContents.on('console-message', (_e, level, message) => {
      const method = (['log', 'warn', 'error', 'info'] as const)[level] ?? 'info'
      console[method]('[subtitle]', message)
    })
    this.attachDevToolsShortcut(this.subtitleWindow)
  }

  /**
   * 字幕窗口高度自适应：字幕样式允许调大字号/行高，固定 170px 会裁剪内容。
   * 保持底部对齐（底边距 10px）与宽度不变，仅调整高度。
   */
  resizeSubtitle(height: number): void {
    const win = this.subtitleWindow
    if (!win || win.isDestroyed() || !height) return
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const b = win.getBounds()
    const h = Math.max(90, Math.min(Math.round(height), Math.round(sh * 0.6)))
    // 抖动保护：高度变化小于 4px 不调整
    if (Math.abs(h - b.height) < 4) return
    win.setBounds({
      x: Math.round((sw - b.width) / 2),
      y: sh - h - 10,
      width: b.width,
      height: h
    })
  }

  // ==================== 音频工作窗口（隐藏） ====================
  createAudioWorker(): void {
    this.audioWorker = new BrowserWindow({
      width: 100,
      height: 100,
      // 注意：不要用"屏幕外可见窗口"——Windows occlusion 检测会把屏幕外窗口
      // 判定为 occluded 并挂起渲染进程（比 show:false 更糟，连 IPC 都停）。
      // show:false 的页面仍正常运行（仅不渲染），IPC/JS 都不受影响。
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    })

    this.audioWorker.loadFile(join(__dirname, '../renderer/audio.html'))

    // 把窗口的 console 转发到主进程，方便排查无声等音频问题
    // （reload 不重建 webContents 对象，listener 一直有效）
    this.audioWorker.webContents.on('console-message', (_e, level, message) => {
      const method = (['log', 'warn', 'error', 'info'] as const)[level] ?? 'info'
      console[method](`[audioWorker] ${message}`)
    })

    this.audioWorker.webContents.on('render-process-gone', () => {
      console.error('[OPS·音频进程崩溃] 1秒后重启')
      setTimeout(() => {
        if (this.audioWorker && !this.audioWorker.isDestroyed()) {
          this.audioWorker.reload()
        }
      }, 1000)
    })
    this.attachDevToolsShortcut(this.audioWorker)
  }

  // ==================== 讲解浏览器窗口 ====================
  async openBrowser(url: string): Promise<BrowserWindow> {
    if (this.browserWindow && !this.browserWindow.isDestroyed()) {
      // 必须立即销毁旧窗口：close() 是异步的，残留窗口既会在讲解状态广播时
      // 抛出 "Object has been destroyed"（中断讲解启动的错误处理），
      // 也可能干扰新窗口加载（偶发 ERR_FAILED）
      this.browserWindow.destroy()
      this.browserWindow = null
    }
    // 覆盖整个屏幕（含任务栏），实现"无边框全屏"效果。
    // 不用 fullscreen:true —— Windows 会把全屏窗口放进 topmost 层，与置顶的悬浮球/字幕
    // 竞争 z-order（且悬浮球 setAlwaysOnTop 对透明无边框窗口偶发失效，DWM 已知问题），
    // 导致悬浮球被 PPT 压住。普通层窗口 + 悬浮球 topmost 才能稳定压在 PPT 之上。
    const { x, y, width: sw, height: sh } = screen.getPrimaryDisplay().bounds
    const win = new BrowserWindow({
      x,
      y,
      width: sw,
      height: sh,
      // 无边框 + 覆盖整屏（F11 效果），配合 PPT 页面 100vw/100vh 铺满
      frame: false,
      fullscreenable: false,
      resizable: false,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    this.browserWindow = win
    this.isLocalDeck = false

    // Windows 下讲解窗口创建即显示，但 focus 事件只有"从失焦到聚焦"才触发：
    // 用户点击 PPT 内容不会产生 focus（窗口本就是激活态），导致 moveTop 兜底常年不触发。
    // 因此这里在创建后立即挂载监听并主动聚焦。
    win.on('focus', () => {
      console.log('window focus')
      if (!this.orbMinimized) return
      try {
        console.log('window focus moveTop')
        this.orbWindow?.moveTop()
        this.subtitleWindow?.moveTop()
      } catch {
        /* ignore */
      }
    })
    win.focus()

    if (url.startsWith('http://') || url.startsWith('https://')) {
      await win.loadURL(url)
    } else {
      // 本地 HTML（PPT 转换产物）
      this.isLocalDeck = true
      // 偶发 ERR_FAILED（-2）：多为窗口重建瞬间的资源竞争，重试一次即可
      try {
        await win.loadFile(url)
      } catch (e) {
        console.warn('[Window] 讲解页面首次加载失败，重试一次:', (e as Error).message)
        await win.loadFile(url)
      }
    }

    win.on('closed', () => {
      if (this.browserWindow === win) this.browserWindow = null
    })

    this.attachDevToolsShortcut(win)
    // 开发模式下自动打开 DevTools，便于调试讲解页面
    if (!app.isPackaged) {
     // win.webContents.openDevTools({ mode: 'detach' })
    }
    return win
  }

  /** 关闭讲解浏览器窗口（结束播报时关闭播报页面、回到初始状态） */
  closeBrowser(): void {
    if (this.browserWindow && !this.browserWindow.isDestroyed()) {
      // 先关 DevTools 再关窗口：直接关闭带分离 DevTools 的窗口会触发
      // Electron 原生崩溃（0xc000041d STATUS_FATAL_USER_CALLBACK_EXCEPTION，表现为闪退）
      try {
        if (this.browserWindow.webContents.isDevToolsOpened()) {
          this.browserWindow.webContents.closeDevTools()
        }
      } catch {
        /* ignore */
      }
      this.browserWindow.close()
    }
    this.browserWindow = null
  }

  // ==================== 设置窗口 ====================
  openSettings(): void {
    // 每次打开都重建窗口：保证 preload / HTML / 样式永远是最新编译产物
    // （electron-vite dev 下主进程改动会热重启，但已打开窗口不会自动刷新）
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.destroy()
      this.settingsWindow = null
    }
    this.settingsWindow = new BrowserWindow({
      // 设置页为"左导航 + 右表单"两栏布局，默认给足宽度避免内容挤压
      width: 1000,
      height: 820,
      minWidth: 780,
      minHeight: 640,
      resizable: true,
      // 无边框：标题栏由渲染层的 TitleBar 组件自绘，与悬浮球/字幕/讲演窗保持一致。
      // 保留 thickFrame 默认值 true —— Windows 下仍提供边缘拖拽改尺寸与投影。
      frame: false,
      // 深色底：避免启动瞬间白闪（页面 CSS 生效前的兜底）
      backgroundColor: '#0f1216',
      title: t('window.settings'),
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    this.settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null
    })
    this.attachDevToolsShortcut(this.settingsWindow)
    this.attachFramelessChrome(this.settingsWindow)
  }

  // ==================== PPT 管理窗口 ====================
  openPptWindow(): void {
    // 与设置窗口一致：每次打开都重建窗口，保证 preload / HTML / 样式永远是最新编译产物
    if (this.pptWindow && !this.pptWindow.isDestroyed()) {
      this.pptWindow.destroy()
      this.pptWindow = null
    }
    this.pptWindow = new BrowserWindow({
      width: 1180,
      height: 800,
      minWidth: 960,
      minHeight: 640,
      resizable: true,
      // 无边框：与设置窗同一套自绘标题栏（见 TitleBar.vue）
      frame: false,
      // 深色底：避免启动瞬间白闪（页面 CSS 生效前的兜底）
      backgroundColor: '#14081a',
      title: t('window.ppt'),
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    this.pptWindow.loadFile(join(__dirname, '../renderer/ppt.html'))
    this.pptWindow.on('closed', () => {
      this.pptWindow = null
    })
    this.attachDevToolsShortcut(this.pptWindow)
    this.attachFramelessChrome(this.pptWindow)
  }

  // ==================== 悬浮球停靠位置 ====================

  /** 当前悬浮球停靠位置设置（兼容旧配置文件缺字段的情况） */
  private get orbPosition(): OrbPosition {
    return configStore.get('orbPosition') ?? 'bottom-right'
  }

  /**
   * 迷你悬浮球在指定停靠位置的边界。
   * 基于 workArea 而非 workAreaSize：任务栏位于左侧/上方时 workArea 有 x/y 偏移，
   * 直接用尺寸算会把球停到任务栏底下。
   */
  private orbDockBounds(pos: OrbPosition): { x: number; y: number; width: number; height: number } {
    const area = screen.getPrimaryDisplay().workArea
    const mx = 16
    const my = 24
    const left = pos === 'top-left' || pos === 'bottom-left'
    const top = pos === 'top-left' || pos === 'top-right'
    return {
      x: Math.round(left ? area.x + mx : area.x + area.width - this.miniW - mx),
      y: Math.round(top ? area.y + my : area.y + area.height - this.miniH - my),
      width: this.miniW,
      height: this.miniH
    }
  }

  /**
   * 按【讲解时悬浮球位置】设置重新摆放/显隐迷你悬浮球。
   * 仅在讲解迷你态生效（常态大球始终居中，不受该设置影响）；
   * 讲解过程中修改设置可即时生效（由配置 IPC 调用）。
   */
  applyOrbDock(): void {
    const win = this.orbWindow
    if (!win || win.isDestroyed() || !this.orbMinimized) return
    const pos = this.orbPosition
    // 'none' 下窗口仍按右下角摆放（讲解结束恢复显示时的位置），只是讲解期间隐藏
    win.setBounds(this.orbDockBounds(pos === 'none' ? 'bottom-right' : pos))
    if (pos === 'none') {
      if (win.isVisible()) {
        win.hide()
        this.orbHiddenBySetting = true
      }
      return
    }
    // 由"不显示"改回具体位置时，把之前因设置隐藏的球重新显示出来
    if (this.orbHiddenBySetting) {
      this.orbHiddenBySetting = false
      win.show()
    }
    try {
      win.moveTop()
    } catch {
      /* ignore */
    }
  }

  // ==================== 悬浮球模式切换 ====================
  /** 进入迷你讲解模式（球体缩小并停靠到设定位置，字幕激活） */
  minimizeOrb(): void {
    if (!this.orbWindow || this.orbWindow.isDestroyed()) return
    // 讲解期间置顶：保证在讲解窗口之上可见可控（结束讲解时 restoreOrb 取消置顶）
    this.orbWindow.setAlwaysOnTop(true)
    // 先切迷你态再停放：applyOrbDock 只在迷你态下生效
    this.orbMinimized = true
    // 按设置停靠到指定角；'none' 则讲解期间隐藏悬浮球
    this.applyOrbDock()
    // 防御：setAlwaysOnTop 对 transparent+frameless 窗口偶发不生效（DWM 已知问题），
    // 主动把悬浮球/字幕提到当前 z-order 顶层，并延迟补一次等 DWM 稳定
    try {
      this.orbWindow.moveTop()
      this.subtitleWindow?.moveTop()
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        this.orbWindow?.moveTop()
        this.subtitleWindow?.moveTop()
      } catch {
        /* ignore */
      }
    }, 300)
    this.orbWindow.webContents.send(IPC.Window.OrbModeChanged, true)
    this.showSubtitle()
  }

  /** 恢复到桌面中央 */
  restoreOrb(): void {
    if (!this.orbWindow || this.orbWindow.isDestroyed()) return
    // 讲解结束：取消置顶，回到普通悬浮窗
    this.orbWindow.setAlwaysOnTop(false)
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    this.orbWindow.setBounds({
      x: Math.round((sw - 420) / 2),
      y: Math.round((sh - 540) / 2),
      width: 420,
      height: 540
    })
    this.orbWindow.webContents.send(IPC.Window.OrbModeChanged, false)
    this.orbMinimized = false
    // 因"讲解中不显示"被隐藏的球，讲解结束后恢复；用户主动收起到托盘的不在此列
    if (this.orbHiddenBySetting) {
      this.orbHiddenBySetting = false
      this.orbWindow.show()
    }
    this.hideSubtitle()
  }

  showSubtitle(): void {
    if (this.subtitleWindow && !this.subtitleWindow.isDestroyed()) {
      this.subtitleWindow.showInactive()
    }
  }

  hideSubtitle(): void {
    if (this.subtitleWindow && !this.subtitleWindow.isDestroyed()) {
      this.subtitleWindow.hide()
    }
  }

  // ==================== 托盘 ====================
  private createTrayIcon(): Electron.NativeImage {
    // 品牌能量球兜底图（程序生成，避免依赖资源文件）：径向渐变蓝 + 中心高光
    const size = 16
    const buf = Buffer.alloc(size * size * 4)
    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 0.5
    // 高光中心（左上偏移），与 UI 中的能量球一致
    const lx = cx - r * 0.36
    const ly = cy - r * 0.44
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (d > r) continue
        const dl = Math.hypot(x + 0.5 - lx, y + 0.5 - ly)
        const t = Math.min(1, dl / (r * 1.6))
        // #8fb6ff → #3d7eff → #2a64e8
        let cr: number
        let cg: number
        let cb: number
        if (t < 0.5) {
          const k = t / 0.5
          cr = 143 + (61 - 143) * k
          cg = 182 + (126 - 182) * k
          cb = 255 + (255 - 255) * k
        } else {
          const k = (t - 0.5) / 0.5
          cr = 61 + (42 - 61) * k
          cg = 126 + (100 - 126) * k
          cb = 255 + (232 - 255) * k
        }
        // 中心高光
        const hl = Math.max(0, 1 - dl / (r * 0.72))
        const w = hl * hl * 0.55
        buf[i] = Math.round(cr + (255 - cr) * w)
        buf[i + 1] = Math.round(cg + (255 - cg) * w)
        buf[i + 2] = Math.round(cb + (255 - cb) * w)
        buf[i + 3] = 255
      }
    }
    return nativeImage.createFromBuffer(buf, { width: size, height: size })
  }

  createTray(): void {
    let icon: Electron.NativeImage
    try {
      const fromFile = nativeImage.createFromPath(join(app.getAppPath(), 'assets', 'tray-icon.png'))
      if (!fromFile.isEmpty()) {
        icon = fromFile.resize({ width: 16, height: 16 })
      } else {
        icon = this.createTrayIcon()
      }
    } catch {
      icon = this.createTrayIcon()
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('OpenPPTSpeaker')
    this.tray.setContextMenu(Menu.buildFromTemplate(this.trayTemplate()))
    this.tray.on('double-click', () => this.toggleOrbVisible())
  }

  /** 托盘菜单模板：文案随语言变化，故每次重建而不是复用同一个 Menu 实例 */
  private trayTemplate(): Electron.MenuItemConstructorOptions[] {
    return [
      { label: t('tray.toggleOrb'), click: () => this.toggleOrbVisible() },
      { label: t('tray.settings'), click: () => this.openSettings() },
      { label: t('tray.ppt'), click: () => this.openPptWindow() },
      { type: 'separator' },
      {
        label: t('tray.quit'),
        click: () => {
          this.isQuitting = true
          app.quit()
        }
      }
    ]
  }

  /**
   * 语言切换后刷新主进程持有的文案：托盘菜单与窗口标题。
   * 窗口内的文案由渲染层响应 config.onChange 自行刷新。
   */
  refreshLocale(): void {
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setContextMenu(Menu.buildFromTemplate(this.trayTemplate()))
    }
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.setTitle(t('window.settings'))
    }
    if (this.pptWindow && !this.pptWindow.isDestroyed()) {
      this.pptWindow.setTitle(t('window.ppt'))
    }
  }

  private toggleOrbVisible(): void {
    if (!this.orbWindow || this.orbWindow.isDestroyed()) return
    if (this.orbWindow.isVisible()) this.orbWindow.hide()
    else {
      this.orbWindow.show()
      this.orbWindow.focus()
    }
  }

  /** 显示悬浮球（语音唤醒等场景：托盘隐藏则唤出、迷你讲解态则恢复常态大球） */
  showOrb(): void {
    if (!this.orbWindow || this.orbWindow.isDestroyed()) return
    // 讲解迷你态 + 设置为"讲解中不显示"：忽略显示请求。
    // 否则手机遥控【显示悬浮球】或语音唤醒会把球从迷你态恢复成大球，直接打断正在进行的讲演。
    if (this.orbMinimized && this.orbPosition === 'none') return
    if (this.orbMinimized) this.restoreOrb()
    if (!this.orbWindow.isVisible()) this.orbWindow.show()
    this.orbWindow.focus()
  }

  /** 隐藏悬浮球到托盘（手机遥控；与悬浮球自身关闭按钮行为一致） */
  hideOrbToTray(): void {
    if (this.orbWindow && !this.orbWindow.isDestroyed()) this.orbWindow.hide()
  }

  /** 悬浮球托盘切换（手机遥控按钮：显示时隐藏到托盘，隐藏时唤出主界面） */
  toggleOrbTray(): void {
    if (!this.orbWindow || this.orbWindow.isDestroyed()) return
    if (this.orbWindow.isVisible()) this.orbWindow.hide()
    else this.showOrb()
  }

  // ==================== 开发者工具 ====================
  /** 打开/关闭当前聚焦窗口的 DevTools；无聚焦窗口时操作悬浮球 */
  toggleDevTools(): void {
    const focused =
      BrowserWindow.getFocusedWindow() ??
      [this.browserWindow, this.orbWindow, this.settingsWindow, this.pptWindow].find(
        (w) => w && !w.isDestroyed()
      )
    if (!focused) return
    if (focused.webContents.isDevToolsOpened()) {
      focused.webContents.closeDevTools()
    } else {
      focused.webContents.openDevTools({ mode: 'detach' })
    }
  }

  get isQuittingFlag(): boolean {
    return this.isQuitting
  }

  setQuitting(): void {
    this.isQuitting = true
  }

  openExternal(url: string): void {
    shell.openExternal(url)
  }
}

export const windowManager = new WindowManager()
