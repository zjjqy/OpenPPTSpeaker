/** LLM Function Calling 工具定义 —— 讲解引擎的"手" */

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

export const TOUR_TOOLS = [
  {
    type: 'function',
    function: {
      name: TourTool.GoNext,
      description: '进入下一区段/下一页。当前区段讲解完毕时调用。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: TourTool.GoPrev,
      description: '返回上一区段/上一页。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: TourTool.AskUser,
      description: '主动向听众提问，询问是否继续、是否有疑问。讲解关键节点或长段结束后调用。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '要问听众的问题' }
        },
        required: ['question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: TourTool.EndTour,
      description: '全部区段讲解完成，或听众要求结束时调用。会做总结收尾。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
] as const
