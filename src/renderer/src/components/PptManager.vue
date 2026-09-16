<template>
  <div class="ppt-mgr">
    <div class="mgr-head">
      <div>
        <h2>PPT 库</h2>
        <p class="faint">导入 PDF / 图片为可讲解的演示，并用大模型生成逐句讲稿</p>
      </div>
      <span class="spread"></span>
      <button class="btn btn-muted" @click="importOpen = !importOpen">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3M12 3v12M7 8l5-5 5 5"/></svg>
        导入演示
      </button>
    </div>

    <!-- 导入面板（含讲稿生成提示词） -->
    <div v-if="importOpen" class="card import-panel">
      <div class="field">
        <label class="f-label">演示名称 <span class="faint">留空使用文件名</span></label>
        <input v-model="importName" class="input" type="text" placeholder="例如：产品发布会（2026 夏季）" />
      </div>
      <div class="field">
        <label class="f-label">讲稿生成提示词 <span class="faint">可选 · 决定讲解的语气与侧重</span></label>
        <textarea
          v-model="importPrompt"
          class="textarea"
          rows="3"
          placeholder="例如：面向首次体验的听众，语气轻松口语化，每页讲 3~5 句，先讲结论再解释…"
        ></textarea>
        <div class="samples">
          <span class="chip" @click="useSample(0)">面向领导汇报 · 简明扼要</span>
          <span class="chip" @click="useSample(1)">面向新员工 · 讲清背景</span>
          <span class="chip" @click="useSample(2)">技术分享 · 突出重点</span>
        </div>
      </div>
      <label class="chk">
        <span class="switch switch-sm"><input v-model="genScript" type="checkbox" /><i></i></span>
        <span>导入后自动生成演讲稿（取消可先导入，稍后手动编写或再生成）</span>
      </label>
      <div class="row gap-2">
        <button class="btn btn-primary" :disabled="busy" @click="doImport('pdf')">导入 PDF</button>
        <button class="btn btn-ghost" :disabled="busy" @click="doImport('images')">导入图片</button>
      </div>
    </div>

    <!-- 进度 -->
    <div v-if="progress" class="card prog">
      <div class="row gap-3">
        <span class="pulse-dot on"></span>
        <span style="font-size: 13px">{{ progress.message || `${progress.done}/${progress.total}` }}</span>
        <span class="spread"></span>
        <span class="chip">{{ stageLabel }}</span>
      </div>
      <div class="progress" style="margin-top: 8px"><i :style="{ width: progressPct + '%' }"></i></div>
    </div>
    <p v-if="error" class="err">⚠ {{ error }}</p>

    <!-- 列表 -->
    <div class="deck-grid">
      <div v-for="d in decks" :key="d.id" class="card deck" :class="{ active: d.id === activeId }">
        <div class="thumb">
          <img v-if="thumbs[d.id]" :src="thumbs[d.id]" alt="" />
          <span v-else class="thumb-empty">PPT</span>
        </div>
        <div class="d-name">
          <b>{{ d.name }}</b>
          <span v-if="d.id === activeId" class="chip acc">当前</span>
          <span v-if="d.source === 'builtin'" class="chip">内置演示</span>
          <span v-else class="chip" :class="d.hasScript ? 'ok' : 'warn'">{{ d.hasScript ? '有讲稿' : '无讲稿' }}</span>
        </div>
        <div class="d-meta">
          <span class="chip">{{ d.source === 'builtin' ? '内置' : `${d.slideCount} 页` }}</span>
          <span class="chip">{{ d.source === 'pdf' ? 'PDF 导入' : d.source === 'images' ? '图片导入' : '内置' }}</span>
        </div>
        <div class="d-foot">
          <button v-if="d.id !== activeId" class="btn btn-muted btn-sm" @click="setActive(d.id)">设为当前</button>
          <button class="btn btn-primary btn-sm" @click="startTour(d.id)">开始讲解</button>
          <span class="spread"></span>
          <button v-if="d.source !== 'builtin'" class="btn btn-soft btn-sm" @click="emit('edit-script', d.id)">编辑讲稿</button>
          <button v-if="d.source !== 'builtin'" class="btn btn-ghost btn-sm" :disabled="busy" @click="regenScript(d.id)">AI 生成讲稿</button>
          <button v-if="d.source !== 'builtin'" class="btn btn-ghost btn-sm" :disabled="busy" @click="doExport(d.id)">导出视频</button>
          <button v-if="d.source !== 'builtin'" class="btn btn-ghost btn-sm" @click="doRename(d)">重命名</button>
          <button v-if="d.source !== 'builtin'" class="btn btn-danger btn-sm" @click="doDelete(d)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import type { PptDeckMeta, PptProgressEvent } from '@shared/ppt'

const emit = defineEmits<{ (e: 'edit-script', deckId: string): void }>()

