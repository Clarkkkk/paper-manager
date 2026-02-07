export type PaperMeta = {
  title: string
  authors?: string | null
  abstract?: string | null
  language?: string | null
}

export type RetrievedChunk = {
  id: string
  chunk_index: number
  page_start: number | null
  page_end: number | null
  content: string
  vec_score?: number
  fts_score?: number
  score?: number
  source?: string
  /**
   * 模型对“该 chunk 是否能回答用户问题”的相关性评分（0-1）。\n
   * 该分数用于最终相似度/排序（优先于向量/FTS 分数）。
   */
  model_score?: number
  /**
   * 模型判定“该 chunk 是否足以回答用户问题”。\n
   * 用于决定是否停止继续 attempt（命中即停）。
   */
  model_is_sufficient?: boolean
}

export type RetrievalAttempt = {
  attempt: 1 | 2 | 3
  query: string
  chunks: RetrievedChunk[]
  eval: {
    isRelevant: boolean
    score: number // 0-1
    explanation: string
    refinedQuery?: string
  }
}

