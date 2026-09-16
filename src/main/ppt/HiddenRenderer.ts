/**
 * 隐藏渲染窗口管理：pdf-render / video-render 两个工作页，
 * 懒创建、复用；主进程通过 executeJavaScript 调用页面内 window.__* 函数。
 */

import { BrowserWindow } from 'electron'
import { join } from 'path'

type PageName = 'pdf-render' | 'video-render'

class HiddenRenderer {
  private windows = new Map<PageName, BrowserWindow>()
  private readyPromises = new Map<PageName, Promise<BrowserWindow>>()

  async get(page: PageName): Promise<BrowserWindow> {
    const existing = this.windows.get(page)
    if (existing && !existing.isDestroyed()) return existing
    let pending = this.readyPromises.get(page)
    if (!pending) {
      pending = this.create(page)
      this.readyPromises.set(page, pending)
    }
    return pending
  }

  private async create(page: PageName): Promise<BrowserWindow> {
    const win = new BrowserWindow({
      width: 400,
      height: 300,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    })
    win.on('closed', () => {
      this.windows.delete(page)
      this.readyPromises.delete(page)
    })
    const file = join(__dirname, `../renderer/${page}.html`)
    await win.loadFile(file)
    this.windows.set(page, win)
    return win
  }

  /** 在页面上下文执行表达式并返回结果 */
  async eval<T>(page: PageName, expression: string): Promise<T> {
    const win = await this.get(page)
    return (await win.webContents.executeJavaScript(expression)) as T
  }
}

export const hiddenRenderer = new HiddenRenderer()
