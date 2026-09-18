/** 应用配置结构定义 */

import type { TtsEngineKind } from '@shared/speech'
import { DEFAULT_LANG, type DictKey, type Lang } from '@shared/i18n'

/**
 * 讲解期间悬浮球的停靠位置。
 * 常态（未讲解）的大球始终居中显示，本设置只作用于讲解迷你态。
 */
export type OrbPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none'

/** 悬浮球位置可选项（顺序即设置页下拉顺序） */
export const ORB_POSITIONS: ReadonlyArray<{ value: OrbPosition; labelKey: DictKey }> = [
  { value: 'top-left', labelKey: 'orb.topLeft' },
  { value: 'top-right', labelKey: 'orb.topRight' },
  { value: 'bottom-left', labelKey: 'orb.bottomLeft' },
  { value: 'bottom-right', labelKey: 'orb.bottomRight' },
  { value: 'none', labelKey: 'orb.none' }
]

/** 界面主题模式：跟随系统 / 浅色 / 深色 */
export type ThemeMode = 'auto' | 'light' | 'dark'

/** 强调色档位（key 即 CSS data-accent 值；'' 表示默认海蓝） */
export const ACCENTS: ReadonlyArray<{ value: string; labelKey: DictKey; css: string }> = [
  { value: 'ocean', labelKey: 'accent.ocean', css: '#3d7eff' },
  { value: 'sky', labelKey: 'accent.sky', css: '#22a9e0' },
  { value: 'violet', labelKey: 'accent.violet', css: '#8b5cf6' },
  { value: 'emerald', labelKey: 'accent.emerald', css: '#10b981' },
  { value: 'amber', labelKey: 'accent.amber', css: '#f5a623' },
  { value: 'rose', labelKey: 'accent.rose', css: '#f4537a' }
]

export interface AppConfig {
  /** 界面语言；同时决定助手讲解与问答所用语言 */
  language: Lang
  /** DashScope API Key */
  apiKey: string
  /** 大模型（讲解/问答） */
  llmModel: string
  /** ASR 模型 */
  asrModel: string
  /** TTS 引擎 */
  ttsEngine: TtsEngineKind
  /** TTS 音色（Qwen-Audio-TTS 音色名） */
  ttsVoice: string
  /** TTS 多音字发音标注（SSML phoneme）：如 { word: '重音', pinyin: 'chong2 yin1' }，声调用数字 1~5（5 为轻声） */
  ttsPronunciations: Array<{ word: string; pinyin: string }>
  /** Sambert 音色（当 ttsEngine = sambert 时使用） */
  sambertVoice: string
  /** Edge TTS 音色（当 ttsEngine = edge 时使用，微软免费引擎） */
  edgeVoice: string
  /** 唤醒词列表 */
  wakeWords: string[]
  /** 是否开启语音唤醒 */
  enableWake: boolean
  /** 对话历史保留轮数 */
  maxHistory: number
  /** 讲解中是否允许打断 */
  enableBargeIn: boolean
  /** 电脑端麦克风是否参与收音（默认关闭：声音只从手机端来） */
  pcMicEnabled: boolean
  /** 手机桥接（无线麦克风/扬声器）开关 */
  phoneBridgeEnabled: boolean
  /** 手机端语音输出开关（关闭则手机只作麦克风，不再播放电脑的语音回复） */
  phoneAudioOutput: boolean
  /** 手机桥接服务端口 */
  phonePort: number
  /** 手机桥接电脑 IP（留空自动检测；填错时用此值兜底） */
  phoneHost: string
  /** 讲解期间悬浮球停靠位置（none = 讲解中不显示悬浮球） */
  orbPosition: OrbPosition
  /** 界面主题：跟随系统 / 浅色 / 深色 */
  theme: ThemeMode
  /** 强调色档位（见 ACCENTS） */
  accent: string
}

export const DEFAULT_CONFIG: AppConfig = {
  language: DEFAULT_LANG,
  apiKey: '',
  llmModel: 'qwen3.8-flash',
  asrModel: 'paraformer-realtime-v2',
  // 默认使用 Edge TTS：微软免费引擎、无需额外配额，开箱即可听到讲解
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
}

export const LLM_MODELS: ReadonlyArray<{ value: string; labelKey: DictKey }> = [
  { value: 'qwen3.8-flash', labelKey: 'llm.qwen38flash' },
  { value: 'qwen-turbo', labelKey: 'llm.qwenTurbo' },
  { value: 'qwen-max', labelKey: 'llm.qwenMax' }
]

/** qwen-audio-3.0-tts-flash 系统音色（中文，适合讲解场景；音色与模型必须匹配，不可混用其他模型的音色） */
export const QWEN_TTS_VOICES: ReadonlyArray<{ value: string; labelKey: DictKey }> = [
  { value: 'longanfengyue', labelKey: 'voice.qwen.longanfengyue' },
  { value: 'longanhuan_v3.6', labelKey: 'voice.qwen.longanhuan' },
  { value: 'longanxiaoxin', labelKey: 'voice.qwen.longanxiaoxin' },
  { value: 'longanlingxi', labelKey: 'voice.qwen.longanlingxi' },
  { value: 'longchuanshu_v3.6', labelKey: 'voice.qwen.longchuanshu' }
]

