<template>
  <div class="editor">
    <!-- 顶部：选择 PPT + 操作 -->
    <div class="toolbar">
      <select v-model="deckId" @change="loadDeck()">
        <option value="" disabled>{{ t('edit.selectDeck') }}</option>
        <option v-for="d in editableDecks" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <template v-if="deckId">
        <button
          class="btn"
          :class="{ primary: styleOpen }"
          :title="t('edit.subtitleStyleTip')"
          @click="toggleStylePanel"
        >
          {{ t('edit.subtitleStyle') }}
        </button>
        <button class="btn" :disabled="!canUndo" :title="t('edit.undoTip')" @click="undo">
          {{ t('edit.undo') }}
        </button>
        <button class="btn" :disabled="!canRedo" :title="t('edit.redoTip')" @click="redo">
          {{ t('edit.redo') }}
        </button>
        <button class="btn" @click="doImportScript">{{ t('edit.importScript') }}</button>
        <button class="btn primary" :disabled="!dirty" @click="doSave">{{ t('edit.saveScript') }}</button>
        <span v-if="savedTip" class="ok">{{ t('edit.savedTip') }}</span>
      </template>
    </div>
    <p v-if="error" class="err">⚠ {{ error }}</p>

    <div v-if="deckId && script" class="workbench">
      <!-- 左：页缩略图 -->
      <div class="slide-strip">
        <div
          v-for="s in script.slides"
          :key="s.slide"
          class="slide-item"
          :class="{ on: s.slide === currentSlide }"
          @click="selectSlide(s.slide)"
        >
          <img v-if="thumbs[s.slide]" :src="thumbs[s.slide]" alt="" />
          <span class="no">{{ s.slide }}</span>
        </div>
      </div>

      <!-- 中：页面预览 + 框选 -->
      <div class="stage-wrap">
        <div
          ref="stageRef"
          class="stage"
          :class="{ boxing: boxingIndex !== null }"
          @mousedown="onBoxStart"
          @mousemove="onBoxMove"
          @mouseup="onBoxEnd"
          @mouseleave="onBoxEnd"
        >
          <img v-if="slideImage" :src="slideImage" alt="" draggable="false" @load="onImgLoad" />
          <!-- 聚光框：只显示当前选中句的框（各句独立，不同时展示） -->
          <div
            v-for="(sent, i) in currentSpeech"
            :key="i"
            v-show="i === selSentence && !!sent.spotlight"
            class="rect on"
            :style="rectStyle(sent.spotlight)"
          >
            <span class="tag">{{ i + 1 }}</span>
          </div>
          <!-- 拖拽中的框 -->
          <div v-if="dragRect" class="rect dragging" :style="rectStyle(dragRect)"></div>
          <div v-if="boxingIndex !== null" class="box-tip">
            {{ t('edit.boxTip', { n: boxingIndex + 1 }) }}
          </div>
          <!-- 选中句字幕预览：与讲演字幕窗口同构（shell 容器 → 文字 → 进度），共用同一套换算函数 -->
          <div v-if="selSentenceText" class="preview-shell" :style="previewShellStyle">
            <div class="ps-text" :style="previewTextStyle">{{ selSentenceText }}</div>
            <div v-if="sty.showProgress" class="ps-progress" :style="previewProgressStyle">
              {{ selSentence + 1 }} / {{ currentSpeech.length }}
            </div>
          </div>
        </div>
        <p class="hint">{{ t('edit.stageHint') }}</p>
      </div>

      <!-- 右：句子列表 -->
      <div class="sent-panel">
        <div class="sent-head">
          <span>{{ t('edit.slideHeader', { n: currentSlide, m: currentSpeech.length }) }}</span>
          <button class="mini" @click="addSentence">{{ t('edit.addSentence') }}</button>
        </div>
        <div class="sent-list">
          <div
            v-for="(sent, i) in currentSpeech"
            :key="i"
            class="sent-row"
            :class="{ on: i === selSentence }"
            @click="selSentence = i"
          >
            <div class="sent-no">{{ i + 1 }}</div>
            <textarea
              v-model="sent.text"
              rows="2"
              @focus="beginEdit"
              @input="onTextInput(i)"
              @blur="endEdit"
            ></textarea>
            <div class="sent-ops">
              <button class="mini" :class="{ primary: boxingIndex === i }" @click.stop="startBox(i)">
                {{ boxingIndex === i ? t('action.cancel') : sent.spotlight ? t('edit.rebox') : t('edit.box') }}
              </button>
              <button v-if="sent.spotlight" class="mini" @click.stop="clearBox(i)">
                {{ t('edit.clearBox') }}
              </button>
              <button class="mini" :disabled="i === 0" @click.stop="moveSentence(i, -1)">↑</button>
              <button class="mini" :disabled="i === currentSpeech.length - 1" @click.stop="moveSentence(i, 1)">↓</button>
              <button class="mini danger" @click.stop="removeSentence(i)">{{ t('edit.deleteShort') }}</button>
            </div>
          </div>
          <p v-if="currentSpeech.length === 0" class="hint">{{ t('edit.emptySentences') }}</p>
        </div>
      </div>
    </div>
    <!-- 字幕样式：整份讲稿统一，作用于编辑预览 / AI 讲演 / 导出视频 -->
    <div v-if="deckId && script && styleOpen" class="style-panel">
      <div class="sp-head">
        <b>{{ t('edit.subtitleStyle') }}</b>
        <span class="sp-scope">{{ t('edit.styleScope') }}</span>
        <button class="mini" @click="resetStyle">{{ t('edit.resetStyle') }}</button>
        <button class="mini" @click="styleOpen = false">{{ t('action.close') }}</button>
      </div>
      <div class="sp-body">
        <div class="sp-sec">{{ t('edit.secText') }}</div>
        <label class="sp-row">
          <span>{{ t('edit.font') }}</span>
          <select v-model="sty.fontFamily" @change="onStyleChange">
            <option value='"Microsoft YaHei", "PingFang SC", sans-serif'>{{ t('edit.fontMsYahei') }}</option>
            <option value='"SimHei", sans-serif'>{{ t('edit.fontSimHei') }}</option>
            <option value='"SimSun", serif'>{{ t('edit.fontSimSun') }}</option>
            <option value='"KaiTi", serif'>{{ t('edit.fontKaiTi') }}</option>
            <option value='"Source Han Sans CN", "Noto Sans SC", sans-serif'>{{ t('edit.fontSourceHan') }}</option>
            <option value='Arial, Helvetica, sans-serif'>Arial</option>
          </select>
        </label>
        <label class="sp-row">
          <span>{{ t('edit.fontWeight') }}</span>
          <select v-model.number="sty.fontWeight" @change="onStyleChange">
            <option :value="400">{{ t('edit.weight.regular') }}</option>
            <option :value="500">{{ t('edit.weight.medium') }}</option>
            <option :value="600">{{ t('edit.weight.semibold') }}</option>
            <option :value="700">{{ t('edit.weight.bold') }}</option>
          </select>
        </label>
        <label class="sp-row">
          <span>{{ t('edit.fontSize', { v: sty.fontSizePct.toFixed(2) }) }}</span>
          <input v-model.number="sty.fontSizePct" type="range" min="1" max="8" step="0.05" @change="onStyleChange" />
        </label>
        <label class="sp-row">
          <span>{{ t('edit.lineHeight', { v: sty.lineHeight.toFixed(2) }) }}</span>
          <input v-model.number="sty.lineHeight" type="range" min="1" max="2.4" step="0.05" @change="onStyleChange" />
        </label>
        <label class="sp-row">
          <span>{{ t('edit.color') }}</span>
          <input v-model="sty.color" type="color" @change="onStyleChange" />
        </label>
        <label class="sp-row">
          <span>{{ t('edit.showProgress') }}</span>
          <input v-model="sty.showProgress" type="checkbox" @change="onStyleChange" />
        </label>

        <div class="sp-sec">{{ t('edit.secBg') }}</div>
        <label class="sp-row">
          <span>{{ t('edit.enabled') }}</span>
          <input v-model="sty.bgEnabled" type="checkbox" @change="onStyleChange" />
        </label>
        <template v-if="sty.bgEnabled">
          <label class="sp-row">
            <span>{{ t('edit.bgColor') }}</span>
            <input v-model="sty.bgColor" type="color" @change="onStyleChange" />
          </label>
          <label class="sp-row">
            <span>{{ t('edit.bgRadius', { v: sty.bgRadius }) }}</span>
            <input v-model.number="sty.bgRadius" type="range" min="0" max="48" step="1" @change="onStyleChange" />
          </label>
          <label class="sp-row">
            <span>{{ t('edit.bgPaddingX', { v: sty.bgPaddingX }) }}</span>
            <input v-model.number="sty.bgPaddingX" type="range" min="0" max="80" step="1" @change="onStyleChange" />
          </label>
          <label class="sp-row">
            <span>{{ t('edit.bgPaddingY', { v: sty.bgPaddingY }) }}</span>
            <input v-model.number="sty.bgPaddingY" type="range" min="0" max="60" step="1" @change="onStyleChange" />
          </label>
        </template>

        <div class="sp-sec">{{ t('edit.secStroke') }}</div>
        <label class="sp-row">
          <span>{{ t('edit.enabled') }}</span>
          <input v-model="sty.strokeEnabled" type="checkbox" @change="onStyleChange" />
        </label>
        <template v-if="sty.strokeEnabled">
          <label class="sp-row">
            <span>{{ t('edit.color') }}</span>
            <input v-model="sty.strokeColor" type="color" @change="onStyleChange" />
          </label>
          <label class="sp-row">
            <span>{{ t('edit.strokeWidth', { v: sty.strokeWidth }) }}</span>
            <input v-model.number="sty.strokeWidth" type="range" min="0.5" max="10" step="0.5" @change="onStyleChange" />
          </label>
        </template>

        <div class="sp-sec">{{ t('edit.secShadow') }}</div>
        <label class="sp-row">
          <span>{{ t('edit.enabled') }}</span>
          <input v-model="sty.shadowEnabled" type="checkbox" @change="onStyleChange" />
        </label>
        <template v-if="sty.shadowEnabled">
          <label class="sp-row">
            <span>{{ t('edit.color') }}</span>
            <input v-model="sty.shadowColor" type="color" @change="onStyleChange" />
          </label>
          <label class="sp-row">
            <span>{{ t('edit.shadowBlur', { v: sty.shadowBlur }) }}</span>
            <input v-model.number="sty.shadowBlur" type="range" min="0" max="40" step="1" @change="onStyleChange" />
          </label>
          <label class="sp-row">
            <span>{{ t('edit.shadowOffsetX', { v: sty.shadowOffsetX }) }}</span>
            <input v-model.number="sty.shadowOffsetX" type="range" min="-30" max="30" step="1" @change="onStyleChange" />
          </label>
          <label class="sp-row">
            <span>{{ t('edit.shadowOffsetY', { v: sty.shadowOffsetY }) }}</span>
            <input v-model.number="sty.shadowOffsetY" type="range" min="-30" max="30" step="1" @change="onStyleChange" />
          </label>
        </template>

        <div class="sp-sec">{{ t('edit.secPosition') }}</div>
        <label class="sp-row">
          <span>{{ t('edit.bottomPct', { v: sty.bottomPct.toFixed(1) }) }}</span>
          <input v-model.number="sty.bottomPct" type="range" min="0" max="20" step="0.1" @change="onStyleChange" />
        </label>
        <label class="sp-row">
          <span>{{ t('edit.maxWidthPct', { v: sty.maxWidthPct }) }}</span>
          <input v-model.number="sty.maxWidthPct" type="range" min="40" max="100" step="1" @change="onStyleChange" />
        </label>
      </div>
    </div>
    <p v-else-if="deckId" class="hint">{{ t('tip.loading') }}</p>
    <p v-else class="hint">{{ t('edit.chooseHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import type { DeckScriptV2, PptDeckMeta, SpotlightRect, SpeechSentenceV2, SubtitleStyle } from '@shared/ppt'
import { DEFAULT_SUBTITLE_STYLE } from '@shared/ppt'
import { subtitleShellStyle, subtitleTextStyle, subtitleProgressStyle } from '../subtitle-style'
import { initI18n, t } from '../i18n'

// 在 setup 阶段同步应用启动语言（本组件由 PptApp 渲染，此处兜底即可）
initI18n()

/** 从 PPT 管理页跳转过来的目标 deck（跳转后自动选中并加载） */
const props = defineProps<{ targetDeckId?: string }>()
const emit = defineEmits<{ (e: 'clear-target'): void }>()

watch(
  () => props.targetDeckId,
  async (id) => {
    if (id && id !== deckId.value) {
      deckId.value = id
      await loadDeck()
    }
    if (id) emit('clear-target')
  }
)

const decks = ref<PptDeckMeta[]>([])
const deckId = ref('')
const script = ref<DeckScriptV2 | null>(null)
const currentSlide = ref(1)
const slideImage = ref('')
const thumbs = reactive<Record<number, string>>({})
const selSentence = ref(0)
const boxingIndex = ref<number | null>(null)
const dragRect = ref<SpotlightRect | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const dirty = ref(false)
const savedTip = ref(false)
const error = ref('')

const editableDecks = computed(() => decks.value.filter((d) => d.source !== 'builtin'))
const currentSpeech = computed<SpeechSentenceV2[]>(() => {
  const s = script.value?.slides[currentSlide.value - 1]
  return s?.speech ?? []
})

/** 当前讲稿的字幕样式（loadDeck 已保证存在） */
const sty = computed<SubtitleStyle>(() => script.value!.subtitleStyle!)

// ---------- 撤销 / 重做 ----------
/**
 * 采用"整份讲稿快照"式历史：数据量小（每页几句文本 + 坐标），
 * 一次快照即可覆盖文本修改、增删句、排序、聚光框等全部编辑类型。
 */
const HISTORY_LIMIT = 50
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function snapshot(): string | null {
  if (!script.value) return null
  return JSON.stringify(script.value)
}

/** 修改前记录当前状态；发生新编辑后重做栈失效 */
function pushHistory(): void {
  const snap = snapshot()
  if (!snap) return
  undoStack.value.push(snap)
  if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
  redoStack.value = []
}

/** 按快照恢复状态（撤销/重做共用） */
function applySnapshot(jsonStr: string): void {
  const data = JSON.parse(jsonStr) as DeckScriptV2
  script.value = data
  // 快照里本页句数可能更少 → 防止选中越界
  const n = data.slides[currentSlide.value - 1]?.speech.length ?? 0
  if (selSentence.value >= n) selSentence.value = Math.max(0, n - 1)
  boxingIndex.value = null
  dirty.value = true
}

async function undo(): Promise<void> {
  const prev = undoStack.value.pop()
  if (prev === undefined) return
  const cur = snapshot()
  if (cur) redoStack.value.push(cur)
  applySnapshot(prev)
  await doSave()
}

async function redo(): Promise<void> {
  const next = redoStack.value.pop()
  if (next === undefined) return
  const cur = snapshot()
  if (cur) undoStack.value.push(cur)
  applySnapshot(next)
  await doSave()
}

// 文本编辑：同一句的连续输入合并为一条历史（切换句子或停顿 800ms 后另起一条）
let pendingSnap: string | null = null
let pendingKey = ''
let pendingTimer: ReturnType<typeof setTimeout> | null = null

/** 聚焦文本框：留存"编辑前"的快照（此刻文本尚未改动） */
function beginEdit(): void {
  if (!pendingSnap) pendingSnap = snapshot()
}

function onTextInput(i: number): void {
  dirty.value = true
  const key = `${currentSlide.value}:${i}`
  if (key !== pendingKey) {
    const snap = pendingSnap ?? snapshot()
    if (snap) {
      undoStack.value.push(snap)
      if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
      redoStack.value = []
    }
    pendingSnap = null
    pendingKey = key
  }
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    pendingKey = ''
    pendingTimer = null
  }, 800)
}

/** 失焦：结束合并窗口，下次输入另起一条历史 */
function endEdit(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  pendingKey = ''
  pendingSnap = null
}

/** Ctrl+Z 撤销 / Ctrl+Shift+Z、Ctrl+Y 重做（输入框内同样生效，并屏蔽浏览器原生撤销） */
function onHistoryKeydown(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) {
    if (!canUndo.value) return
    e.preventDefault()
    void undo()
  } else if ((k === 'z' && e.shiftKey) || k === 'y') {
    if (!canRedo.value) return
    e.preventDefault()
    void redo()
  }
}

