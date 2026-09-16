<template>
  <div class="ppt-app">
    <!-- 无边框窗口：品牌与页签统一收进自绘标题栏 -->
    <TitleBar :subtitle="t('ppt.subtitle')">
      <nav class="tabs">
        <button :class="{ on: tab === 'ppt' }" @click="tab = 'ppt'">{{ t('ppt.tabDecks') }}</button>
        <button :class="{ on: tab === 'editor' }" @click="tab = 'editor'">{{ t('ppt.tabEditor') }}</button>
      </nav>
    </TitleBar>

    <div v-show="tab === 'ppt'" class="panel">
      <PptManager @edit-script="onEditScript" />
    </div>
    <div v-show="tab === 'editor'" class="panel editor-panel">
      <ScriptEditor :target-deck-id="editingDeckId" @clear-target="editingDeckId = ''" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PptManager from './components/PptManager.vue'
import ScriptEditor from './components/ScriptEditor.vue'
import TitleBar from './components/TitleBar.vue'
import { initI18n, t } from './i18n'

// 在 setup 阶段同步应用启动语言，保证首帧语言正确（不闪中文）
initI18n()

const tab = ref<'ppt' | 'editor'>('ppt')
/** PPT 管理页点击"编辑讲稿"跳转过来的目标 deck */
const editingDeckId = ref('')

function onEditScript(deckId: string): void {
  editingDeckId.value = deckId
  tab.value = 'editor'
}
</script>

<style scoped>
html,
body {
  background: var(--vd-bg);
  overflow: hidden;
}
.ppt-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--vd-bg);
  color: var(--vd-text-1);
}
.tabs { display: flex; gap: 4px; }
.tabs button {
  height: 32px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--vd-text-2);
  font-size: 13px;
  font-weight: 560;
}
.tabs button:hover { background: var(--vd-surface-2); color: var(--vd-text-1); }
.tabs button.on { background: var(--vd-accent-soft); color: var(--vd-accent); }
.panel { flex: 1; min-height: 0; padding: 18px 22px; overflow: auto; }
.editor-panel { display: flex; flex-direction: column; overflow: hidden; }
</style>
