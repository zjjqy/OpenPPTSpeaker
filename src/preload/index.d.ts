/** 渲染进程 window.huashun 类型声明 */
import type { HuashunApi } from './index'

declare global {
  interface Window {
    huashun: HuashunApi
  }
}

export {}
