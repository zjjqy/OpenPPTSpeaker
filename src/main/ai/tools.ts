/** LLM Function Calling 工具定义 —— 讲解引擎的"手" */

import { t } from '@shared/i18n'

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  name: string
  result: unknown
}

/** 讲解工具名称常量（聚光由讲稿配置驱动，模型只需控制流程） */
export const TourTool = {
  GoNext: 'go_next',
  GoPrev: 'go_prev',
  AskUser: 'ask_user',
  EndTour: 'end_tour'
} as const

export interface TourToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * 工具定义。
 *
 * 做成函数而非常量：description 会随界面语言变化，而模型正是靠它判断何时调用哪个工具
 * （英文界面配中文描述会明显降低选工具的准确率）。若在模块加载时求值，
 * 语言会被冻结在 import 那一刻——那时用户配置甚至还没读完。
 */
export function tourTools(): TourToolDef[] {
  return [
    {
      type: 'function',
      function: {
        name: TourTool.GoNext,
        description: t('tool.goNext'),
        parameters: { type: 'object', properties: {}, required: [] }
      }
    },
    {
      type: 'function',
      function: {
        name: TourTool.GoPrev,
        description: t('tool.goPrev'),
        parameters: { type: 'object', properties: {}, required: [] }
      }
    },
    {
      type: 'function',
      function: {
        name: TourTool.AskUser,
        description: t('tool.askUser'),
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: t('tool.askUserQuestion') }
          },
          required: ['question']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: TourTool.EndTour,
        description: t('tool.endTour'),
        parameters: { type: 'object', properties: {}, required: [] }
      }
    }
  ]
}
