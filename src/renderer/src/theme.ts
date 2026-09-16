/** 主题应用：把主进程配置（主题模式 + 强调色）映射到 <html data-*>，并随配置变更实时更新 */

import type { AppConfig } from '../../main/config/schema'

function applyDataset(cfg: AppConfig): void {
  const root = document.documentElement
  const mode = cfg.theme ?? 'auto'
  const resolved =
    mode === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
  root.dataset.theme = resolved
  const accent = cfg.accent || 'ocean'
  if (accent && accent !== 'ocean') root.dataset.accent = accent
  else delete root.dataset.accent
}

/** 初始化主题（读取配置 + 订阅变更 + 跟随系统变化） */
export async function initTheme(): Promise<void> {
  const cfg = await window.ops.config.get()
  applyDataset(cfg)
  window.ops.config.onChange((next: AppConfig) => applyDataset(next))
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = window.ops
    void current
    // 跟随系统模式下需要重新读取配置判断（配置可能已是 light/dark 固定值）
    void window.ops.config.get().then(applyDataset)
  })
}
