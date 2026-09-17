/**
 * 渲染层 i18n：把 @shared/i18n 的 t() 包装成响应式。
 *
 * 原理：t() 内读取 langVersion.value，使调用它的模板/计算属性自动建立依赖；
 * 语言切换时 langVersion 自增，触发所有用到 t() 的组件重新渲染。
 * 因此模板里直接写 {{ t('key') }} 即可，不需要 store、provide/inject 或额外依赖。
 *
 * 语言来源有两处，缺一不可：
 *  1. 启动时 preload 同步取到的 initialLang —— 保证首帧语言正确，不闪中文
 *  2. config.onChange 订阅 —— 悬浮球等常驻窗口不随语言重建，必须靠事件刷新
 */

import { ref } from 'vue'
import { normalizeLang, setLang, t as translate, type DictKey, type Lang } from '@shared/i18n'

/** 语言版本号：仅用于让 Vue 追踪依赖，数值本身无意义 */
export const langVersion = ref(0)

/** 当前语言（只读快照；切换请调用 applyLang） */
export const lang = ref<Lang>('zh-CN')

/** 应用语言：同步词典、更新 <html lang>，并使模板重新渲染 */
export function applyLang(next: unknown): void {
  const normalized = normalizeLang(next)
  setLang(normalized)
  if (lang.value !== normalized) {
    lang.value = normalized
    langVersion.value++
  }
  document.documentElement.lang = normalized
}

/** 取词；在模板或计算属性中调用即随语言自动刷新 */
export function t(key: DictKey | string, params?: Record<string, string | number>): string {
  void langVersion.value
  return translate(key, params)
}

/**
 * 各窗口入口调用一次，用于订阅配置变更。
 * 语言初始化不依赖调用方：见下方模块级 applyLang —— 任何页面只要 import 本模块就已用对语言。
 * 没有 preload 的页面会跳过订阅（可选链兜底）。
 */
export function initI18n(): void {
  window.ops?.config.onChange((cfg) => applyLang(cfg.language))
}

/**
 * 模块级副作用：拿到 preload 同步取回的启动语言并立即应用。
 * 放在这里（而不是只放在 initI18n 里）是为了让每个使用 t() 的页面都自动正确，
 * 包括 pdf-render / video-render 这类不渲染常规 UI、不会调用 initI18n 的工作页。
 *
 * 必须用可选链兜底：共享模块的顶层副作用一旦抛错，整个页面的脚本都不会执行。
 * 隐藏工作页曾因为没有 preload 而 window.ops 为 undefined，直接取 .initialLang 抛错，
 * 导致 pdf-render 整页加载失败，主进程只报 "Script failed to execute"（看不出真实原因）。
 */
applyLang(window.ops?.initialLang)
