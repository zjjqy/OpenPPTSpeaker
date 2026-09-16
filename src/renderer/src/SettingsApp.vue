<template>
  <div class="settings">
    <!-- 无边框窗口：品牌与版本号移入自绘标题栏，标题栏横跨两栏 -->
    <TitleBar class="tb" :subtitle="`v${appVersion}`" />
    <nav class="side-nav">
      <div class="nav-group">{{ t('settings.group.preferences') }}</div>
      <div class="nav-item" :class="{ on: sec === 'general' }" @click="sec = 'general'">
        {{ t('settings.nav.general') }}
      </div>
      <div class="nav-item" :class="{ on: sec === 'wake' }" @click="sec = 'wake'">
        {{ t('settings.nav.wake') }}
      </div>

      <div class="nav-group">{{ t('settings.group.model') }}</div>
      <div class="nav-item" :class="{ on: sec === 'model' }" @click="sec = 'model'">
        {{ t('settings.nav.model') }}
      </div>

      <div class="nav-group">{{ t('settings.group.connection') }}</div>
      <div class="nav-item" :class="{ on: sec === 'phone' }" @click="sec = 'phone'">
        {{ t('settings.nav.phone') }}
      </div>

      <div class="nav-group">{{ t('settings.group.personalize') }}</div>
      <div class="nav-item" :class="{ on: sec === 'appearance' }" @click="sec = 'appearance'">
        {{ t('settings.nav.appearance') }}
      </div>

      <div class="spread"></div>
      <button class="btn btn-primary" :disabled="!dirty" @click="save">{{ t('action.save') }}</button>
      <span v-if="saved" class="ok-tip">{{ t('tip.saved') }}</span>
    </nav>

    <main class="side-main">
      <!-- 通用 -->
      <section v-if="sec === 'general'" class="sect">
        <h2>{{ t('settings.general.title') }}</h2>
        <p class="desc">{{ t('settings.general.desc') }}</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.language.title') }}</div>
              <div class="sr-desc">{{ t('settings.language.desc') }}</div>
            </div>
            <select v-model="form.language" class="select" style="width: 170px" @change="onLanguageChange">
              <option v-for="l in LANGS" :key="l.value" :value="l.value">{{ l.label }}</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.orbPosition.title') }}</div>
              <div class="sr-desc">{{ t('settings.orbPosition.desc') }}</div>
            </div>
            <select v-model="form.orbPosition" class="select" style="width: 170px" @change="dirty = true">
              <option v-for="p in ORB_POSITIONS" :key="p.value" :value="p.value">{{ t(p.labelKey) }}</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.closeOrb.title') }}</div>
              <div class="sr-desc">{{ t('settings.closeOrb.desc') }}</div>
            </div>
            <span class="chip acc">{{ t('settings.closeOrb.chip') }}</span>
          </div>
        </div>
      </section>

      <!-- 语音与打断 -->
      <section v-if="sec === 'wake'" class="sect">
        <h2>{{ t('settings.wake.title') }}</h2>
        <p class="desc">{{ t('settings.wake.desc') }}</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.enableWake.title') }}</div>
              <div class="sr-desc">{{ t('settings.enableWake.desc') }}</div>
            </div>
            <span class="switch"><input v-model="form.enableWake" type="checkbox" @change="dirty = true" /><i></i></span>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.wakeWords.title') }}</div>
              <div class="sr-desc">{{ t('settings.wakeWords.desc') }}</div>
            </div>
            <input v-model="wakeText" class="input" style="width: 220px" @change="dirty = true" />
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.bargeIn.title') }}</div>
              <div class="sr-desc">{{ t('settings.bargeIn.desc') }}</div>
            </div>
            <span class="switch"><input v-model="form.enableBargeIn" type="checkbox" @change="dirty = true" /><i></i></span>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.pcMic.title') }}</div>
              <div class="sr-desc">{{ t('settings.pcMic.desc') }}</div>
            </div>
            <span class="switch"><input v-model="form.pcMicEnabled" type="checkbox" @change="dirty = true" /><i></i></span>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.history.title') }}</div>
              <div class="sr-desc">{{ t('settings.history.desc') }}</div>
            </div>
            <select v-model.number="form.maxHistory" class="select" style="width: 120px" @change="dirty = true">
              <option :value="6">{{ t('settings.history.rounds', { n: 6 }) }}</option>
              <option :value="12">{{ t('settings.history.rounds', { n: 12 }) }}</option>
              <option :value="24">{{ t('settings.history.rounds', { n: 24 }) }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 模型与语音 -->
      <section v-if="sec === 'model'" class="sect">
        <h2>{{ t('settings.model.title') }}</h2>
        <p class="desc">{{ t('settings.model.desc') }}</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.apiKey.title') }}</div>
              <div class="sr-desc">{{ t('settings.apiKey.desc') }}</div>
            </div>
            <input v-model="form.apiKey" class="input" style="width: 300px" type="password" placeholder="sk-xxxxxxxx" @change="dirty = true" />
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.llm.title') }}</div>
              <div class="sr-desc">{{ t('settings.llm.desc') }}</div>
            </div>
            <select v-model="form.llmModel" class="select" style="width: 230px" @change="dirty = true">
              <option v-for="m in LLM_MODELS" :key="m.value" :value="m.value">{{ t(m.labelKey) }}</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.asr.title') }}</div>
              <div class="sr-desc">{{ t('settings.asr.desc') }}</div>
            </div>
            <select v-model="form.asrModel" class="select" style="width: 230px" @change="dirty = true">
              <option value="paraformer-realtime-v2">paraformer-realtime-v2</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.tts.title') }}</div>
              <div class="sr-desc">{{ t('settings.tts.desc') }}</div>
            </div>
            <select v-model="form.ttsEngine" class="select" style="width: 230px" @change="dirty = true">
              <option value="edge">{{ t('settings.tts.edge') }}</option>
              <option value="cosyvoice">{{ t('settings.tts.cosyvoice') }}</option>
              <option value="sambert">{{ t('settings.tts.sambert') }}</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.voice.title') }}</div>
              <div class="sr-desc">{{ t('settings.voice.desc') }}</div>
            </div>
            <select
              v-if="form.ttsEngine === 'cosyvoice'"
              v-model="form.ttsVoice"
              class="select"
              style="width: 230px"
              @change="dirty = true"
            >
              <option v-for="v in QWEN_TTS_VOICES" :key="v.value" :value="v.value">{{ t(v.labelKey) }}</option>
            </select>
            <select
              v-else-if="form.ttsEngine === 'sambert'"
              v-model="form.sambertVoice"
              class="select"
              style="width: 230px"
              @change="dirty = true"
            >
              <option v-for="v in SAMBERT_VOICES" :key="v.value" :value="v.value">{{ t(v.labelKey) }}</option>
            </select>
            <select v-else v-model="form.edgeVoice" class="select" style="width: 230px" @change="dirty = true">
              <option v-for="v in edgeVoices" :key="v.value" :value="v.value">{{ t(v.labelKey) }}</option>
            </select>
          </div>
          <div v-if="supportsPron" class="setting-row" style="align-items: flex-start">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.pron.title') }}</div>
              <div class="sr-desc">
                {{ t('settings.pron.desc') }}<br />
                {{ form.ttsEngine === 'edge' ? t('settings.pron.edge') : t('settings.pron.cosyvoice') }}
              </div>
            </div>
            <textarea
              v-model="pronText"
              class="textarea"
              style="width: 300px"
              rows="3"
              placeholder="重音=chong2 yin1&#10;解数=xie4 shu4"
              @change="dirty = true"
            ></textarea>
          </div>
        </div>
      </section>

      <!-- 手机遥控 -->
      <section v-if="sec === 'phone'" class="sect">
        <h2>{{ t('settings.phone.title') }}</h2>
        <p class="desc">{{ t('settings.phone.desc') }}</p>
        <div class="phone-grid">
          <div class="card form-card">
            <div class="setting-row">
              <div class="sr-body">
                <div class="sr-title">{{ t('settings.phone.enable.title') }}</div>
                <div class="sr-desc">{{ t('settings.phone.enable.desc') }}</div>
              </div>
              <span class="switch"><input :checked="phoneInfo.enabled" type="checkbox" @change="onTogglePhone" /><i></i></span>
            </div>
            <div class="setting-row">
              <div class="sr-body">
                <div class="sr-title">{{ t('settings.phone.port.title') }}</div>
                <div class="sr-desc">{{ t('settings.phone.port.desc') }}</div>
              </div>
              <input v-model.number="form.phonePort" class="input" style="width: 120px" @change="dirty = true" />
            </div>
            <div class="setting-row">
              <div class="sr-body">
                <div class="sr-title">{{ t('settings.phone.audio.title') }}</div>
                <div class="sr-desc">{{ t('settings.phone.audio.desc') }}</div>
              </div>
              <span class="switch"><input :checked="phoneInfo.audioOutput" type="checkbox" @change="onTogglePhoneAudioOutput" /><i></i></span>
            </div>
            <div class="setting-row">
              <div class="sr-body">
                <div class="sr-title">{{ t('settings.phone.devices.title') }}</div>
                <div class="sr-desc">{{ t('settings.phone.devices.desc') }}</div>
              </div>
              <span class="chip ok">{{ t('settings.phone.devices.online', { n: phoneInfo.connected }) }}</span>
            </div>
          </div>
          <div class="card qr-card">
            <div class="qr-title">{{ t('settings.phone.qr.title') }}</div>
            <div class="qr">
              <img v-if="phoneInfo.qrDataUrl" :src="phoneInfo.qrDataUrl" :alt="t('settings.phone.qr.title')" @error="onQrError" />
              <div v-else class="qr-empty">
                <span>{{ phoneInfo.error ?? t('settings.phone.qr.generating') }}</span>
              </div>
            </div>
            <div class="qr-urls">
              <div v-for="u in phoneInfo.urls" :key="u" class="url">
                <code>{{ u }}</code>
                <button class="btn btn-ghost btn-sm" @click="copyText(u)">{{ t('action.copy') }}</button>
              </div>
            </div>
            <p v-if="phoneInfo.detectedIps.length" class="faint" style="font-size: 11.5px">
              {{ t('settings.phone.detected', { list: phoneInfo.detectedIps.join(ipSeparator) }) }}
            </p>
          </div>
        </div>
      </section>

      <!-- 外观 -->
      <section v-if="sec === 'appearance'" class="sect">
        <h2>{{ t('settings.appearance.title') }}</h2>
        <p class="desc">{{ t('settings.appearance.desc') }}</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.theme.title') }}</div>
              <div class="sr-desc">{{ t('settings.theme.desc') }}</div>
            </div>
            <div class="seg">
              <button :class="{ on: form.theme === 'light' }" @click="setTheme('light')">
                {{ t('settings.theme.light') }}
              </button>
              <button :class="{ on: form.theme === 'dark' }" @click="setTheme('dark')">
                {{ t('settings.theme.dark') }}
              </button>
              <button :class="{ on: form.theme === 'auto' }" @click="setTheme('auto')">
                {{ t('settings.theme.auto') }}
              </button>
            </div>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">{{ t('settings.accent.title') }}</div>
              <div class="sr-desc">{{ t('settings.accent.desc') }}</div>
            </div>
            <div class="swatches">
              <button
                v-for="a in ACCENTS"
                :key="a.value"
                class="swatch"
                :class="{ on: form.accent === a.value }"
                :title="t(a.labelKey)"
                @click="setAccent(a.value)"
              >
                <span class="inner" :style="{ '--s': a.css }"></span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import {
  QWEN_TTS_VOICES,
  LLM_MODELS,
  SAMBERT_VOICES,
  ORB_POSITIONS,
  ACCENTS,
  edgeVoicesFor,
  type AppConfig,
  type ThemeMode
} from '../../main/config/schema'
import { LANGS } from '@shared/i18n'
import TitleBar from './components/TitleBar.vue'
import { initI18n, lang, t } from './i18n'

// 在 setup 阶段同步应用启动语言，保证首帧就是正确语言（不闪中文）
initI18n()

const appVersion = window.ops.appVersion
const sec = ref('general')

const form = reactive<AppConfig>({
  language: 'zh-CN',
  apiKey: '',
  llmModel: 'qwen3.8-flash',
  asrModel: 'paraformer-realtime-v2',
  ttsEngine: 'edge',
  ttsVoice: 'longanfengyue',
  ttsPronunciations: [],
  sambertVoice: 'sambert-zhichu-v1',
  edgeVoice: 'zh-CN-XiaoxiaoNeural',
  wakeWords: ['小讲', '你好小讲'],
  enableWake: true,
  maxHistory: 12,
  enableBargeIn: true,
  pcMicEnabled: false,
  phoneBridgeEnabled: false,
  phoneAudioOutput: false,
  phonePort: 8123,
  phoneHost: '',
  orbPosition: 'bottom-right',
  theme: 'auto',
  accent: 'ocean'
})

/** 当前语言下可选的 Edge 音色：英文界面只列英文音色，避免选出「念不出英文」的组合 */
const edgeVoices = computed(() => edgeVoicesFor(form.language))
/** 网卡地址分隔符：中文用全角逗号，英文用半角 */
const ipSeparator = computed(() => (lang.value === 'zh-CN' ? '，' : ', '))
/** 多音字标注仅对支持 phoneme 的引擎开放（Qwen=py / Edge=sapi） */
const supportsPron = computed(
  () => form.ttsEngine === 'cosyvoice' || form.ttsEngine === 'edge'
)
const wakeText = ref('小讲，你好小讲')
const pronText = ref('')
const dirty = ref(false)
const saved = ref(false)
const phoneInfo = reactive<{
  enabled: boolean
  audioOutput: boolean
  urls: string[]
  qrDataUrl: string
  connected: number
  error: string | null
  detectedIps: string[]
}>({
  enabled: false,
  audioOutput: false,
  urls: [],
  qrDataUrl: '',
  connected: 0,
  error: null,
  detectedIps: []
})

onMounted(() => {
  void window.ops.config.get().then((cfg) => {
    Object.assign(form, cfg)
    wakeText.value = (cfg.wakeWords ?? []).join('，')
    pronText.value = (cfg.ttsPronunciations ?? []).map((p) => `${p.word}=${p.pinyin}`).join('\n')
  })
  refreshPhoneInfo()
  window.ops.phone.onStatus((s) => {
    if (s.urls && s.qrDataUrl) {
      phoneInfo.enabled = s.enabled ?? phoneInfo.enabled
      phoneInfo.audioOutput = s.audioOutput ?? phoneInfo.audioOutput
      phoneInfo.urls = s.urls
      phoneInfo.qrDataUrl = s.qrDataUrl
      phoneInfo.connected = s.connected ?? 0
      phoneInfo.error = s.error ?? null
      phoneInfo.detectedIps = s.detectedIps ?? []
    } else {
      refreshPhoneInfo()
    }
  })
})

function refreshPhoneInfo(): void {
  void window.ops.phone.getInfo().then((info) => {
    phoneInfo.enabled = info.enabled
    phoneInfo.audioOutput = info.audioOutput
    phoneInfo.urls = info.urls
    phoneInfo.qrDataUrl = info.qrDataUrl
    phoneInfo.connected = info.connected
    phoneInfo.error = info.error
    phoneInfo.detectedIps = info.detectedIps ?? []
  })
}

/** 外观调整即时生效（不必等保存） */
async function setTheme(mode: ThemeMode): Promise<void> {
  form.theme = mode
  await window.ops.config.set('theme', mode)
}
async function setAccent(value: string): Promise<void> {
  form.accent = value
  await window.ops.config.set('accent', value)
}

/**
 * 语言切换即时生效（不必等保存）：主进程据此重刷托盘与窗口标题，
 * 并会把 Edge 音色切到新语言的默认音色，这里把结果同步回表单。
 */
async function onLanguageChange(): Promise<void> {
  const cfg = await window.ops.config.set('language', form.language)
  form.language = cfg.language
  form.edgeVoice = cfg.edgeVoice
}

function onTogglePhoneAudioOutput(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  void window.ops.config.set('phoneAudioOutput', on).then(() => refreshPhoneInfo())
}

function onTogglePhone(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  void window.ops.phone.setEnabled(on).then((r) => {
    if (r.ok && r.info) {
      const info = r.info as { enabled: boolean; urls: string[]; qrDataUrl: string; connected: number; error: string | null }
      phoneInfo.enabled = info.enabled
      phoneInfo.urls = info.urls
      phoneInfo.qrDataUrl = info.qrDataUrl
      phoneInfo.connected = info.connected
      phoneInfo.error = info.error
    } else if (!r.ok) {
      phoneInfo.error = r.error ?? null
      phoneInfo.enabled = false
    }
  })
}

function copyText(text: string): void {
  void window.ops.clipboard.copy(text)
}

function onQrError(): void {
  phoneInfo.error = t('settings.phone.qr.failed')
}

function save(): void {
  const wakeWords = wakeText.value.split(/[，,、\s]+/).map((s) => s.trim()).filter(Boolean)
  const ttsPronunciations = pronText.value
    .split('\n')
    .map((line) => line.trim().replace(/＝/g, '='))
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('=')
      if (i <= 0) return null
      const word = line.slice(0, i).trim()
      const pinyin = line.slice(i + 1).trim()
      if (!word || !pinyin) return null
      if (pinyin.split(/\s+/).length !== [...word].length) return null
      return { word, pinyin }
    })
    .filter((x): x is { word: string; pinyin: string } => x !== null)

  void window.ops.config.setMany({ ...form, wakeWords, ttsPronunciations }).then(() => {
    saved.value = true
    dirty.value = false
    setTimeout(() => (saved.value = false), 2000)
  })
}
</script>

