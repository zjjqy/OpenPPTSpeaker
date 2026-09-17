<template>
  <div class="ppt-mgr">
    <div class="mgr-head">
      <div>
        <h2>{{ t('ppt.libraryTitle') }}</h2>
        <p class="faint">{{ t('ppt.libraryDesc') }}</p>
      </div>
      <span class="spread"></span>
      <button class="btn btn-muted" @click="importOpen = !importOpen">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3M12 3v12M7 8l5-5 5 5"/></svg>
        {{ t('ppt.import') }}
      </button>
    </div>

    <!-- 导入面板（含讲稿生成提示词） -->
    <div v-if="importOpen" class="card import-panel">
      <div class="field">
        <label class="f-label">
          {{ t('ppt.importName') }} <span class="faint">{{ t('ppt.importNameHint') }}</span>
        </label>
        <input v-model="importName" class="input" type="text" :placeholder="t('ppt.importNamePlaceholder')" />
      </div>
      <div class="field">
        <label class="f-label">
          {{ t('ppt.importPrompt') }} <span class="faint">{{ t('ppt.importPromptHint') }}</span>
        </label>
        <textarea
          v-model="importPrompt"
          class="textarea"
          rows="3"
          :placeholder="t('ppt.importPromptPlaceholder')"
        ></textarea>
        <div class="samples">
          <span class="chip" @click="useSample(0)">{{ t('ppt.sample1.label') }}</span>
          <span class="chip" @click="useSample(1)">{{ t('ppt.sample2.label') }}</span>
          <span class="chip" @click="useSample(2)">{{ t('ppt.sample3.label') }}</span>
        </div>
      </div>
      <label class="chk">
        <span class="switch switch-sm"><input v-model="genScript" type="checkbox" /><i></i></span>
        <span>{{ t('ppt.autoGen') }}</span>
      </label>
      <div class="row gap-2">
        <button class="btn btn-primary" :disabled="busy" @click="doImport('pdf')">{{ t('ppt.importPdf') }}</button>
        <button class="btn btn-ghost" :disabled="busy" @click="doImport('images')">
          {{ t('ppt.importImages') }}
        </button>
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
          <span v-if="d.id === activeId" class="chip acc">{{ t('ppt.chipCurrent') }}</span>
          <span v-if="d.source === 'builtin'" class="chip">{{ t('ppt.chipBuiltin') }}</span>
          <span v-else class="chip" :class="d.hasScript ? 'ok' : 'warn'">
            {{ d.hasScript ? t('ppt.hasScript') : t('ppt.noScript') }}
          </span>
        </div>
        <div class="d-meta">
          <span class="chip">
            {{ d.source === 'builtin' ? t('ppt.srcBuiltin') : t('orb.slides', { n: d.slideCount }) }}
          </span>
          <span class="chip">{{ sourceLabel(d.source) }}</span>
        </div>
        <div class="d-foot">
          <button v-if="d.id !== activeId" class="btn btn-muted btn-sm" @click="setActive(d.id)">
            {{ t('ppt.setActive') }}
          </button>
          <button class="btn btn-primary btn-sm" @click="startTour(d.id)">{{ t('orb.start') }}</button>
          <span class="spread"></span>
          <button v-if="d.source !== 'builtin'" class="btn btn-soft btn-sm" @click="emit('edit-script', d.id)">
            {{ t('ppt.editScript') }}
          </button>
          <button v-if="d.source !== 'builtin'" class="btn btn-ghost btn-sm" :disabled="busy" @click="regenScript(d.id)">
            {{ t('ppt.regenScript') }}
          </button>
          <button v-if="d.source !== 'builtin'" class="btn btn-ghost btn-sm" :disabled="busy" @click="doExport(d.id)">
            {{ t('ppt.exportVideo') }}
          </button>
          <button v-if="d.source !== 'builtin'" class="btn btn-ghost btn-sm" @click="doRename(d)">
            {{ t('action.rename') }}
          </button>
          <button v-if="d.source !== 'builtin'" class="btn btn-danger btn-sm" @click="doDelete(d)">
            {{ t('action.delete') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 应用内对话框：替代 Electron 不可用的 window.prompt / 有缺陷的 window.confirm -->
    <AppDialog
      v-model="dlg.value"
      :open="dlg.open"
      :title="dlg.title"
      :message="dlg.message"
      :show-input="dlg.showInput"
      :confirm-label="dlg.confirmLabel"
      :cancel-label="t('action.cancel')"
      :danger="dlg.danger"
      @confirm="onDialogConfirm"
      @cancel="dlg.open = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import type { PptDeckMeta, PptProgressEvent } from '@shared/ppt'
import AppDialog from './AppDialog.vue'
import { initI18n, t } from '../i18n'

// 在 setup 阶段同步应用启动语言（本组件由 PptApp 渲染，此处兜底即可）
initI18n()

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
  if (s === 'convert') return t('ppt.stage.convert')
  if (s === 'script') return t('ppt.stage.script')
  if (s === 'video') return t('ppt.stage.video')
  return t('ppt.stage.working')
})

