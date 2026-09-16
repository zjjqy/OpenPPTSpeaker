/** 应用配置结构定义 */

import type { TtsEngineKind } from '@shared/speech'

/**
 * 讲解期间悬浮球的停靠位置。
 * 常态（未讲解）的大球始终居中显示，本设置只作用于讲解迷你态。
 */
export type OrbPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none'

/** 悬浮球位置可选项（顺序即设置页下拉顺序） */
export const ORB_POSITIONS: ReadonlyArray<{ value: OrbPosition; label: string }> = [
  { value: 'top-left', label: '左上' },
  { value: 'top-right', label: '右上' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-right', label: '右下（默认）' },
  { value: 'none', label: '不显示' }
]

/** 界面主题模式：跟随系统 / 浅色 / 深色 */
export type ThemeMode = 'auto' | 'light' | 'dark'

/** 强调色档位（key 即 CSS data-accent 值；'' 表示默认海蓝） */
export const ACCENTS: ReadonlyArray<{ value: string; label: string; css: string }> = [
  { value: 'ocean', label: '海蓝（默认）', css: '#3d7eff' },
  { value: 'sky', label: '晴蓝', css: '#22a9e0' },
  { value: 'violet', label: '星紫', css: '#8b5cf6' },
  { value: 'emerald', label: '松绿', css: '#10b981' },
  { value: 'amber', label: '日橙', css: '#f5a623' },
  { value: 'rose', label: '玫红', css: '#f4537a' }
]

export interface AppConfig {
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

export const LLM_MODELS = [
  { value: 'qwen3.8-flash', label: '通义千问 3.8 Flash（推荐 · 快而省）' },
  { value: 'qwen-turbo', label: '通义千问 Turbo（更快更省）' },
  { value: 'qwen-max', label: '通义千问 Max（最强）' }
]

/** qwen-audio-3.0-tts-flash 系统音色（中文，适合讲解场景；音色与模型必须匹配，不可混用其他模型的音色） */
export const QWEN_TTS_VOICES = [
  { value: 'longanfengyue', label: '龙安风悦（女·自然亲切）' },
  { value: 'longanhuan_v3.6', label: '龙安欢（女·自然）' },
  { value: 'longanxiaoxin', label: '龙安小昕（女·亲切活泼）' },
  { value: 'longanlingxi', label: '龙安灵希（女·甜美）' },
  { value: 'longchuanshu_v3.6', label: '龙川叔（男·沉稳大叔）' }
]

export const SAMBERT_VOICES = [
  { value: 'sambert-zhichu-v1', label: '知厨（男）' },
  { value: 'sambert-zhiwei-v1', label: '知薇（女）' },
  { value: 'sambert-zhiyue-v1', label: '知玥（女·播音）' },
  { value: 'sambert-zhibei-v1', label: '知贝（女·童声）' }
]

/** Edge TTS（微软）中文 Neural 音色（适合讲解场景） */
export const EDGE_VOICES = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女·活泼自然）' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊（女·温柔亲切）' },
  { value: 'zh-CN-XiaohanNeural', label: '晓涵（女·温暖知性）' },
  { value: 'zh-CN-XiaoruiNeural', label: '晓睿（女·知性成熟）' },
  { value: 'zh-CN-YunjianNeural', label: '云健（男·稳重有力）' },
  { value: 'zh-CN-YunxiNeural', label: '云希（男·清亮阳光）' },
  { value: 'zh-CN-YunyangNeural', label: '云扬（男·新闻播报）' }
]
