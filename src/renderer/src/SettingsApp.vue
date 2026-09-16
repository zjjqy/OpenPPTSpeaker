<template>
  <div class="settings">
    <nav class="side-nav">
      <div class="nav-brand">
        <span class="lg"></span>
        <div>
          <b>OpenPPTSpeaker</b>
          <span class="faint">v{{ appVersion }}</span>
        </div>
      </div>
      <div class="nav-group">偏好</div>
      <div class="nav-item" :class="{ on: sec === 'general' }" @click="sec = 'general'">通用</div>
      <div class="nav-item" :class="{ on: sec === 'wake' }" @click="sec = 'wake'">语音与打断</div>

      <div class="nav-group">模型与声音</div>
      <div class="nav-item" :class="{ on: sec === 'model' }" @click="sec = 'model'">模型与语音</div>

      <div class="nav-group">连接</div>
      <div class="nav-item" :class="{ on: sec === 'phone' }" @click="sec = 'phone'">手机遥控</div>

      <div class="nav-group">个性化</div>
      <div class="nav-item" :class="{ on: sec === 'appearance' }" @click="sec = 'appearance'">外观</div>

      <div class="spread"></div>
      <button class="btn btn-primary" :disabled="!dirty" @click="save">保存配置</button>
      <span v-if="saved" class="ok-tip">已保存</span>
    </nav>

    <main class="side-main">
      <!-- 通用 -->
      <section v-if="sec === 'general'" class="sect">
        <h2>通用</h2>
        <p class="desc">关于助手的基础行为与窗口形态。</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">界面语言</div>
              <div class="sr-desc">界面与讲解语言暂以界面语言为准</div>
            </div>
            <select class="select" style="width: 170px"><option>简体中文</option><option>English</option></select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">讲解时悬浮球停靠位置</div>
              <div class="sr-desc">常态居中展示；讲解中收缩为迷你胶囊停靠此处</div>
            </div>
            <select v-model="form.orbPosition" class="select" style="width: 170px" @change="dirty = true">
              <option v-for="p in ORB_POSITIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">关闭悬浮球面板</div>
              <div class="sr-desc">点击收起到系统托盘，后台继续聆听唤醒词</div>
            </div>
            <span class="chip acc">托盘常驻</span>
          </div>
        </div>
      </section>

      <!-- 语音与打断 -->
      <section v-if="sec === 'wake'" class="sect">
        <h2>语音与打断</h2>
        <p class="desc">唤醒词、打断与收音来源。</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">启用语音唤醒</div>
              <div class="sr-desc">应用常驻后，说出唤醒词即可唤起助手</div>
            </div>
            <span class="switch"><input v-model="form.enableWake" type="checkbox" @change="dirty = true" /><i></i></span>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">唤醒词</div>
              <div class="sr-desc">逗号分隔；建议 2~4 字，支持容错匹配</div>
            </div>
            <input v-model="wakeText" class="input" style="width: 220px" @change="dirty = true" />
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">允许讲解中打断</div>
              <div class="sr-desc">听众可随时插话提问，助手暂停讲解进入问答</div>
            </div>
            <span class="switch"><input v-model="form.enableBargeIn" type="checkbox" @change="dirty = true" /><i></i></span>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">电脑麦克风参与收音</div>
              <div class="sr-desc">默认关闭：讲解时声音只从手机遥控端采集，避免回声</div>
            </div>
            <span class="switch"><input v-model="form.pcMicEnabled" type="checkbox" @change="dirty = true" /><i></i></span>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">保留对话历史轮数</div>
              <div class="sr-desc">供问答联想上下文，越多越费 token</div>
            </div>
            <select v-model.number="form.maxHistory" class="select" style="width: 120px" @change="dirty = true">
              <option :value="6">6 轮</option><option :value="12">12 轮</option><option :value="24">24 轮</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 模型与语音 -->
      <section v-if="sec === 'model'" class="sect">
        <h2>模型与语音</h2>
        <p class="desc">讲解引擎背后的 LLM / 识别 / 合成。Key 仅保存在本机，通过主进程直连云端。</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">DashScope API Key</div>
              <div class="sr-desc">用于大模型 / 语音识别 / 语音合成</div>
            </div>
            <input v-model="form.apiKey" class="input" style="width: 300px" type="password" placeholder="sk-xxxxxxxx" @change="dirty = true" />
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">对话模型</div>
              <div class="sr-desc">生成讲解词与回答听众提问</div>
            </div>
            <select v-model="form.llmModel" class="select" style="width: 230px" @change="dirty = true">
              <option v-for="m in LLM_MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">语音识别模型</div>
              <div class="sr-desc">实时流式识别</div>
            </div>
            <select v-model="form.asrModel" class="select" style="width: 230px" @change="dirty = true">
              <option value="paraformer-realtime-v2">paraformer-realtime-v2</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">合成引擎</div>
              <div class="sr-desc">Edge 免费无需 Key（默认）；CosyVoice 音质好；Sambert 可选</div>
            </div>
            <select v-model="form.ttsEngine" class="select" style="width: 230px" @change="dirty = true">
              <option value="edge">Edge · 微软免费（推荐）</option>
              <option value="cosyvoice">CosyVoice · 云端</option>
              <option value="sambert">Sambert · 云端</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="sr-body">
              <div class="sr-title">音色</div>
              <div class="sr-desc">适合讲解场景的中文音色</div>
            </div>
            <select
              v-if="form.ttsEngine === 'cosyvoice'"
              v-model="form.ttsVoice"
              class="select"
              style="width: 230px"
              @change="dirty = true"
            >
              <option v-for="v in QWEN_TTS_VOICES" :key="v.value" :value="v.value">{{ v.label }}</option>
            </select>
            <select
              v-else-if="form.ttsEngine === 'sambert'"
              v-model="form.sambertVoice"
              class="select"
              style="width: 230px"
              @change="dirty = true"
            >
              <option v-for="v in SAMBERT_VOICES" :key="v.value" :value="v.value">{{ v.label }}</option>
            </select>
            <select v-else v-model="form.edgeVoice" class="select" style="width: 230px" @change="dirty = true">
              <option v-for="v in EDGE_VOICES" :key="v.value" :value="v.value">{{ v.label }}</option>
            </select>
          </div>
          <div v-if="supportsPron" class="setting-row" style="align-items: flex-start">
            <div class="sr-body">
              <div class="sr-title">多音字标注</div>
              <div class="sr-desc">
                每行一条：词=拼音（声调用数字 1~5，拼音个数须与字数一致）<br />
                {{ form.ttsEngine === 'edge' ? 'Edge 使用微软音素（sapi 拼音），如：重音=chong2 yin1' : 'CosyVoice 使用拼音音素（py），如：重音=chong2 yin1' }}
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
        <h2>手机遥控</h2>
        <p class="desc">同一局域网内，手机扫码即可作为无线麦克风与遥控器，无需安装 App。</p>
        <div class="phone-grid">
          <div class="card form-card">
            <div class="setting-row">
              <div class="sr-body">
                <div class="sr-title">启用手机桥接服务</div>
                <div class="sr-desc">启动本机 HTTPS + WebSocket 服务（自签证书，扫码一次信任即可）</div>
              </div>
              <span class="switch"><input :checked="phoneInfo.enabled" type="checkbox" @change="onTogglePhone" /><i></i></span>
            </div>
            <div class="setting-row">
              <div class="sr-body"><div class="sr-title">服务端口</div><div class="sr-desc">默认 8123</div></div>
              <input v-model.number="form.phonePort" class="input" style="width: 120px" @change="dirty = true" />
            </div>
            <div class="setting-row">
              <div class="sr-body">
                <div class="sr-title">手机播放助手语音</div>
                <div class="sr-desc">关闭后手机仅作为麦克风，声音仍从电脑扬声器输出</div>
              </div>
              <span class="switch"><input :checked="phoneInfo.audioOutput" type="checkbox" @change="onTogglePhoneAudioOutput" /><i></i></span>
            </div>
            <div class="setting-row">
              <div class="sr-body">
                <div class="sr-title">已连接设备</div>
                <div class="sr-desc">当前会话在线设备数</div>
              </div>
              <span class="chip ok">{{ phoneInfo.connected }} 台在线</span>
            </div>
          </div>
          <div class="card qr-card">
            <div class="qr-title">扫码连接</div>
            <div class="qr">
              <img v-if="phoneInfo.qrDataUrl" :src="phoneInfo.qrDataUrl" alt="扫码连接" @error="onQrError" />
              <div v-else class="qr-empty"><span>{{ phoneInfo.error ?? '二维码生成中…' }}</span></div>
            </div>
            <div class="qr-urls">
              <div v-for="u in phoneInfo.urls" :key="u" class="url">
                <code>{{ u }}</code>
                <button class="btn btn-ghost btn-sm" @click="copyText(u)">复制</button>
              </div>
            </div>
            <p v-if="phoneInfo.detectedIps.length" class="faint" style="font-size: 11.5px">
              已检测到网卡：{{ phoneInfo.detectedIps.join('，') }}
            </p>
          </div>
        </div>
      </section>

      <!-- 外观 -->
      <section v-if="sec === 'appearance'" class="sect">
        <h2>外观</h2>
        <p class="desc">主题与强调色即时生效，同样作用于字幕条与演示外壳。</p>
        <div class="card form-card">
          <div class="setting-row">
            <div class="sr-body"><div class="sr-title">主题模式</div><div class="sr-desc">跟随系统 / 浅色 / 深色</div></div>
            <div class="seg">
              <button :class="{ on: form.theme === 'light' }" @click="setTheme('light')">浅色</button>
              <button :class="{ on: form.theme === 'dark' }" @click="setTheme('dark')">深色</button>
              <button :class="{ on: form.theme === 'auto' }" @click="setTheme('auto')">跟随</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="sr-body"><div class="sr-title">强调色</div><div class="sr-desc">状态光、主按钮与进度使用强调色</div></div>
            <div class="swatches">
              <button
                v-for="a in ACCENTS"
                :key="a.value"
                class="swatch"
                :class="{ on: form.accent === a.value }"
                :title="a.label"
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
  EDGE_VOICES,
  ORB_POSITIONS,
  ACCENTS,
  type AppConfig,
  type ThemeMode
} from '../../main/config/schema'

const appVersion = window.ops.appVersion
const sec = ref('general')

const form = reactive<AppConfig>({
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
  phoneInfo.error = '二维码图片加载失败，请尝试复制上方地址手动访问'
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
.settings {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--vd-bg);
}
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
.nav-brand { display: flex; align-items: center; gap: 10px; padding: 6px 8px 14px; }
.nav-brand .lg {
  width: 24px; height: 24px; border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, var(--vd-accent), var(--vd-accent-strong) 78%);
}
.nav-brand b { display: block; font-size: 13.5px; }
.nav-brand .faint { font-size: 11px; }
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

.side-main { flex: 1; padding: 26px 30px; overflow-y: auto; }
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