// ---------- 选中句字幕预览 ----------
/** 当前选中句文本（空则不显示字幕条） */
const selSentenceText = computed(() => currentSpeech.value[selSentence.value]?.text ?? '')
/** stage 实时宽度（ResizeObserver 跟踪），字幕按比例缩放的基准 */
const stageWidth = ref(0)
/** 预览图实际宽高比（默认 16:9；导入图片可能非 16:9，img 加载后修正） */
const imgRatio = ref(9 / 16)
let stageRO: ResizeObserver | null = null

function onImgLoad(e: Event): void {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth > 0) imgRatio.value = img.naturalHeight / img.naturalWidth
}

/**
 * 字幕预览：与讲演字幕窗口完全同构（shell 容器 → 文字 → 进度），
 * 三层分别使用与 subtitle-main.ts 相同的换算函数，画布高度取预览图实际高度，
 * 保证编辑所见与讲演所见像素级一致。
 */
const previewShellStyle = computed<Record<string, string>>((): Record<string, string> => {
  const w = stageWidth.value
  if (!w || !script.value) return { display: 'none' }
  const h = w * imgRatio.value
  return subtitleShellStyle(sty.value, h)
})

const previewTextStyle = computed<Record<string, string>>((): Record<string, string> => {
  const w = stageWidth.value
  if (!w || !script.value) return {}
  const h = w * imgRatio.value
  return subtitleTextStyle(sty.value, h)
})