<style scoped>
/* 两栏网格：第 1 行是标题栏（横跨两栏），第 2 行才是「左导航 + 右表单」 */
.settings {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
  background: var(--vd-bg);
}
.tb { grid-column: 1 / -1; }
html,
body {
  background: var(--vd-bg);
  overflow: hidden;
}
.side-nav {
  width: 232px;
  flex: none;
  padding: 16px 12px;
  border-right: 1px solid var(--vd-hairline);
  background: var(--vd-bg-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.nav-group {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--vd-text-3);
  padding: 14px 10px 6px;
}
.nav-item {
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 560;
  color: var(--vd-text-2);
  cursor: pointer;
}
.nav-item:hover { background: var(--vd-surface); color: var(--vd-text-1); }
.nav-item.on { background: var(--vd-accent-soft); color: var(--vd-accent); }
.ok-tip { font-size: 11.5px; color: var(--vd-success); text-align: center; }

/* min-height: 0 让网格项能正确内部滚动，否则内容会把行高撑开 */
.side-main { min-height: 0; padding: 26px 30px; overflow-y: auto; }
.sect { max-width: 860px; }
.sect h2 { font-size: 20px; margin-bottom: 4px; }
.desc { font-size: 13px; color: var(--vd-text-3); margin-bottom: 14px; }
.form-card { padding: 6px 18px 12px; }
.setting-row { display: flex; align-items: center; gap: var(--vd-space-4); padding: 13px 2px; }
.setting-row + .setting-row { border-top: 1px solid var(--vd-line-2); }
.sr-body { flex: 1; min-width: 0; }
.sr-title { font-weight: 600; font-size: 14px; }
.sr-desc { font-size: 12.5px; color: var(--vd-text-3); margin-top: 2px; }

.phone-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
.qr-card { padding: 16px; text-align: center; }
.qr-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.qr {
  width: 148px; height: 148px; margin: 0 auto;
  background: #fff; border-radius: 12px; padding: 8px;
  display: flex; align-items: center; justify-content: center;
}
.qr img { width: 100%; height: 100%; display: block; }
.qr-empty { font-size: 11px; color: #555; }
.qr-urls { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.url { display: flex; align-items: center; gap: 8px; }
.url code {
  flex: 1; font-size: 12px; word-break: break-all; color: var(--vd-text-2);
  background: var(--vd-surface-2); border: 1px solid var(--vd-line-2);
  padding: 6px 8px; border-radius: 8px;
}

.swatches { display: inline-flex; gap: 8px; }
.swatch {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid transparent; outline: 1.5px solid var(--vd-hairline);
  padding: 0; transition: transform var(--vd-motion) var(--vd-ease);
}
.swatch:hover { transform: scale(1.12); }
.swatch.on { outline: 2.5px solid var(--vd-accent); transform: scale(1.1); }
.swatch .inner { display: block; width: 100%; height: 100%; border-radius: 50%; background: var(--s); }
</style>
