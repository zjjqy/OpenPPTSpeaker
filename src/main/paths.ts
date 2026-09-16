/** 打包/开发环境统一的资源路径解析（配合 electron-builder extraResources） */

import { app } from 'electron'

/**
 * 只读资源根目录：
 * - 打包后 = 安装目录下的 resources/（extraResources 安装位置，process.resourcesPath）
 * - 开发时 = 项目根目录（app.getAppPath()）
 * 用于 introduceProduction（演讲稿/PPT）、tts-cache-seed（预合成缓存种子）等随包分发的资源。
 */
export function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath()
}
