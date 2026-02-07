import type { PaperMeta, RetrievalAttempt, RetrievedChunk } from './types'

function clampText(s: string, max: number) {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}

function pageLabel(c: Pick<RetrievedChunk, 'page_start' | 'page_end'>) {
  if (typeof c.page_start === 'number' && typeof c.page_end === 'number') {
    return `p.${c.page_start}-${c.page_end}`
  }
  if (typeof c.page_start === 'number') return `p.${c.page_start}`
  return 'p.?'
}

function chunkScoreLabel(c: RetrievedChunk) {
  if (typeof c.model_score === 'number') return `model=${c.model_score.toFixed(2)}`
  if (typeof c.score === 'number') return `hybrid=${c.score.toFixed(3)}`
  return 'n/a'
}

/**
 * 构建论文元信息上下文（不包含全文/大段文本）。
 */
export function formatPaperMeta(meta: PaperMeta) {
  return `【论文标题】${meta.title}
【作者】${meta.authors || '未知'}
【摘要】${meta.abstract || '暂无摘要'}`
}

/**
 * 把三次（或不足三次）检索过程完整放入 prompt，方便模型做“自我校正”。
 */
export function formatRetrievalAttemptsForPrompt(
  attempts: RetrievalAttempt[],
  opts: {
    maxChunksPerAttempt?: number
  } = {}
) {
  const maxChunksPerAttempt = opts.maxChunksPerAttempt ?? 10

  if (!attempts.length) return ''

  const blocks = attempts.map((a) => {
    const chunks = [...(a.chunks || [])]
      .sort((x: any, y: any) => (typeof y.model_score === 'number' ? y.model_score : -1) - (typeof x.model_score === 'number' ? x.model_score : -1))
      .slice(0, maxChunksPerAttempt)
    const chunkText =
      chunks.length > 0
        ? chunks
            .map((c, i) => {
              const head = `[#${i + 1} ${pageLabel(c)} chunk=${c.chunk_index} source=${c.source || 'unknown'} score=${chunkScoreLabel(c)}]`
              return `${head}\n${c.content || ''}`
            })
            .join('\n\n')
        : '(无命中)'

    const ev = a.eval
    const evalLine = `eval: relevant=${ev.isRelevant} score=${ev.score.toFixed(2)} reason=${clampText(ev.explanation || '', 240)}`
    const refineLine = ev.refinedQuery ? `refinedQuery: ${clampText(ev.refinedQuery, 200)}` : ''

    return `=== Retrieval Attempt ${a.attempt} ===
query: ${a.query}
${evalLine}
${refineLine}

${chunkText}`
  })

  return `【检索过程（最多3次，供你分析相关性并回答）】
${blocks.join('\n\n')}`.trim()
}

