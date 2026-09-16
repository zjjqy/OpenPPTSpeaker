/** PPT 库与 v2 演讲稿的共享类型定义（主进程 / 渲染层共用） */

/** 聚光框（相对页面图片的百分比坐标，0~100） */
export interface SpotlightRect {
  /** 左上角 x（%） */
  x: number
  /** 左上角 y（%） */
  y: number
  /** 宽（%） */
  w: number
  /** 高（%） */
  h: number
}

/** v2 演讲稿：逐句讲解词（spotlight 可选，无则不聚光） */
export interface SpeechSentenceV2 {
  text: string
  spotlight?: SpotlightRect
}

/** v2 演讲稿：单页 */
export interface SlideScriptV2 {
  /** 页码（1 起，与 slides 物理顺序一致） */
  slide: number
  /** 页标题 */
  title: string
  /** 逐句讲解词 */
  speech: SpeechSentenceV2[]
}

/** v2 演讲稿文件结构（演讲稿.json） */
export interface DeckScriptV2 {
  version: 2
  meta: {
    title: string
    slideCount: number
    /** 生成方式：llm=大模型生成 / manual=手工或导入 */
    generatedBy: 'llm' | 'manual'
    updatedAt: string
  }
  slides: SlideScriptV2[]
  /** 整份讲稿统一的字幕样式（缺省用默认样式）；讲稿编辑预览 / AI 讲演 / 视频导出共用 */
  subtitleStyle?: SubtitleStyle
}

/**
 * 字幕样式配置：**整份讲稿统一**（非单句级别）。
 * 三处消费：讲稿编辑的字幕预览、AI 讲演的字幕窗口、导出视频的字幕绘制。
 * 所有长度类参数以"1080 高的画面"为基准，各消费方按自身画布高度等比换算，
 * 保证编辑所见 = 讲演所见 = 导出所得。
 */
export interface SubtitleStyle {
  /** 字体族 */
  fontFamily: string
  /** 字号（占画面高度的百分比，%） */
  fontSizePct: number
  /** 字重：400 常规 / 500 中等 / 600 半粗 / 700 加粗 */
  fontWeight: number
  /** 行高倍数 */
  lineHeight: number
  /** 文字颜色 */
  color: string
  /** 是否显示"第 N / M 句"进度 */
  showProgress: boolean
  /** 背景板 */
  bgEnabled: boolean
  /** 背景颜色（支持 rgba） */
  bgColor: string
  /** 背景圆角（px @1080 高画面） */
  bgRadius: number
  /** 背景内边距：横向 / 纵向（px @1080 高画面） */
  bgPaddingX: number
  bgPaddingY: number
  /** 描边（8 方向轮廓） */
  strokeEnabled: boolean
  strokeColor: string
  strokeWidth: number
  /** 投影 */
  shadowEnabled: boolean
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  /** 距画面底部（% 画面高） */
  bottomPct: number
  /** 最大宽度（% 画面宽） */
  maxWidthPct: number
}

/**
 * 默认字幕样式 = 讲演字幕窗口原有的观感：
 * 纯白字 + 2px 黑色描边、无背景板、34px（对 1080 高画面）、距底 44px、最宽 92%。
 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
  fontSizePct: 3.15,
  fontWeight: 500,
  lineHeight: 1.4,
  color: '#FFFFFF',
  showProgress: true,
  bgEnabled: false,
  bgColor: 'rgba(0, 0, 0, 0.62)',
  bgRadius: 16,
  bgPaddingX: 22,
  bgPaddingY: 14,
  strokeEnabled: true,
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowEnabled: false,
  shadowColor: 'rgba(0, 0, 0, 0.8)',
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  bottomPct: 4.1,
  maxWidthPct: 92
}

/** PPT 库中的条目（decks.json） */
export interface PptDeckMeta {
  /** 目录名（创建时生成的唯一 id） */
  id: string
  /** 展示名 */
  name: string
  createdAt: string
  updatedAt: string
  slideCount: number
  /** 是否已有演讲稿 */
  hasScript: boolean
  /** 来源：pdf=PDF 导入 / images=图片导入 / builtin=内置演示 */
  source: 'pdf' | 'images' | 'builtin'
}

/** PPT 库列表文件结构 */
export interface PptLibraryFile {
  /** 当前用于讲解的活动 PPT（手机/悬浮球【开始讲解】使用） */
  activeDeckId: string | null
  decks: PptDeckMeta[]
}

/** 导入/生成/导出的进度事件（主进程 → 渲染层） */
export interface PptProgressEvent {
  deckId: string
  /** 阶段：convert=转图片 / script=生成讲稿 / video=导出视频 */
  stage: 'convert' | 'script' | 'video'
  done: number
  total: number
  message?: string
}
