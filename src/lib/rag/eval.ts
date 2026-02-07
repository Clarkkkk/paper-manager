import { generateText } from 'ai'
import type { RetrievedChunk } from './types'
import type { PaperMeta } from './types'
import { buildQueryGeneratorPrompt } from './query'
import { safeJsonObject } from './json'

type ChunkScore = { chunk_index: number; score: number; isSufficient?: boolean; reason?: string }

type EvalJson = {
  explanation?: string
  chunkScores?: unknown
}

/**
 * 评估当前检索结果是否与用户问题相关。\n
 * - 相关：继续回答\n
 * - 不相关：给出 refinedQuery（用于下一轮检索）\n
 */
export async function evaluateRetrieval(args: {
  model: Parameters<typeof generateText>[0]['model']
  userQuestion: string
  query: string
  chunks: RetrievedChunk[]
  previousAttemptsBrief: string[]
  paper: PaperMeta
  previousQueries: string[]
  previousEvalNotes: string[]
}) {
  const { model, userQuestion, query, chunks, previousAttemptsBrief, paper, previousQueries, previousEvalNotes } = args
  const chunkCount = Array.isArray(chunks) ? chunks.length : 0

  const topChunks = (chunks || []).slice(0, 6)
  const chunkPreview = topChunks
    // IMPORTANT: do NOT truncate here. The key evidence may appear later in the chunk.
    // Our default chunk size is small (~2000 chars), so including full chunks is acceptable.
    .map(
      (c, i) =>
        `[#${i + 1} chunk_index=${c.chunk_index} chunk_id=${c.id} p.${c.page_start ?? '?'}-${c.page_end ?? '?'}]\n${String(
          c.content || ''
        )}`
    )
    .join('\n\n')

  // Step 1) 评估：对每个 chunk 评分 + 是否足够回答
  const evalPrompt = `我们正在进行RAG向量检索，你是一个“chunk 级别”的检索评估器。只做评估，不回答用户问题。\n
你必须输出“严格 JSON（仅 JSON）”，禁止输出任何解释性文字、前后缀、Markdown。\n
\n
输出 JSON Schema（你必须产出一个符合该 schema 的 JSON 对象；仅输出 JSON，不要输出 schema 本身）：\n
{\n
  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n
  \"$comment\": \"用于 chunk 级检索评估输出。\",\n
  \"type\": \"object\",\n
  \"additionalProperties\": false,\n
  \"required\": [\"explanation\", \"chunkScores\"],\n
  \"properties\": {\n
    \"explanation\": {\n
      \"type\": \"string\",\n
      \"description\": \"简短原因（<= 80 字符；只写结论，不要展开）\"\n
    },\n
    \"chunkScores\": {\n
      \"type\": \"array\",\n
      \"description\": \"对每个候选 chunk 的评分与是否足够回答\",\n
      \"items\": {\n
        \"type\": \"object\",\n
        \"additionalProperties\": false,\n
        \"required\": [\"chunk_index\", \"score\", \"isSufficient\"],\n
        \"properties\": {\n
          \"chunk_id\": {\n
            \"type\": \"string\",\n
            \"description\": \"chunk_id（必须来自候选 chunks 中的 chunk_id\"\n
          },\n
          \"chunk_index\": {\n
            \"type\": \"integer\",\n
            \"description\": \"chunk_index（必须来自候选 chunks 中的 chunk_index，而不是排序的 index）\"\n
          },\n
          \"score\": {\n
            \"type\": \"number\",\n
            \"minimum\": 0,\n
            \"maximum\": 1,\n
            \"description\": \"相关性评分 0-1\"\n
          },\n
          \"isSufficient\": {\n
            \"type\": \"boolean\",\n
            \"description\": \"仅凭该 chunk 是否足以回答用户问题\"\n
          },\n
          \"reason\": {\n
            \"type\": \"string\",\n
            \"description\": \"可选：简短原因（<= 60 字符）\"\n
          }\n
        }\n
      }\n
    }\n
  }\n
}\n
\n
评估标准（非常重要）：\n
- 你需要对上面提供的每个 chunk 都输出一条 chunkScores。\n
- score 表示“该 chunk 对回答用户问题的直接贡献度/相关性”。明显无关应接近 0。\n
- isSufficient 表示“仅凭该 chunk 的信息，是否已经足以回答用户问题”。\n
 - 如果 chunkCount=0（无命中），必须认为没有足够 chunk。\n
\n
输出约束（非常重要）：\n
- chunkScores 必须覆盖全部候选 chunks：不允许缺失、不允许额外 chunk_index。\n
 - 禁止输出 Markdown 代码围栏（三重反引号）。\n
\n
用户问题：${userQuestion}\n
本轮 query：${query}\n
chunkCount: ${chunkCount}\n
previousAttemptsBrief: ${previousAttemptsBrief.length ? previousAttemptsBrief.join(' | ') : '(none)'}\n
\n
候选 chunks：\n
${chunkPreview || '(无)'}\n`

  const runOnce = async (p: string, opts?: { maxOutputTokens?: number; temperature?: number }) =>
    generateText({
      model,
      prompt: p,
      temperature: typeof opts?.temperature === 'number' ? opts.temperature : 0.2,
      maxOutputTokens: typeof opts?.maxOutputTokens === 'number' ? opts.maxOutputTokens : 700,
    })

  // Step 0) 先输出“思考摘要”（仅用于内部日志），再输出 JSON
  const thinkingPrompt = `你正在根据用户的问题进行检索，以下是RAG向量检索的结果，你需要评估当前检索结果是否与问题相关，能否回答用户问题，。只做评估，不回答用户问题。\n
请先输出“思考摘要”（1-5 行，越短越好）：\n
- 哪些 chunk 可能相关、哪些明显不相关\n
- 是否存在足以回答用户问题的 chunk（如果没有请说明不足在哪里）\n
要求：不要输出 JSON；不要输出 Markdown 代码围栏（三重反引号）。\n
\n
用户问题：${userQuestion}\n
本轮 query：${query}\n
chunkCount: ${chunkCount}\n
previousAttemptsBrief: ${previousAttemptsBrief.length ? previousAttemptsBrief.join(' | ') : '(none)'}\n
\n
候选 chunks：\n
${chunkPreview || '(无)'}\n`
  const thinkingRes = await runOnce(thinkingPrompt, { maxOutputTokens: 220 })
  const thinking = String(thinkingRes.text || '').trim()
  if (thinking) console.log('[rag][eval-thinking]', thinking.slice(0, 1600))

  let res = await runOnce(thinking ? `思考摘要（供你输出更一致的 JSON）：\n${thinking}\n\n${evalPrompt}` : evalPrompt, {
    maxOutputTokens: 10000,
  })
  console.log('Eval response:', res.text)

  let obj = (safeJsonObject(res.text) || null) as EvalJson | null
  if (!obj) {
    const repairPrompt = `你的上一次输出不符合要求（包含了 JSON 之外的文字或不是合法 JSON）。\n
请你立刻重新输出一次，并严格只输出 JSON（仅 JSON）。\n
\n
额外要求：\n
 - 禁止输出 Markdown 代码围栏（三重反引号）\n
- explanation 必须 <= 40 字符\n
- reason 字段可以省略（省略更好）\n
\n
${evalPrompt}`
    res = await runOnce(repairPrompt, { maxOutputTokens: 600 })
    console.log('Eval response (repair):', res.text)
    obj = (safeJsonObject(res.text) || {}) as EvalJson
  }

  const explanation = String(obj.explanation || '').trim() || 'chunk 级评估'

  const chunkScoresRaw: unknown[] = Array.isArray(obj.chunkScores) ? (obj.chunkScores as unknown[]) : []
  const chunkScores: ChunkScore[] = chunkScoresRaw
    .map((x): ChunkScore | null => {
      if (!x || typeof x !== 'object') return null
      const anyX = x as Record<string, unknown>
      const chunk_index = Number(anyX.chunk_index)
      const score = Number(anyX.score)
      const isSufficient = typeof anyX.isSufficient === 'boolean' ? anyX.isSufficient : undefined
      const reason = typeof anyX.reason === 'string' ? anyX.reason : undefined
      if (!Number.isFinite(chunk_index) || !Number.isFinite(score)) return null
      return { chunk_index, score: Math.max(0, Math.min(1, score)), isSufficient, reason }
    })
    .filter((x): x is ChunkScore => Boolean(x))

  // 只关心我们传给模型看的 topChunks；缺失的 chunk_index 统一补 0 分。
  const wantedChunkIndexes = topChunks.map((c) => c.chunk_index)
  const scoreMap = new Map<number, ChunkScore>(chunkScores.map((x) => [x.chunk_index, x]))
  const normalizedChunkScores: ChunkScore[] = wantedChunkIndexes.map((chunk_index) => {
    const v = scoreMap.get(chunk_index)
    return v || { chunk_index, score: 0, isSufficient: false, reason: 'missing' }
  })

  const best = normalizedChunkScores.reduce(
    (acc, cur) => (cur.score > acc.score ? cur : acc),
    { chunk_index: -1, score: 0, isSufficient: false } as ChunkScore
  )
  const hasSufficient = normalizedChunkScores.some((x) => x.isSufficient === true && x.score >= 0.5)

  // Step 2) 如果不足以回答，再生成 refinedQuery（与 query 生成器同 prompt 规则）
  let refinedQuery: string | undefined = undefined
  if (!hasSufficient) {
    const evalContextLines = normalizedChunkScores
      .map((x) => `- chunk_index=${x.chunk_index} score=${x.score.toFixed(2)} isSufficient=${x.isSufficient === true} reason=${x.reason || ''}`)
      .join('\n')

    const extraContext = `当前检索 query：${query}\n
本轮召回 chunkCount：${chunkCount}\n
本轮评估结论：${explanation}\n
chunkScores（top 6）：\n${evalContextLines}\n
\n
要求：请基于上述评估信息，根据不同的情况，生成下一轮的检索 query，比如更换关键词，或者根据当前query的结果继续扩展搜索等，并避免与 current query / previousQueries 重复。`

    const refineThinkingPrompt = buildQueryGeneratorPrompt({
      userQuestion,
      paper,
      previousQueries,
      previousEvalNotes,
      extraContext,
      mode: 'thinking',
    })

    const refineThinkingRes = await runOnce(refineThinkingPrompt)
    const refineThinking = String(refineThinkingRes.text || '').trim()
    if (refineThinking) console.log('[rag][refine-thinking]', refineThinking.slice(0, 1600))

    const refineJsonPrompt = buildQueryGeneratorPrompt({
      userQuestion,
      paper,
      previousQueries,
      previousEvalNotes,
      mode: 'json',
      extraContext: `${extraContext}\n\n${refineThinking ? `思考摘要（供你生成更好的 query）：\n${refineThinking}\n` : ''}`,
    })

    const refineRes = await runOnce(refineJsonPrompt)
    console.log('Refine query response:', refineRes.text)

    const refineObj = safeJsonObject(refineRes.text)
    const q = String((refineObj as any)?.query || '').trim()
    if (q) refinedQuery = q.slice(0, 200)
  }

  return {
    // 注意：这里的 isRelevant/score 以“chunk 是否足够回答”为准，而不是 attempt 的整体判断。
    isRelevant: hasSufficient,
    score: best.score,
    explanation,
    refinedQuery: refinedQuery ? refinedQuery.slice(0, 200) : undefined,
    chunkScores: normalizedChunkScores,
  }
}