/** 句序进度行样式 */
const previewProgressStyle = computed<Record<string, string>>(() => subtitleProgressStyle(sty.value))

// ---------- 字幕样式面板 ----------
const styleOpen = ref(false)
/** 一次「打开面板 → 调整 → 关闭」记为一条撤销记录，避免拖动滑块刷屏 */
let styleHistoryPushed = false

function toggleStylePanel(): void {
  styleOpen.value = !styleOpen.value
  styleHistoryPushed = false
}

/** 样式改动：实时预览；本次面板会话的首次改动才记历史 */
function onStyleChange(): void {
  dirty.value = true
  if (!styleHistoryPushed) {
    pushHistory()
    styleHistoryPushed = true
  }
}

function resetStyle(): void {
  onStyleChange()
  if (script.value) script.value.subtitleStyle = { ...DEFAULT_SUBTITLE_STYLE }
}

function rectStyle(r: SpotlightRect | null | undefined): Record<string, string> {
  if (!r) return { display: 'none' }
  return { left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' }
}

async function refreshDecks(): Promise<void> {
  const r = await window.ops.pptLib.list()
  decks.value = r.decks
  // 默认选中活动 deck（若非内置）
  if (!deckId.value && r.activeDeckId && r.activeDeckId !== 'builtin') {
    deckId.value = r.activeDeckId
    await loadDeck()
  }
}

/** keepHistory = true 时不重置历史（用于"导入讲稿"后重载，使导入本身可撤销） */
async function loadDeck(keepHistory = false): Promise<void> {
  if (!deckId.value) return
  error.value = ''
  const r = await window.ops.pptLib.getScript(deckId.value)
  if (r.script) {
    script.value = r.script
  } else {
    // 无讲稿 → 建空骨架
    script.value = {
      version: 2,
      meta: { title: r.name, slideCount: r.slideCount, generatedBy: 'manual', updatedAt: new Date().toISOString() },
      slides: Array.from({ length: r.slideCount }, (_, i) => ({
        slide: i + 1,
        title: t('edit.slideTitle', { n: i + 1 }),
        speech: []
      }))
    }
  }
  // 确保 slides 数与页面数一致
  while (script.value.slides.length < r.slideCount) {
    const n = script.value.slides.length + 1
    script.value.slides.push({ slide: n, title: t('edit.slideTitle', { n }), speech: [] })
  }
  // 字幕样式：旧讲稿文件没有该字段，按默认值补齐（缺字段也合并，避免升级后缺项）
  script.value.subtitleStyle = { ...DEFAULT_SUBTITLE_STYLE, ...(script.value.subtitleStyle ?? {}) }
  dirty.value = false
  currentSlide.value = 1
  selSentence.value = 0
  boxingIndex.value = null
  if (!keepHistory) {
    undoStack.value = []
    redoStack.value = []
    endEdit()
  }
  await loadSlideImages()
}

async function loadSlideImages(): Promise<void> {
  if (!deckId.value) return
  const n = script.value?.slides.length ?? 0
  slideImage.value = await window.ops.pptLib.slideImage({ deckId: deckId.value, slide: currentSlide.value })
  for (let i = 1; i <= n; i++) {
    if (!thumbs[i]) {
      thumbs[i] = await window.ops.pptLib.slideImage({ deckId: deckId.value, slide: i, thumb: true })
    }
  }
}

async function selectSlide(n: number): Promise<void> {
  currentSlide.value = n
  selSentence.value = 0
  boxingIndex.value = null
  slideImage.value = await window.ops.pptLib.slideImage({ deckId: deckId.value, slide: n })
}

// ---------- 句子操作 ----------
function addSentence(): void {
  const slide = script.value?.slides[currentSlide.value - 1]
  if (!slide) return
  pushHistory()
  slide.speech.push({ text: '' })
  selSentence.value = slide.speech.length - 1
  dirty.value = true
}

function removeSentence(i: number): void {
  pushHistory()
  currentSpeech.value.splice(i, 1)
  if (selSentence.value >= currentSpeech.value.length) {
    selSentence.value = Math.max(0, currentSpeech.value.length - 1)
  }
  dirty.value = true
}

function moveSentence(i: number, dir: -1 | 1): void {
  const arr = currentSpeech.value
  const j = i + dir
  if (j < 0 || j >= arr.length) return
  pushHistory()
  const [item] = arr.splice(i, 1)
  arr.splice(j, 0, item)
  selSentence.value = j
  dirty.value = true
}

// ---------- 框选 ----------
function startBox(i: number): void {
  boxingIndex.value = boxingIndex.value === i ? null : i
  selSentence.value = i
}

function clearBox(i: number): void {
  pushHistory()
  delete currentSpeech.value[i].spotlight
  dirty.value = true
}

function stagePct(e: MouseEvent): { x: number; y: number } {
  const el = stageRef.value!
  const r = el.getBoundingClientRect()
  return {
    x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
    y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))
  }
}

