<template>
  <div class="ppt-app">
    <header class="app-head">
      <div class="brand">
        <span class="lg"></span>
        <div>
          <h1>OpenPPTSpeaker</h1>
          <span class="faint">PPT 库 · 讲稿编辑</span>
        </div>
      </div>
      <span class="spread"></span>
      <nav class="tabs">
        <button :class="{ on: tab === 'ppt' }" @click="tab = 'ppt'">PPT 管理</button>
        <button :class="{ on: tab === 'editor' }" @click="tab = 'editor'">讲稿编辑</button>
      </nav>
    </header>

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
.app-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--vd-line);
  background: var(--vd-surface);
  flex: none;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand .lg {
  width: 26px; height: 26px; border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, var(--vd-accent), var(--vd-accent-strong) 78%);
}
.brand h1 { font-size: 16px; font-weight: 700; }
.brand .faint { font-size: 11.5px; }
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