export const SAMBERT_VOICES: ReadonlyArray<{ value: string; labelKey: DictKey }> = [
  { value: 'sambert-zhichu-v1', labelKey: 'voice.sambert.zhichu' },
  { value: 'sambert-zhiwei-v1', labelKey: 'voice.sambert.zhiwei' },
  { value: 'sambert-zhiyue-v1', labelKey: 'voice.sambert.zhiyue' },
  { value: 'sambert-zhibei-v1', labelKey: 'voice.sambert.zhibei' }
]

/** 音色语言归属：决定设置页展示哪一组 Edge 音色 */
export type VoiceLang = 'zh' | 'en'

/**
 * Edge TTS（微软）Neural 音色。
 * lang 用于按界面语言过滤：英文界面下只列出英文音色，避免选出「能听懂但不能读英文」的组合。
 */
export const EDGE_VOICES: ReadonlyArray<{ value: string; labelKey: DictKey; lang: VoiceLang }> = [
  { value: 'zh-CN-XiaoxiaoNeural', labelKey: 'voice.edge.xiaoxiao', lang: 'zh' },
  { value: 'zh-CN-XiaoyiNeural', labelKey: 'voice.edge.xiaoyi', lang: 'zh' },
  { value: 'zh-CN-XiaohanNeural', labelKey: 'voice.edge.xiaohan', lang: 'zh' },
  { value: 'zh-CN-XiaoruiNeural', labelKey: 'voice.edge.xiaorui', lang: 'zh' },
  { value: 'zh-CN-YunjianNeural', labelKey: 'voice.edge.yunjian', lang: 'zh' },
  { value: 'zh-CN-YunxiNeural', labelKey: 'voice.edge.yunxi', lang: 'zh' },
  { value: 'zh-CN-YunyangNeural', labelKey: 'voice.edge.yunyang', lang: 'zh' },
  { value: 'en-US-AriaNeural', labelKey: 'voice.edge.enUSAria', lang: 'en' },
  { value: 'en-US-JennyNeural', labelKey: 'voice.edge.enUSJenny', lang: 'en' },
  { value: 'en-US-GuyNeural', labelKey: 'voice.edge.enUSGuy', lang: 'en' },
  { value: 'en-US-AndrewNeural', labelKey: 'voice.edge.enUSAndrew', lang: 'en' },
  { value: 'en-US-MichelleNeural', labelKey: 'voice.edge.enUSMichelle', lang: 'en' }
]

/** 界面语言 → 语音语言（中/英界面各自对应一组音色） */
export const LANG_TO_VOICE_LANG: Record<Lang, VoiceLang> = {
  'zh-CN': 'zh',
  'en-US': 'en'
}

/** 各语言默认 Edge 音色（切换语言且当前音色不属于该语言时自动切到它） */
export const DEFAULT_EDGE_VOICE: Record<VoiceLang, string> = {
  zh: 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-AriaNeural'
}

/** 音色所属语言；未知音色按中文处理（历史上只提供过中文音色） */
export function edgeVoiceLang(voice: string): VoiceLang {
  return EDGE_VOICES.find((v) => v.value === voice)?.lang ?? 'zh'
}

/** 设置页当前应展示的 Edge 音色列表 */
export function edgeVoicesFor(lang: Lang): ReadonlyArray<{ value: string; labelKey: DictKey }> {
  const target = LANG_TO_VOICE_LANG[normalizeLangSafe(lang)]
  return EDGE_VOICES.filter((v) => v.lang === target)
}

/** 本地兜底的语言校验（避免 schema 依赖 i18n 运行时函数过多） */
function normalizeLangSafe(lang: unknown): Lang {
  return lang === 'en-US' ? 'en-US' : 'zh-CN'
}

// ==================== 语音识别（ASR）====================

/** ASR 语种提示取值（DashScope language_hints），仅 paraformer-realtime-v2 及更高版本生效 */
export type AsrLangHint = 'zh' | 'en' | 'ja' | 'yue' | 'ko' | 'de' | 'fr' | 'ru'

/**
 * 界面语言 → ASR 语种提示（DashScope 的 language_hints）。
 *
 * 不传该参数时服务端默认 ['zh','en'] 并自行判断语种 —— 英文场景的问题正出在这里：
 * 中英同时打开时，英文语音容易被往谐音中文上靠。
 *
 * 中文界面刻意保留 'en'：中文演讲里夹英文术语（feature、prompt 之类）很常见，
 * 只留 'zh' 会让这些词识别失败。英文界面则只留 'en'，杜绝被识别成中文。
 */
export const LANG_TO_ASR_HINTS: Record<Lang, AsrLangHint[]> = {
  'zh-CN': ['zh', 'en'],
  'en-US': ['en']
}