let boxAnchor: { x: number; y: number } | null = null

function onBoxStart(e: MouseEvent): void {
  if (boxingIndex.value === null) return
  boxAnchor = stagePct(e)
  dragRect.value = { x: boxAnchor.x, y: boxAnchor.y, w: 0, h: 0 }
  e.preventDefault()
}

function onBoxMove(e: MouseEvent): void {
  if (boxingIndex.value === null || !boxAnchor) return
  const p = stagePct(e)
  dragRect.value = {
    x: Math.round(Math.min(boxAnchor.x, p.x) * 10) / 10,
    y: Math.round(Math.min(boxAnchor.y, p.y) * 10) / 10,
    w: Math.round(Math.abs(p.x - boxAnchor.x) * 10) / 10,
    h: Math.round(Math.abs(p.y - boxAnchor.y) * 10) / 10
  }
}

function onBoxEnd(): void {
  if (boxingIndex.value === null || !boxAnchor) return
  const r = dragRect.value
  if (r && r.w >= 2 && r.h >= 2) {
    pushHistory()
    currentSpeech.value[boxingIndex.value].spotlight = r
    dirty.value = true
  }
  boxAnchor = null
  dragRect.value = null
  boxingIndex.value = null
}

// ---------- 保存 / 导入 ----------
async function doSave(): Promise<void> {
  if (!deckId.value || !script.value) return
  error.value = ''
  try {
    // Vue 响应式 Proxy 不能直接过 IPC 结构化克隆，先 JSON 序列化为纯对象
    const plain = JSON.parse(JSON.stringify(script.value)) as DeckScriptV2
    const r = await window.ops.pptLib.saveScript(deckId.value, plain)
    if (!r.ok) {
      error.value = r.error ?? t('edit.errSave')
      return
    }
    dirty.value = false
    savedTip.value = true
    setTimeout(() => (savedTip.value = false), 2000)
  } catch (e) {
    error.value = t('edit.errSaveDetail', { msg: (e as Error).message })
  }
}

