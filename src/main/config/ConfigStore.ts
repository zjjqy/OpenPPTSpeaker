/** 本地配置持久化（userData/config.json），API Key 仅存在于主进程 */

import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_CONFIG, QWEN_TTS_VOICES, type AppConfig } from './schema'
import { IPC } from '@shared/ipc'

class ConfigStore {
  private config: AppConfig
  private readonly filePath: string

  constructor() {
    const dir = app.getPath('userData')
    this.filePath = join(dir, 'config.json')
    this.config = this.load()
  }

  private load(): AppConfig {
    let cfg: AppConfig | null = null
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        cfg = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      } else {
        // 应用更名迁移：回退读取旧 userData 目录（开发模式 zhurong-ai-presenter / 打包模式 祝融AI讲演助手），
        // 保证 API Key 等既有配置不因应用改名而丢失
        const legacy = this.legacyConfigPath()
        if (legacy) {
          cfg = { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(legacy, 'utf-8')) }
          console.log('[Config] 已从旧目录继承配置:', legacy)
        }
      }
    } catch (e) {
      console.error('[Config] 读取配置失败，使用默认值:', e)
    }
    if (!cfg) cfg = { ...DEFAULT_CONFIG }
    // 模型升级/品牌更名迁移：旧值换新（幂等；迁移后立即写回磁盘）
    if (this.migrateLegacy(cfg)) {
      try {
        writeFileSync(this.filePath, JSON.stringify(cfg, null, 2), 'utf-8')
      } catch {
        /* 忽略迁移落盘失败 */
      }
    }
    return cfg
  }

  /** 旧应用名对应的配置文件路径（存在才返回） */
  private legacyConfigPath(): string | null {
    const appData = app.getPath('appData')
    for (const name of ['zhurong-ai-presenter', '祝融AI讲演助手']) {
      const p = join(appData, name, 'config.json')
      if (existsSync(p)) return p
    }
    return null
  }

  /** 旧模型 → qwen3.8-flash；旧 CosyVoice 音色 → Qwen-Audio-TTS 音色；品牌迁移：旧系唤醒词移除、网页快捷项（功能已移除）清理 */
  private migrateLegacy(c: AppConfig): boolean {
    let dirty = false
    // 旧模型下线迁移：qwen-plus / qwen3.7-plus 已不可用，统一换到当前默认模型
    const retiredModels = ['qwen-plus', 'qwen3.7-plus']
    if (retiredModels.includes(c.llmModel)) {
      c.llmModel = 'qwen3.8-flash'
      dirty = true
    }
    const knownVoices = new Set(QWEN_TTS_VOICES.map((v) => v.value))
    if (c.ttsEngine === 'cosyvoice' && !knownVoices.has(c.ttsVoice)) {
      c.ttsVoice = 'longanfengyue'
      dirty = true
    }
    // 品牌去留：旧品牌系唤醒词一律剔除（华舜/祝融），空则回退默认
    const kept = (c.wakeWords ?? []).filter((w) => w && !w.includes('祝融') && !w.includes('华舜'))
    if (kept.length !== (c.wakeWords ?? []).length) {
      c.wakeWords = kept.length > 0 ? kept : ['小讲', '你好小讲']
      dirty = true
    }
    // 「网页快捷按钮」功能已移除：清掉旧配置残留
    const legacy = c as Partial<AppConfig> & { webShortcuts?: unknown }
    if (legacy.webShortcuts !== undefined) {
      delete legacy.webShortcuts
      dirty = true
    }
    // 默认合成引擎迁移（一次性）：历史配置文件里存的是旧默认 CosyVoice，
    // 会覆盖代码中的新默认 Edge。用标记位保证只迁移一次——之后用户手动选回
    // CosyVoice 也会被保留，不会被反复改掉。
    const withFlag = c as AppConfig & { ttsDefaultMigrated?: boolean }
    if (!withFlag.ttsDefaultMigrated) {
      withFlag.ttsDefaultMigrated = true
      if (c.ttsEngine === 'cosyvoice') c.ttsEngine = 'edge'
      dirty = true
    }
    return dirty
  }

  get<T extends keyof AppConfig>(key: T): AppConfig[T] {
    return this.config[key]
  }

  getAll(): AppConfig {
    return { ...this.config }
  }

  set<T extends keyof AppConfig>(key: T, value: AppConfig[T]): void {
    this.config[key] = value
    this.save()
  }

  setMany(partial: Partial<AppConfig>): void {
    this.config = { ...this.config, ...partial }
    this.save()
  }

  /** 是否已配置可用的 API Key */
  hasApiKey(): boolean {
    return Boolean(this.config.apiKey?.trim())
  }

  private save(): void {
    try {
      const dir = app.getPath('userData')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (e) {
      console.error('[Config] 保存配置失败:', e)
    }
  }
}

export const configStore = new ConfigStore()

/** 配置变更推送渲染层 */
export function notifyConfigChanged(): void {
  const { BrowserWindow } = require('electron')
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.Config.Changed, configStore.getAll())
    }
  }
}
