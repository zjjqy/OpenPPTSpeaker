/** 智能混合打断策略：短句立即断 / 长句句末断 */

export type InterruptDecision = 'immediate' | 'finish-sentence'

export interface InterruptPolicyOptions {
  /** 已说话超过该时长（ms）则视为"接近句末"，允许自然播完 */
  sentenceThresholdMs: number
  /** 已发送音频超过该时长（ms）即视为长句 */
  longSentenceMs: number
}

const DEFAULTS: InterruptPolicyOptions = {
  sentenceThresholdMs: 1600,
  longSentenceMs: 3500
}

/**
 * 决定打断方式（减少误打断优先）。
 * @param spokenMs 当前句已合成/已播放的时长
 * @param sentMs 已发送给播放器的音频时长
 */
export function decideInterrupt(
  spokenMs: number,
  sentMs: number,
  opts: Partial<InterruptPolicyOptions> = {}
): InterruptDecision {
  const o = { ...DEFAULTS, ...opts }

  // 已播放超过句末阈值 → 自然播完当前句（避免把讲解切得太碎）
  if (spokenMs >= o.sentenceThresholdMs) return 'finish-sentence'
  // 长句已发送较多但才播了一小段 → 真正的急切打断，立即停
  if (sentMs >= o.longSentenceMs && spokenMs < o.sentenceThresholdMs) return 'immediate'
  // 其余（播放时间短、疑似讲解开场回声/环境音）→ 自然播完，不立即打断，减少误判
  return 'finish-sentence'
}
