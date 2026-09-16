<template>
  <!--
    无边框窗口的自绘标题栏（设置窗 / PPT 窗共用）。
    整条是拖动区，只有按钮与插槽内容标为 no-drag —— -webkit-app-region 会被子元素继承，
    所以交互元素必须显式写回 no-drag，否则点不动。
  -->
  <header class="titlebar" @dblclick="toggleMaximize">
    <span class="tb-brand"></span>
    <div class="tb-id">
      <b>OpenPPTSpeaker</b>
      <span v-if="subtitle" class="faint">{{ subtitle }}</span>
    </div>

    <!-- 窗口内自定义内容（如 PPT 窗的页签） -->
    <div class="tb-slot" @dblclick.stop><slot /></div>
    <span class="spread"></span>

    <div class="tb-actions" @dblclick.stop>
      <button class="icon-btn" :title="t('win.minimize')" @click="minimize">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        class="icon-btn"
        :title="maximized ? t('win.restore') : t('win.maximize')"
        @click="toggleMaximize"
      >
        <svg v-if="maximized" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="8.5" y="8.5" width="10" height="10" rx="2" />
          <path d="M5.5 15.5V7.5a2 2 0 0 1 2-2h8" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
        </svg>
      </button>
      <button class="icon-btn danger" :title="t('win.close')" @click="close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '../i18n'

defineProps<{ subtitle?: string }>()

/** 是否最大化：驱动右上角按钮在「最大化 / 还原」之间切换图标 */
const maximized = ref(false)

function minimize(): void {
  window.ops.windowCtl.minimize()
}
function toggleMaximize(): void {
  window.ops.windowCtl.toggleMaximize()
}
function close(): void {
  window.ops.windowCtl.close()
}

onMounted(() => {
  // 初值 + 订阅：最大化也可能由双击标题栏/Win+↑/拖到屏幕顶端触发，必须由主进程回推
  void window.ops.windowCtl.isMaximized().then((m) => (maximized.value = m))
  window.ops.windowCtl.onMaximizedChanged((m) => (maximized.value = m))
})
</script>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  flex: none;
  padding: 0 8px 0 14px;
  background: var(--vd-bg-2);
  border-bottom: 1px solid var(--vd-hairline);
  -webkit-app-region: drag;
}

.tb-brand {
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, var(--vd-accent), var(--vd-accent-strong) 78%);
}

.tb-id { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.tb-id b { font-size: 13px; font-weight: 700; white-space: nowrap; }
.tb-id .faint {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-slot {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  -webkit-app-region: no-drag;
}

.tb-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

/* 按钮规格来自全局 .icon-btn（见 base.css），与悬浮球头部的图标键完全一致 */
.tb-actions .icon-btn { -webkit-app-region: no-drag; }
</style>