async function doImportScript(): Promise<void> {
  if (!deckId.value) return
  error.value = ''
  pushHistory() // 导入可撤销
  const r = await window.ops.pptLib.importScript(deckId.value)
  if (!r.ok) {
    undoStack.value.pop() // 取消或失败 → 撤掉这条历史
    if (!r.cancelled) error.value = r.error ?? t('edit.errImport')
    return
  }
  await loadDeck(true)
}

onMounted(() => {
  void refreshDecks()
  observeStage()
  window.addEventListener('keydown', onHistoryKeydown)
})

onBeforeUnmount(() => {
  stageRO?.disconnect()
  stageRO = null
  window.removeEventListener('keydown', onHistoryKeydown)
})

/** 给预览区挂尺寸监听：字幕字号随窗口/布局变化等比缩放 */
function observeStage(): void {
  stageRO?.disconnect()
  stageRO = null
  if (!stageRef.value) return
  stageRO = new ResizeObserver((entries) => {
    for (const en of entries) stageWidth.value = en.contentRect.width
  })
  stageRO.observe(stageRef.value)
}

// stage 在 v-if="deckId && script" 下延迟创建：选中 PPT 后元素才出现，此时再挂 RO
watch(stageRef, () => observeStage())
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  /* 字幕样式面板相对本容器定位 */
  position: relative;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
