/** 语音链路共享类型定义 */

/** ASR（paraformer）事件 */
export type AsrEvent =
  | { type: 'partial'; text: string } // 流式中间结果
  | { type: 'final'; text: string } // 一句完整识别
  | { type: 'error'; message: string }
  | { type: 'started' }
  | { type: 'stopped' }

/** TTS 引擎标识 */
export type TtsEngineKind = 'cosyvoice' | 'sambert' | 'edge'

/** 音频帧（PCM，主进程 → audioWorker） */
export interface AudioFrame {
  /** Float32Array 的 ArrayBuffer（16kHz 单声道） */
  buffer: ArrayBuffer
  sampleRate: number
  seq: number
}

/** TTS 播放控制 */
export interface TtsControlMessage {
  action: 'play' | 'interrupt' | 'pause' | 'resume' | 'suspend' | 'clear'
  /**
   * 播报段号（play 时下发）：主进程每开一段播报自增，audioWorker 的上报都带上它，
   * 主进程据此丢弃"上一段迟到"的进度/完成/句首信号，避免把新一段的播完判定提前结算。
   */
  seq?: number
}

/** audioWorker → 主进程 的采集事件 */
export type AudioWorkerEvent =
  | { type: 'vad-activity' } // 检测到人声
  | { type: 'vad-idle' } // 静音
  | { type: 'level'; db: number } // 能量（悬浮球动画）
  | { type: 'mic-denied' }
  | { type: 'mic-error'; message: string }

/** 语音会话向渲染层推送的复合事件 */
export type SpeechEvent =
  | AsrEvent
  | { type: 'tts-start' }
  | { type: 'tts-end' }
  | { type: 'wakeup'; text: string }
  | { type: 'interrupt' }
  | { type: 'mic-status'; status: 'on' | 'off' | 'denied' | 'error' }
  | AudioWorkerEvent
  | { type: 'answer'; text: string }
