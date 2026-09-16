/** 讲解引擎共享类型定义 */

import type { SpotlightRect, SubtitleStyle } from './ppt'

/** 讲解引擎状态 */
export type TourState =
  | 'idle' // 空闲
  | 'opening' // 打开讲解对象
  | 'presenting' // 正在讲解
  | 'listening' // 倾听用户说话（按下按钮打断后等待用户发言）
  | 'paused' // 已暂停（用户要求暂停补充）
  | 'answering' // 正在回答问题
  | 'resuming' // 恢复讲解
  | 'ended' // 已结束

/** 讲解轨迹类型（当前仅 PPT 演示；保留字段以便事件兼容） */
export type DeckType = 'slide'

/** 讲解区段（网页=页面区域 / PPT=单页） */
export interface TourSection {
  /** 唯一标识（网页=selector，PPT=`page-${n}`） */
  id: string
  /** 标题 */
  title: string
  /** 预设讲解文案（可选，缺省时由 LLM 生成） */
  description?: string
  /**
   * 预设逐句讲解词（可选，存在时直接 TTS 合成播放，不再由 LLM 实时生成，保证字幕与语音精确同步）。
   * 聚光定位按优先级：spotlight（v2，相对页面图片的百分比坐标）> highlightId（v1，元素 id）> highlight（v1 旧文本格式）。
   */
  speech?: Array<{ text: string; highlight?: string; highlightId?: string; spotlight?: SpotlightRect }>
  /** 区域/页面原始内容素材（喂给 LLM 做讲解与问答，如 DOM 文本/讲稿文本） */
  content?: string
  /** LLM 引导词（作者可指定讲解侧重） */
  prompt?: string
  /** PPT 模式：SVG 文本定位路径 */
  cssPath?: string
  /** PPT 模式：重点高亮文本（在该页 SVG 中按文本定位并高亮，与讲解词匹配；缺省则不高亮） */
  highlightText?: string
  /** PPT 模式：页码（1 起） */
  slide?: number
  /** 高亮颜色 */
  highlightColor?: string
  /** 关键词（辅助 LLM 与问答检索） */
  keywords?: string[]
}

/** 讲解轨迹（一份完整讲演的地图） */
export interface TourDeck {
  type: DeckType
  id: string
  title: string
  description?: string
  /** PPT 模式：本地 HTML 文件路径 */
  file?: string
  /** PPT 模式：演讲稿数据源（演讲稿.json） */
  scriptFile?: string
  /** 起始页（PPT） */
  startSlide?: number
  /** 整份讲稿统一的字幕样式（来自演讲稿.json），讲解开始时下发给字幕窗口 */
  subtitleStyle?: SubtitleStyle
  sections: TourSection[]
}

/** 讲解运行时上下文 */
export interface TourContext {
  deck: TourDeck
  currentIndex: number
  /** 已讲解 section id（按顺序） */
  presented: string[]
  /** 对话历史（最近 N 轮） */
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  /** 用户关注点（从提问中提炼） */
  focuses: string[]
  /** 当前区段文本摘要（问答素材） */
  sectionText?: string
  /** 整页/整篇结构摘要 */
  pageSummary?: string
}

/** 讲解状态事件（推送渲染层） */
export interface TourStateEvent {
  state: TourState
  deck?: TourDeck
  currentIndex?: number
  section?: TourSection | null
  message?: string
}

/** 讲解数据事件（字幕/对话） */
export interface TourDataEvent {
  kind: 'subtitle' | 'chat' | 'progress' | 'subtitle-style'
  text?: string
  role?: 'assistant' | 'user'
  index?: number
  total?: number
  /** kind='subtitle-style' 时的样式配置（字幕窗口据此重排） */
  style?: SubtitleStyle
}