select {
  padding: 7px 10px;
  border: 1px solid var(--vd-line);
  border-radius: 8px;
  font-size: 13px;
  min-width: 220px;
}
.btn {
  padding: 7px 14px;
  border: 1px solid var(--vd-line);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn.primary {
  background: var(--vd-accent);
  border-color: var(--vd-accent);
  color: #fff;
}
.btn:disabled {
  opacity: 0.5;
}
.ok {
  color: #52c41a;
  font-size: 12px;
}
.err {
  color: #d4380d;
  font-size: 13px;
  margin: 0;
}
.hint {
  font-size: 12px;
  color: #888;
  margin: 4px 0;
}
.workbench {
  display: flex;
  gap: 12px;
  min-height: 0;
  flex: 1;
}
.slide-strip {
  width: 150px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding-right: 4px;
}
.slide-strip::-webkit-scrollbar {
  width: 6px;
}
.slide-strip::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}
.slide-item {
  position: relative;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--vd-bg-2);
  aspect-ratio: 16/9;
  /* 保证缩略图始终有可见高度（导入竖版页面时也不塌陷） */
  min-height: 84px;
  flex-shrink: 0;
}
.slide-item.on {
  border-color: var(--vd-accent);
}
.slide-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.slide-item .no {
  position: absolute;
  left: 4px;
  bottom: 2px;
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 2px #000;
}
.stage-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* 页面超高时（超宽窗口铺满列宽后）纵向滚动兜底 */
  overflow-y: auto;
}
.stage {
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  /* 铺满中间列宽：窗口拉伸/最大化时预览随之放大 */
  width: 100%;
}
.stage img {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
}
.stage.boxing {
  cursor: crosshair;
}
.rect {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.65);
  border-radius: 4px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  box-sizing: border-box;
}
.rect.on {
  border-color: var(--vd-accent);
}
.rect.dragging {
  border-color: var(--vd-accent);
  border-style: dashed;
}
.rect .tag {
  position: absolute;
  top: -20px;
  left: -2px;
  font-size: 11px;
  background: var(--vd-accent);
  color: #fff;
  padding: 0 6px;
  border-radius: 4px;
}
/* 选中句字幕预览容器：定位与对齐与讲演字幕窗口的 .subtitle-shell 一致，
   其余外观（背景板/字体/颜色/描边/阴影）全部来自字幕样式的行内样式 */
