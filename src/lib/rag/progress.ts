export const RAG_EVENT_PREFIX = '__RAG_EVENT__:' as const

export type RagProgressStage =
  | 'rag_start'
  | 'thinking_precheck'
  | 'thinking_query'
  | 'full_context_load'
  | 'attempt_start'
  | 'retrieval_start'
  | 'retrieval_done'
  | 'thinking_eval'
  | 'eval_start'
  | 'eval_done'
  | 'refine_and_retry'
  | 'rag_stop'
  | 'answer_start'
  | 'error'

/**
 * 轻量进度事件：用于 UI 实时展示检索/评估过程。\n
 * 约定：服务端以「一行一个 JSON」的方式写入文本流：\n
 * `__RAG_EVENT__:{...}\\n`\n
 * 这类行必须出现在模型正文 token 之前（或客户端具备剥离逻辑）。
 */
export type RagProgressEvent = {
  stage: RagProgressStage
  ts: number
  traceId?: string
  attempt?: number
  chunkCount?: number
  hasSufficientChunk?: boolean
  message?: string
}

export function encodeRagProgressEventLine(ev: RagProgressEvent) {
  return `${RAG_EVENT_PREFIX}${JSON.stringify(ev)}\n`
}

