import type { RetrievedChunk } from './types'

function toPgvector(embedding: number[]) {
  return `[${embedding.join(',')}]`
}

export type HybridRetrievalParams = {
  paperId: string
  query: string
  embedding: number[]
  kVec: number
  kFts: number
  alpha: number
}

/**
 * 调用数据库 RPC：match_paper_chunks_hybrid\n
 * 返回混合检索的 chunks（已按 score 排序，去重在 SQL 内完成）。
 */
export async function retrieveHybridChunks(
  supabaseAny: any,
  params: HybridRetrievalParams
): Promise<{ chunks: RetrievedChunk[]; error?: string }> {
  const { paperId, query, embedding, kVec, kFts, alpha } = params

  const { data, error } = await supabaseAny.rpc('match_paper_chunks_hybrid', {
    p_paper_id: paperId,
    p_query: query,
    p_query_embedding: toPgvector(embedding),
    p_k_vec: kVec,
    p_k_fts: kFts,
    p_alpha: alpha,
  })

  if (error) {
    return { chunks: [], error: error.message || String(error) }
  }

  const rows = Array.isArray(data) ? data : []
  const chunks: RetrievedChunk[] = rows.map((r: any) => ({
    id: String(r.id),
    chunk_index: Number(r.chunk_index) || 0,
    page_start: typeof r.page_start === 'number' ? r.page_start : r.page_start == null ? null : Number(r.page_start),
    page_end: typeof r.page_end === 'number' ? r.page_end : r.page_end == null ? null : Number(r.page_end),
    content: String(r.content || ''),
    vec_score: typeof r.vec_score === 'number' ? r.vec_score : undefined,
    fts_score: typeof r.fts_score === 'number' ? r.fts_score : undefined,
    score: typeof r.score === 'number' ? r.score : undefined,
    source: typeof r.source === 'string' ? r.source : undefined,
  }))

  return { chunks }
}