.preview-shell {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
  z-index: 5;
}
/* 句序进度：位于字幕下方右对齐（右下角），字号相对字幕配置缩放 */
.ps-progress {
  font-weight: 400;
}
/* 字幕样式面板：浮在右侧，不挤压三栏布局 */
.style-panel {
  position: absolute;
  top: 50px;
  right: 0;
  width: 320px;
  max-height: calc(100% - 56px);
  overflow-y: auto;
  background: var(--vd-surface);
  border: 1px solid #e6d8c6;
  border-radius: 10px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
  z-index: 30;
  padding-bottom: 6px;
}
.sp-head {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--vd-surface-2);
  border-bottom: 1px solid #ece0d2;
}
.sp-scope {
  font-size: 11px;
  color: #8a7a68;
  margin-right: auto;
}
.sp-body {
  padding: 4px 10px 8px;
}
.sp-sec {
  font-size: 11px;
  color: #b06a1a;
  font-weight: 700;
  margin: 12px 0 6px;
  padding-bottom: 3px;
  border-bottom: 1px dashed #ecdfcd;
}
.sp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #44403c;
  margin-bottom: 6px;
}
.sp-row > span {
  width: 112px;
  flex-shrink: 0;
}
.sp-row input[type='range'] {
  flex: 1;
  min-width: 0;
}
.sp-row input[type='color'] {
  width: 42px;
  height: 22px;
  padding: 0;
  border: 1px solid #ccc;
  background: none;
}
.sp-row select {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 2px 4px;
}
.box-tip {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #ffd591;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 10px;
  pointer-events: none;
}
.sent-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vd-line);
  border-radius: 8px;
  overflow: hidden;
}
.sent-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: var(--vd-surface-2);
  border-bottom: 1px solid #eee;
  font-size: 13px;
}
.sent-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sent-row {
  display: flex;
  gap: 6px;
  padding: 6px;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
}
.sent-row.on {
  border-color: var(--vd-accent);
  background: var(--vd-accent-softer);
}
.sent-no {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--vd-accent);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4px;
}
.sent-row textarea {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--vd-line);
  border-radius: 6px;
  padding: 5px 7px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
}
.sent-ops {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
}
.mini {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--vd-line);
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  white-space: nowrap;
}
.mini.primary {
  background: var(--vd-accent);
  border-color: var(--vd-accent);
  color: #fff;
}
.mini.danger {
  color: #d4380d;
  border-color: #ffccc7;
}
.mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