const decks = ref<PptDeckMeta[]>([])
const activeId = ref('')
const thumbs = reactive<Record<string, string>>({})
const importOpen = ref(false)
const importName = ref('')
const importPrompt = ref('')
const genScript = ref(true)
const busy = ref(false)
const error = ref('')
const progress = ref<PptProgressEvent | null>(null)

const progressPct = computed(() => {
  const p = progress.value
  if (!p || !p.total) return 0
  return Math.round((p.done / p.total) * 100)
})
const stageLabel = computed(() => {
  const s = progress.value?.stage
  return s === 'convert' ? '转换页面' : s === 'script' ? '生成讲稿' : s === 'video' ? '导出视频' : '处理中'
})

const SAMPLES = [
  '面向公司领导的汇报场合：简明扼要、突出成果与价值，避免术语堆砌。',
  '面向新入职员工：先用大白话解释背景，再逐页带读，语气耐心。',
  '面向开发者社区的技术分享：语速适中，重点讲架构与设计取舍。'
]
function useSample(i: number): void {
  importPrompt.value = SAMPLES[i]
}

async function refresh(): Promise<void> {
  const r = await window.ops.pptLib.list()
  decks.value = r.decks
  activeId.value = r.activeDeckId
  for (const d of r.decks.slice(0, 8)) {
    if (d.source === 'builtin' || thumbs[d.id]) continue
    thumbs[d.id] = await window.ops.pptLib.slideImage({ deckId: d.id, slide: 1, thumb: true })
  }
}

async function doImport(kind: 'pdf' | 'images'): Promise<void> {
  busy.value = true
  error.value = ''
  progress.value = null
  const r = await window.ops.pptLib.importDeck({
    kind,
    name: importName.value.trim(),
    genScript: genScript.value,
    prompt: importPrompt.value.trim()
  })
  busy.value = false
  progress.value = null
  if (r.ok) {
    importOpen.value = false
    importName.value = ''
    await refresh()
  } else if (r.error !== '已取消') {
    error.value = r.error ?? '导入失败'
  }
}

async function setActive(id: string): Promise<void> {
  await window.ops.pptLib.setActive(id)
  await refresh()
}

async function startTour(id: string): Promise<void> {
  error.value = ''
  await window.ops.pptLib.setActive(id)
  const r = await window.ops.tour.start({ deckId: id })
  if (!r.success) error.value = r.error ?? '启动讲解失败'
}

async function regenScript(id: string): Promise<void> {
  busy.value = true
  error.value = ''
  const r = await window.ops.pptLib.genScript({ deckId: id, prompt: importPrompt.value.trim() })
  busy.value = false
  progress.value = null
  if (!r.ok) error.value = r.error ?? '生成失败'
  await refresh()
}

async function doExport(id: string): Promise<void> {
  busy.value = true
  error.value = ''
  const r = await window.ops.pptLib.exportVideo(id)
  busy.value = false
  progress.value = null
  if (!r.ok && r.error !== '已取消') error.value = r.error ?? '导出失败'
}

async function doRename(d: PptDeckMeta): Promise<void> {
  const name = prompt('新的演示名称：', d.name)
  if (!name || !name.trim()) return
  await window.ops.pptLib.rename(d.id, name.trim())
  await refresh()
}

async function doDelete(d: PptDeckMeta): Promise<void> {
  if (!confirm(`确定删除「${d.name}」？页面图片与讲稿将一并删除。`)) return
  const r = await window.ops.pptLib.remove(d.id)
  if (!r.ok) error.value = r.error ?? '删除失败'
  await refresh()
}

onMounted(() => {
  void refresh()
  window.ops.pptLib.onProgress((ev) => {
    progress.value = ev
  })
})
</script>

<style scoped>
.ppt-mgr { display: flex; flex-direction: column; gap: 14px; }
.mgr-head { display: flex; align-items: flex-end; gap: 12px; }
.mgr-head h2 { font-size: 19px; }
.mgr-head .faint { font-size: 12.5px; }

.import-panel { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
.samples { display: flex; gap: 6px; flex-wrap: wrap; }
.samples .chip { cursor: pointer; }
.samples .chip:hover { border-color: var(--vd-accent); color: var(--vd-accent); }
.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--vd-text-2); }
.switch-sm { width: 34px; height: 19px; }
.switch-sm input:checked + i::after { transform: translateX(15px); }
.switch-sm i::after { width: 13px; height: 13px; }

.prog { padding: 14px 16px; }
.err { font-size: 13px; color: var(--vd-danger); }

.deck-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.deck { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.deck.active { border-color: var(--vd-accent); box-shadow: 0 0 0 3px var(--vd-accent-soft); }
.thumb {
  width: 100%;
  height: 132px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--vd-bg-2);
  border: 1px solid var(--vd-line-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb img { width: 100%; height: 100%; object-fit: contain; }
.thumb-empty { color: var(--vd-text-3); font-size: 12px; }
.d-name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.d-name b { font-size: 15px; }
.d-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.d-foot { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
</style>
