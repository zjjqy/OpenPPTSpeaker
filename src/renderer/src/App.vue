<template>
  <div class="orb-app" :class="{ mini }">
    <!-- 完整形态：玻璃面板 -->
    <div v-if="!mini" class="orb-panel">
      <div class="orb-head">
        <span class="lg"></span>
        <span class="tt">{{ t('orb.header') }}</span>
        <span class="spread"></span>
        <button class="ic-btn" :title="t('orb.tipPpt')" @click="openPpt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>
        </button>
        <button class="ic-btn" :title="t('orb.tipSettings')" @click="openSettings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button
          class="ic-btn"
          :disabled="tourActive"
          :title="tourActive ? t('orb.tipMinimizeDisabled') : t('orb.tipMinimize')"
          @click="minimize"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>

      <!-- 能量球 -->
      <div class="orb-body">
        <div class="energy" :class="energyClass">
          <span class="core"></span>
          <span class="ring r3"></span>
          <span class="ring r2"></span>
          <span class="ring"></span>
          <span v-if="store.listening" class="b1"></span>
          <span v-if="store.listening" class="b2"></span>
          <span v-if="store.listening" class="b3"></span>
        </div>

        <div class="orb-status">
          <div class="st-line">
            <span class="pulse-dot" :class="{ on: store.speaking || store.listening }"></span>
            <span class="chip" :class="{ acc: tourActive }">{{ statusLabel }}</span>
          </div>
          <div v-if="store.isPresenting" class="pg-line">
            <span class="mono faint">{{ store.currentIndex || 1 }} / {{ store.totalSections }}</span>
            <div class="progress" style="flex: 1"><i :style="{ width: progressPct + '%' }"></i></div>
          </div>
          <div class="cap">{{ caption }}</div>
        </div>

        <div class="orb-actions">
          <button v-if="!tourActive" class="btn btn-primary btn-lg" @click="toggleMenu">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>
            {{ t('orb.start') }}
          </button>
          <div v-else class="row gap-2" style="width: 100%">
            <button class="btn btn-ghost" style="flex: 1" @click="prev">{{ t('orb.prev') }}</button>
            <button class="btn btn-soft" style="flex: 1" @click="togglePause">
              {{ store.tourState === 'paused' ? t('orb.resume') : t('orb.pause') }}
            </button>
            <button class="btn btn-primary" style="flex: 1" @click="next">{{ t('orb.next') }}</button>
          </div>
          <div class="row gap-2" style="width: 100%">
            <button v-if="tourActive" class="btn btn-ghost" style="flex: 1" @click="endTour">
              {{ t('orb.end') }}
            </button>
            <button v-if="!tourActive" class="btn btn-ghost" style="flex: 1" @click="openPpt">
              {{ t('orb.pptLibrary') }}
            </button>
          </div>
        </div>

        <div v-if="!store.apiReady && !menuOpen" class="key-tip" @click="openSettings">
          {{ t('orb.noApiKey') }}
        </div>
      </div>

      <!-- 讲解内容菜单 -->
      <transition name="fade">
        <div v-if="menuOpen" class="menu">
          <div class="menu-title">{{ t('orb.chooseDeck') }}</div>
          <div class="deck-scroll">
            <button
              v-for="d in decks"
              :key="d.id"
              class="menu-item"
              :class="{ on: d.id === activeDeckId }"
              @click="startDeckTour(d.id)"
            >
              <div class="mi-name">
                {{ d.name }}<span v-if="d.id === activeDeckId" class="mi-cur">{{ t('orb.current') }}</span>
              </div>
              <div class="mi-desc">
                {{ d.source === 'builtin' ? t('orb.builtin') : t('orb.slides', { n: d.slideCount }) }}{{ d.hasScript ? '' : t('orb.noScript') }}
              </div>
            </button>
            <p v-if="decks.length <= 1" class="deck-empty">
              {{ t('orb.emptyDecks') }}<br />{{ t('orb.emptyDecksHint') }}
            </p>
          </div>
          <button class="menu-close" @click="menuOpen = false">✕</button>
        </div>
      </transition>
    </div>

    <!-- 迷你形态：胶囊 -->
    <div v-else class="orb-mini" @dblclick="restore">
      <span class="core"></span>
      <div class="mi-body">
        <div class="mi-title">{{ store.currentTitle || statusLabel }}</div>
        <div class="mi-sub">
          <span class="mono">{{ store.currentIndex || 1 }}/{{ store.totalSections }}</span>
          <div class="progress"><i :style="{ width: progressPct + '%' }"></i></div>
          <span class="pulse-dot" :class="{ on: store.speaking }"></span>
        </div>
      </div>
      <button class="btn btn-icon btn-ghost btn-sm" :title="t('orb.tipPauseResume')" @click="togglePause">
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from './stores/session'
import { initI18n, t } from './i18n'