/** 讲稿生成提示词示例：会作为提示词发给大模型，故随语言切换 */
const samplePrompts = computed(() => [t('ppt.sample1'), t('ppt.sample2'), t('ppt.sample3')])
function useSample(i: number): void {
  importPrompt.value = samplePrompts.value[i]
}

/** 演示来源标签 */
function sourceLabel(source: string): string {
  if (source === 'pdf') return t('ppt.srcPdf')
  if (source === 'images') return t('ppt.srcImages')
  return t('ppt.srcBuiltin')
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
  } else if (!r.cancelled) {
    error.value = r.error ?? t('ppt.errImport')
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
  if (!r.success) error.value = r.error ?? t('ppt.errStart')
}

async function regenScript(id: string): Promise<void> {
  busy.value = true
  error.value = ''
  const r = await window.ops.pptLib.genScript({ deckId: id, prompt: importPrompt.value.trim() })
  busy.value = false
  progress.value = null
  if (!r.ok) error.value = r.error ?? t('ppt.errGen')
  await refresh()
}

async function doExport(id: string): Promise<void> {
  busy.value = true
  error.value = ''
  const r = await window.ops.pptLib.exportVideo(id)
  busy.value = false
  progress.value = null
  if (!r.ok && !r.cancelled) error.value = r.error ?? t('ppt.errExport')
}

/**
 * 应用内对话框状态。
 *
 * 原实现用 window.prompt / window.confirm —— 前者在 Electron 渲染进程里直接抛
 * "prompt() is and will not be supported"，导致重命名在到达 IPC 之前就中断；
 * 后者虽能弹出，但有"关闭后输入框无法聚焦"的已知缺陷。
 */
const dlg = reactive({
  open: false,
  title: '',
  message: '',
  showInput: false,
  value: '',
  danger: false,
  confirmLabel: '',
  /** 点确认后要执行的动作 */
  onConfirm: null as null | (() => Promise<void>)
})

function onDialogConfirm(): void {
  // 先关弹窗再执行：动作失败时错误显示在页面上，不会被弹窗遮住
  dlg.open = false
  void dlg.onConfirm?.()
}

/** 重命名：弹输入框（原实现用 prompt，在 Electron 中不可用） */
function doRename(d: PptDeckMeta): void {
  dlg.open = true
  dlg.title = t('ppt.renameTitle')
  dlg.message = ''
  dlg.showInput = true
  dlg.value = d.name
  dlg.danger = false
  dlg.confirmLabel = t('action.rename')
  dlg.onConfirm = async () => {
    const name = dlg.value.trim()
    if (!name) return
    // 原先忽略了返回值：重命名失败时界面上毫无反馈
    const r = await window.ops.pptLib.rename(d.id, name)
    if (!r.ok) {
      error.value = r.error ?? t('ppt.errRename')
      return
    }
    await refresh()
  }
}

/** 删除：弹确认框（原实现用 confirm，存在关闭后输入框无法聚焦的问题） */
function doDelete(d: PptDeckMeta): void {
  dlg.open = true
  dlg.title = t('ppt.deleteTitle')
  dlg.message = t('ppt.confirmDelete', { name: d.name })
  dlg.showInput = false
  dlg.value = ''
  dlg.danger = true
  dlg.confirmLabel = t('action.delete')
  dlg.onConfirm = async () => {
    const r = await window.ops.pptLib.remove(d.id)
    if (!r.ok) {
      error.value = r.error ?? t('ppt.errDelete')
      return
    }
    await refresh()
  }
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
