import { embedMany, embedQuery } from '@/lib/ai/embeddings'
import { generateText } from 'ai'
import type { PaperMeta, RetrievalAttempt } from './types'
import { generateFineSearchQueries, generateSearchQuery } from './query'
import { retrieveHybridChunks } from './retrieval'
import { evaluateRetrieval } from './eval'
import type { RagProgressEvent } from './progress'

function envNum(name: string, def: number) {
  const v = Number(process.env[name])
  return Number.isFinite(v) ? v : def
}

/**
 * RAG 检索主流程（最多 3 次）：\n
 * 1) 模型生成检索 query（避免直接用用户问题）\n
 * 2) 向量 + FTS 混合检索\n
 * 3) 模型评估相关性，不相关则给 refinedQuery 再检索\n
 * 4) 最多 3 次；返回全部 attempts（回答时会把它们都放入 prompt）\n
 */
export async function runRagRetrievalLoop(args: {
  supabaseAny: unknown
  ragModel: Parameters<typeof generateText>[0]['model']
  paperId: string
  paper: PaperMeta
  userQuestion: string
  traceId?: string
  onProgress?: (ev: RagProgressEvent) => void
}) {
  const { supabaseAny, ragModel, paperId, paper, userQuestion, traceId, onProgress } = args

  const kVec = envNum('RAG_VEC_K', 7)
  const kFts = envNum('RAG_FTS_K', 3)
  const alpha = envNum('RAG_ALPHA', 0.7)

  const attempts: RetrievalAttempt[] = []
  const previousQueries: string[] = []
  const previousEvalNotes: string[] = []

  let nextQueryHint: string | null = null

  const emit = (ev: Omit<RagProgressEvent, 'ts'>) => {
    try {
      onProgress?.({ ...ev, ts: Date.now() })
    } catch {
      // ignore
    }
  }

  for (const n of [1, 2, 3] as const) {
    emit({ stage: 'attempt_start', traceId, attempt: n })
    console.log('[rag]', JSON.stringify({ traceId, paperId, attempt: n, stage: 'start', nextQueryHint }))
    let query: string
    if (nextQueryHint && !previousQueries.includes(nextQueryHint)) {
      emit({ stage: 'thinking_query', traceId, attempt: n, message: 'use_refined_query' })
      query = nextQueryHint
    } else {
      emit({ stage: 'thinking_query', traceId, attempt: n })
      query = await generateSearchQuery({
        model: ragModel,
        userQuestion,
        paper,
        previousQueries,
        previousEvalNotes,
      })
    }

    previousQueries.push(query)
    console.log('[rag]', JSON.stringify({ traceId, paperId, attempt: n, stage: 'query', query }))

    emit({ stage: 'retrieval_start', traceId, attempt: n })
    const embedding = await embedQuery(query)
    let { chunks, error } = await retrieveHybridChunks(supabaseAny, {
      paperId,
      query,
      embedding,
      kVec,
      kFts,
      alpha,
    })

    if (error) {
      emit({ stage: 'error', traceId, attempt: n, message: `retrieval_error:${error}` })
      // Treat retrieval failure as non-relevant, try to refine query once more.
      const ev = {
        isRelevant: false,
        score: 0,
        explanation: `检索失败: ${error}`,
        refinedQuery: undefined as string | undefined,
      }
      attempts.push({ attempt: n, query, chunks: [], eval: ev })
      previousEvalNotes.push(`chunkCount=0; ${ev.explanation}`)
      nextQueryHint = null
      console.log('[rag]', JSON.stringify({ traceId, paperId, attempt: n, stage: 'retrieve_error', error }))
      continue
    }

    emit({ stage: 'retrieval_done', traceId, attempt: n, chunkCount: chunks.length })
    console.log('[rag]', JSON.stringify({ traceId, paperId, attempt: n, stage: 'retrieve_ok', chunkCount: chunks.length }))

        // Low-recall strategy: if chunks are too few, force a fine-grained vector-only search.
        // - Ask the model to generate 5 short queries: 3x(<=3 words) + 2x(<=2 words).
        // - Run 5 parallel vector searches with a larger kVec.
        // - Aggregate all candidates first (dedup), then filter to topN at the end to avoid dropping good chunks too early.
    if (chunks.length <= 2) {
      try {
        emit({ stage: 'thinking_query', traceId, attempt: n, message: `fine_search_low_recall:${chunks.length}` })
        // Debug: verify auth + RLS-visible chunk count before parallel RPCs.
        try {
          const authClient = (supabaseAny as any)?.auth
          const hasAuth = !!authClient && typeof authClient.getUser === 'function'
          let authUserId: string | null = null
          let hasSession = false
          let tokenLen: number | null = null
          if (hasAuth) {
            try {
              const ures = await authClient.getUser()
              authUserId = String(ures?.data?.user?.id || '') || null
            } catch {
              authUserId = null
            }
            try {
              const sres = await authClient.getSession()
              const tok = sres?.data?.session?.access_token
              hasSession = !!tok
              tokenLen = typeof tok === 'string' ? tok.length : null
            } catch {
              hasSession = false
              tokenLen = null
            }
          }
          let visibleCount: number | null = null
          let visibleCountError: string | null = null
          try {
            const q = await (supabaseAny as any)
              .from('paper_chunks')
              .select('id', { count: 'exact', head: true })
              .eq('paper_id', paperId)
            visibleCount = typeof q?.count === 'number' ? q.count : null
            visibleCountError = q?.error ? String(q.error?.message || q.error) : null
          } catch (e) {
            visibleCount = null
            visibleCountError = e instanceof Error ? e.message : String(e)
          }

          console.log(
            '[rag]',
            JSON.stringify({
              traceId,
              paperId,
              attempt: n,
              stage: 'fine_search_auth_snapshot',
              hasAuth,
              authUserId,
              hasSession,
              tokenLen,
              rlsVisibleChunkCount: visibleCount,
              rlsVisibleChunkCountError: visibleCountError,
            })
          )
        } catch {
          // ignore
        }

        const generated5 = await generateFineSearchQueries({
          model: ragModel,
          userQuestion,
          paper,
          previousQueries,
          previousEvalNotes,
          lastQuery: query,
          lastChunkCount: chunks.length,
        })
            const searchQueries = generated5
        console.log(
          '[rag]',
          JSON.stringify({
            traceId,
            paperId,
            attempt: n,
            stage: 'fine_search_queries',
            lastChunkCount: chunks.length,
            queries: searchQueries,
          })
        )

        emit({ stage: 'retrieval_start', traceId, attempt: n, message: 'fine_search_vector_parallel_5' })
        const embs = await embedMany(searchQueries)
            const kFine = envNum('RAG_FINE_VEC_K', 30)
            const topN = envNum('RAG_FINE_TOP_N', 15)
        const fineResults = await Promise.all(
          embs.map((emb, idx) =>
            retrieveHybridChunks(supabaseAny, {
              paperId,
              query: searchQueries[idx],
              embedding: emb,
              kVec: Math.max(5, kFine),
              kFts: 0,
              alpha: 1,
            })
          )
        )

            // Debug: log per-RPC outcomes (returned count / errors / top chunk_index)
            try {
              const perRpc = fineResults.map((r, idx) => {
                const xs = Array.isArray(r?.chunks) ? r.chunks : []
                const err = typeof (r as any)?.error === 'string' ? (r as any).error : undefined
                return {
                  i: idx,
                  query: searchQueries[idx],
                  returned: xs.length,
                  hasError: !!err,
                  error: err ? err.slice(0, 220) : undefined,
                  headChunkIndex: xs.slice(0, 8).map((c) => (c ? c.chunk_index : null)),
                  headScore: xs
                    .slice(0, 5)
                    .map((c) => (c ? Number((c as any).score ?? (c as any).vec_score ?? 0) : 0)),
                }
              })
              const returnedTotal = perRpc.reduce((a, x) => a + (Number(x.returned) || 0), 0)
              const errorCount = perRpc.reduce((a, x) => a + (x.hasError ? 1 : 0), 0)
              const emptyCount = perRpc.reduce((a, x) => a + (x.returned === 0 ? 1 : 0), 0)
              console.log(
                '[rag]',
                JSON.stringify({
                  traceId,
                  paperId,
                  attempt: n,
                  stage: 'fine_search_rpc_stats',
                  fineKVec: kFine,
                  expectedPerRpc: Math.max(5, kFine),
                  returnedTotal,
                  errorCount,
                  emptyCount,
                  perRpc,
                })
              )
            } catch {
              // ignore
            }

            const mergedAll = fineResults.flatMap((r) => (r?.chunks || []))
            const byId = new Map<string, (typeof mergedAll)[number]>()
            let duplicateCount = 0
            for (const c of mergedAll) {
          if (!c?.id) continue
          if (!byId.has(c.id)) {
            byId.set(c.id, c)
          } else {
                // Keep higher-score one when duplicates occur.
                const prev = byId.get(c.id)
                const prevScore = prev?.score ?? prev?.vec_score ?? 0
                const curScore = c.score ?? c.vec_score ?? 0
                if (curScore > prevScore) byId.set(c.id, c)
            duplicateCount++
          }
        }
        console.log('duplicate chunk count', duplicateCount)
            chunks = Array.from(byId.values())
              .sort((a, b) => (b.score ?? b.vec_score ?? 0) - (a.score ?? a.vec_score ?? 0))
              .slice(0, Math.max(5, topN))

            emit({ stage: 'retrieval_done', traceId, attempt: n, chunkCount: chunks.length, message: 'fine_search_aggregated_topN' })
        console.log(
          '[rag]',
          JSON.stringify({
            traceId,
            paperId,
            attempt: n,
            stage: 'fine_search_done',
            aggregatedChunkCount: chunks.length,
                fineKVec: kFine,
                topN,
                totalCandidates: mergedAll.length,
                dedupedCandidates: byId.size,
          })
        )
      } catch (e) {
        console.warn('[rag][fine_search] failed:', e)
        emit({ stage: 'error', traceId, attempt: n, message: 'fine_search_failed' })
        // Fall back to original `chunks` for eval.
      }
    }

    emit({ stage: 'eval_start', traceId, attempt: n, chunkCount: chunks.length })
    emit({ stage: 'thinking_eval', traceId, attempt: n, chunkCount: chunks.length })
    const ev = await evaluateRetrieval({
      model: ragModel,
      userQuestion,
      query,
      chunks,
      previousAttemptsBrief: attempts.map((a) => `#${a.attempt}:${a.query}:${a.eval.score.toFixed(2)}`),
      paper,
      previousQueries,
      previousEvalNotes,
    })

    // Attach model per-chunk scores; final similarity should rely on model_score.
    try {
      const scoreMap = new Map<number, number>(
        (ev.chunkScores || []).map((x) => [Number(x.chunk_index), Number(x.score)])
      )
      const sufficientSet = new Set<number>(
        (ev.chunkScores || [])
          .filter((x) => x.isSufficient === true && typeof x.score === 'number' && x.score >= 0.5)
          .map((x) => Number(x.chunk_index))
      )
      for (const c of chunks) {
        const s = scoreMap.get(c.chunk_index)
        if (typeof s === 'number' && Number.isFinite(s)) {
          c.model_score = Math.max(0, Math.min(1, s))
        }
        c.model_is_sufficient = sufficientSet.has(c.chunk_index)
      }
    } catch {
      // ignore
    }

    attempts.push({ attempt: n, query, chunks, eval: ev })
    previousEvalNotes.push(
      `chunkCount=${chunks.length}; ${ev.isRelevant ? 'relevant' : 'not_relevant'}; score=${ev.score.toFixed(2)}; reason=${ev.explanation}`
    )
    console.log('[rag]', JSON.stringify({ traceId, paperId, attempt: n, stage: 'eval', eval: ev }))

    const hasSufficientChunk = chunks.some((c) => c.model_is_sufficient === true && (c.model_score ?? 0) >= 0.5)
    emit({ stage: 'eval_done', traceId, attempt: n, chunkCount: chunks.length, hasSufficientChunk })

    // Chunk-first stopping rule:
    // - If any chunk is sufficient -> stop immediately (no more attempts).
    // - Otherwise continue attempts (up to 3), using refinedQuery when provided.
    const shouldStop = chunks.length > 0 && hasSufficientChunk
    if (shouldStop) {
      console.log(
        '[rag]',
        JSON.stringify({ traceId, paperId, attempt: n, stage: 'stop', reason: 'chunk_sufficient', hasSufficientChunk })
      )
      emit({ stage: 'rag_stop', traceId, attempt: n, chunkCount: chunks.length, hasSufficientChunk: true })
      break
    }

    nextQueryHint = ev.refinedQuery || null
    console.log('[rag]', JSON.stringify({ traceId, paperId, attempt: n, stage: 'refine', nextQueryHint }))
    emit({ stage: 'refine_and_retry', traceId, attempt: n })
  }

  return attempts
}