// 在 setup 阶段同步应用启动语言，保证首帧语言正确（不闪中文）
initI18n()

const store = useSessionStore()
const menuOpen = ref(false)
const mini = ref(false)

const tourActive = computed(
  () => !!store.tourState && store.tourState !== 'idle' && store.tourState !== 'ended'
)
const statusLabel = computed(() => {
  switch (store.tourState) {
    case 'opening':
      // tourMessage 由主进程给出，主进程已按语言取词，为空时才回退本地文案
      return store.tourMessage || t('status.preparing')
    case 'presenting':
      return t('status.presenting')
    case 'listening':
      return t('status.listening')
    case 'paused':
      return t('status.paused')
    case 'answering':
      return t('status.answering')
    case 'resuming':
      return t('status.resuming')
    case 'ended':
      return t('status.ended')
    default:
      return store.listening ? t('status.listening') : store.wakeup ? t('status.wakeup') : t('status.idle')
  }
})
const caption = computed(() => {
  if (store.tourState === 'idle' || store.tourState === 'ended') {
    return t('orb.captionIdle')
  }
  return store.tourMessage || store.currentTitle || ''
})
const progressPct = computed(() =>
  store.totalSections > 0 ? Math.round((store.currentIndex / store.totalSections) * 100) : 0
)
const energyClass = computed(() => ({
  speaking: store.speaking,
  listening: store.listening && !store.speaking,
  quiet: !store.speaking && !store.listening && !store.isPresenting
}))

interface DeckItem {
  id: string
  name: string
  slideCount: number
  hasScript: boolean
  source: string
}
const decks = ref<DeckItem[]>([])
const activeDeckId = ref('')

async function loadDecks(): Promise<void> {
  const r = await window.ops.pptLib.list()
  decks.value = r.decks as DeckItem[]
  activeDeckId.value = r.activeDeckId
}
function toggleMenu(): void {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) void loadDecks()
}
function startDeckTour(deckId: string): void {
  menuOpen.value = false
  void window.ops.tour.start({ deckId })
}
function endTour(): void {
  menuOpen.value = false
  void window.ops.tour.end()
}
function togglePause(): void {
  if (store.tourState === 'paused' || store.tourState === 'listening') void window.ops.tour.resume()
  else void window.ops.tour.pause()
}
function next(): void {
  void window.ops.tour.next()
}
function prev(): void {
  void window.ops.tour.prev()
}
function openSettings(): void {
  menuOpen.value = false
  window.ops.window.openSettings()
}
function openPpt(): void {
  menuOpen.value = false
  window.ops.window.openPpt()
}
function minimize(): void {
  window.ops.window.minimize()
}
function restore(): void {
  window.ops.window.restore()
}

onMounted(() => {
  store.bind()
  window.ops.window.onOrbMinimized((m) => {
    mini.value = m
  })
})
</script>

<style scoped>
.orb-app {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: hidden;
}

