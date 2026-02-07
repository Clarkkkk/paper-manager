import { embedQuery } from '@/lib/ai/embeddings'
import { generateText } from 'ai'
import type { PaperMeta, RetrievalAttempt } from './types'
import { generateSearchQuery } from './query'
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
    const { chunks, error } = await retrieveHybridChunks(supabaseAny, {
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

