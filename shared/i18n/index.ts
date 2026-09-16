/**
 * 轻量 i18n：主进程与渲染层共用同一套词典和 t()。
 *
 * 主进程直接调用即可（WindowManager / IPC / 对话框）。
 * 渲染层需要界面随语言即时刷新，用 src/renderer/src/i18n.ts 包装成响应式。
 */

import { zhCN, type DictKey } from './zh-CN'
import { enUS } from './en-US'

export type { DictKey }
export type { DictKey as I18nKey }

/** 应用支持的语言 */
export type Lang = 'zh-CN' | 'en-US'

export const DEFAULT_LANG: Lang = 'zh-CN'

/** 语言选项：名称用各自母语书写，便于在任意语言下辨认 */
export const LANGS: ReadonlyArray<{ value: Lang; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

export function isLang(value: unknown): value is Lang {
  return value === 'zh-CN' || value === 'en-US'
}

/** 配置文件里语言字段非法时（手改、旧版本残留）回退默认语言 */
export function normalizeLang(value: unknown): Lang {
  return isLang(value) ? value : DEFAULT_LANG
}

const TABLES: Record<Lang, Record<string, string>> = {
  'zh-CN': zhCN as unknown as Record<string, string>,
  'en-US': enUS as unknown as Record<string, string>
}

/** 语言的母语名称（如 "简体中文" / "English"） */
export function langLabel(lang: Lang): string {
  return LANGS.find((l) => l.value === lang)?.label ?? lang
}

let current: Lang = DEFAULT_LANG

/** 切换语言。主进程在启动与配置变更时调用；非法值回退默认语言 */
export function setLang(lang: unknown): void {
  current = normalizeLang(lang)
}

export function getLang(): Lang {
  return current
}

/**
 * 取词。`{name}` 占位由 params 替换。
 * 键缺失时依次回退：当前语言 → 中文 → 键名本身，不抛异常，
 * 避免一处漏翻译导致整个窗口渲染失败。
 */
export function t(key: DictKey | string, params?: Record<string, string | number>): string {
  let out = TABLES[current][key] ?? TABLES[DEFAULT_LANG][key] ?? key
  if (params) {
    out = out.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    )
  }
  return out
}