/* ===== 完整面板 ===== */
.orb-panel {
  width: 340px;
  border-radius: 24px;
  background: var(--vd-glass);
  backdrop-filter: blur(22px) saturate(1.4);
  -webkit-backdrop-filter: blur(22px) saturate(1.4);
  border: 1px solid var(--vd-hairline);
  box-shadow: var(--vd-shadow-lg);
  overflow: hidden;
  position: relative;
}
.orb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 6px;
}
.orb-head .lg {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--vd-accent), var(--vd-accent-strong) 75%);
  position: relative;
}
.orb-head .lg::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 1px dashed var(--vd-accent-ring);
}
.orb-head .tt { font-weight: 700; font-size: 13.5px; }
.ic-btn {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: var(--vd-text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.ic-btn:hover { background: var(--vd-accent-soft); color: var(--vd-accent); }
.ic-btn:disabled { opacity: 0.35; pointer-events: none; }
.ic-btn svg { width: 15px; height: 15px; }

/* 能量球 */
.orb-body {
  padding: 6px 20px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  -webkit-app-region: no-drag;
}
.energy {
  position: relative;
  width: 132px;
  height: 132px;
  margin: 6px auto 8px;
}
.energy .core {
  position: absolute;
  inset: 38px;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #fff, var(--vd-accent) 45%, var(--vd-accent-strong) 80%);
  box-shadow: 0 6px 24px -6px var(--vd-accent), 0 0 0 6px var(--vd-accent-soft);
  animation: breathe 4s ease-in-out infinite;
}
.energy .ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1.5px solid var(--vd-accent-ring);
}
.energy .ring.r2 { inset: 12px; border-style: dashed; animation: spin 16s linear infinite; }
.energy .ring.r3 { inset: 22px; border-color: var(--vd-hairline); }
.energy .b1,
.energy .b2,
.energy .b3 {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--vd-accent);
  opacity: 0;
  animation: bump 2.2s var(--vd-ease) infinite;
}
.energy .b2 { animation-delay: 0.55s; }
.energy .b3 { animation-delay: 1.1s; }
.energy.speaking .core { animation-duration: 1.2s; }
.energy.quiet { filter: saturate(0.35); opacity: 0.9; }
@keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes bump {
  0% { transform: scale(0.8); opacity: 0.55; }
  100% { transform: scale(1.25); opacity: 0; }
}

/* 状态 */
.orb-status { width: 100%; text-align: center; margin-top: 6px; }
.st-line { display: flex; align-items: center; justify-content: center; gap: 8px; }
.pg-line { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.pg-line .mono { font-size: 11px; }
.cap { font-size: 11.5px; color: var(--vd-text-3); margin-top: 6px; }

.orb-actions {
  margin-top: 14px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.orb-actions .btn { width: 100%; }

.key-tip {
  margin-top: 10px;
  font-size: 11px;
  color: var(--vd-accent);
  background: var(--vd-accent-soft);
  border: 1px dashed var(--vd-accent-ring);
  padding: 5px 12px;
  border-radius: 20px;
  cursor: pointer;
}

/* 菜单 */
.menu {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 62px;
  background: var(--vd-surface);
  border: 1px solid var(--vd-line);
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--vd-shadow-lg);
}
.menu-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; text-align: center; }
.deck-scroll {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.menu-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--vd-line-2);
  border-radius: 10px;
  background: var(--vd-surface-2);
  color: var(--vd-text-1);
  text-align: left;
  cursor: pointer;
}
.menu-item:hover { border-color: var(--vd-accent-ring); }
.menu-item.on { border-color: var(--vd-accent); background: var(--vd-accent-softer); }
.mi-name { font-size: 13px; font-weight: 600; }
.mi-cur { color: var(--vd-accent); font-size: 11px; }
.mi-desc { font-size: 11px; color: var(--vd-text-3); }
.deck-empty { text-align: center; font-size: 11.5px; color: var(--vd-text-3); line-height: 1.7; padding: 6px 0; }
.menu-close {
  position: absolute;
  top: 8px;
  right: 10px;
  background: none;
  border: none;
  color: var(--vd-text-3);
  font-size: 13px;
}

/* ===== 迷你胶囊 ===== */
.orb-mini {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 92%;
  border-radius: 999px;
  padding: 8px 10px;
  background: var(--vd-glass-strong);
  backdrop-filter: blur(18px);
  border: 1px solid var(--vd-hairline);
  box-shadow: var(--vd-shadow-lg);
}
.orb-mini .core {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #fff, var(--vd-accent) 45%, var(--vd-accent-strong) 80%);
}
.mi-body { flex: 1; min-width: 0; }
.mi-title {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mi-sub { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
.mi-sub .mono { font-size: 10px; color: var(--vd-text-3); }
.mi-sub .progress { flex: 1; height: 4px; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
