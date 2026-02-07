import { generateText } from 'ai'
import type { PaperMeta } from './types'

function safeJsonObject(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

export function buildQueryGeneratorPrompt(args: {
  userQuestion: string
  paper: PaperMeta
  previousQueries: string[]
  previousEvalNotes: string[]
  extraContext?: string
  mode?: 'thinking' | 'json'
}) {
  const { userQuestion, paper, previousQueries, previousEvalNotes, extraContext } = args
  const mode = args.mode || 'json'

  const lang = (paper.language || '').toLowerCase()
  const langHint =
    lang === 'zh' ? '中文' :
    lang === 'en' ? '英文' :
    lang === 'ja' ? '日文' :
    lang === 'ko' ? '韩文' :
    lang === 'ru' ? '俄文' :
    lang === 'ar' ? '阿拉伯文' :
    '未知'

  // IMPORTANT: keep this section consistent across query generation and refinement.
  const prompt = `你正在根据用户的问题进行RAG向量检索，熟知RAG和向量数据库检索的原理，现在你需要为这次RAG检索生成query关键词或短句。你的任务不是回答问题，而是把用户的问题改写为“适合从论文全文中检索”的查询语句。\n
要求：\n
3) 如果用户问题过于泛（如“这篇论文讲什么”），请结合标题/摘要推断关键术语、任务、方法、指标、数据集，生成可命中的 query\n
4) 必须使用论文语言生成 query（论文语言为 ${langHint}）。\n
5) 尽量短（<= 120 字符），但信息密度高\n
6) 避免与 previousQueries 完全重复\n
7) 你会看到 previousEvalNotes 中包含上次检索命中数量（chunkCount=...）。请利用它优化 query：\n
   - 如果 chunkCount 很少/为 0：通常 query 关键词太多或关键词不对，尝试缩减关键词，或替换/扩展同义词、换更核心术语\n
\n
输出格式：\n
${mode === 'thinking'
  ? `使用论文语言${langHint}先输出“思考摘要”（300字以内，列出候选关键词/改写策略即可；不要输出 JSON）。`
  : '输出必须是严格 JSON：{ \"query\": \"...\" }，不要输出解释、不要输出除 JSON 以外的任何文字。'}
\n
论文信息：\n
- 标题：${paper.title}\n
- 作者：${paper.authors || '未知'}\n
- 摘要：${paper.abstract || '暂无摘要'}\n
\n
用户问题：${userQuestion}\n
\n
${extraContext ? `extraContext:\n${extraContext}\n\n` : ''}previousQueries: ${previousQueries.length ? previousQueries.join(' | ') : '(none)'}\n
previousEvalNotes: ${previousEvalNotes.length ? previousEvalNotes.join(' | ') : '(none)'}\n`

  return prompt
}

function normalizeShortQuery(q: string, maxWords: number) {
  const tokens = String(q || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.slice(0, Math.max(1, maxWords)).join(' ')
}

export function buildFineQueryGeneratorPrompt(args: {
  userQuestion: string
  paper: PaperMeta
  previousQueries: string[]
  previousEvalNotes: string[]
  lastQuery: string
  lastChunkCount: number
  mode?: 'thinking' | 'json'
}) {
  const { userQuestion, paper, previousQueries, previousEvalNotes, lastQuery, lastChunkCount } = args
  const mode = args.mode || 'json'

  const lang = (paper.language || '').toLowerCase()
  const langHint =
    lang === 'zh' ? '中文' :
    lang === 'en' ? '英文' :
    lang === 'ja' ? '日文' :
    lang === 'ko' ? '韩文' :
    lang === 'ru' ? '俄文' :
    lang === 'ar' ? '阿拉伯文' :
    '未知'

  // IMPORTANT: keep requirements consistent with `buildQueryGeneratorPrompt`.
  const prompt = `你正在根据用户的问题进行RAG向量检索，熟知RAG和向量数据库检索的原理。上一轮检索召回很少（chunkCount=${lastChunkCount}），你现在需要进入“精细搜索”模式。\n
你的任务不是回答问题，而是一次性生成 5 组“更短、更聚焦”的检索 query（关键词/短语）。\n
要求：\n
3) 如果用户问题过于泛（如“这篇论文讲什么”），请结合标题/摘要推断关键术语、任务、方法、指标、数据集，生成可命中的 query\n
4) 必须使用论文语言生成 query（论文语言为 ${langHint}）。\n
5) 必须生成两类 query：\n
   - queries3：3 条 query，每条最多 3 个词（用空格分隔），不要用句子\n
   - queries2：2 条 query，每条最多 2 个词（用空格分隔），不要用句子\n
6) 避免与 previousQueries 完全重复，也避免与 lastQuery 完全重复\n
7) 5 组 query 应覆盖不同角度（例如：数据集/方法名/图表/指标或任务），以提升召回率\n
8) 你会看到 previousEvalNotes 中包含上次检索命中数量（chunkCount=...），请利用它判断“关键词过多/过窄/术语不匹配”并调整\n
\n
输出格式：\n
${mode === 'thinking'
  ? `使用论文语言${langHint}输出“思考摘要”（200字以内，说明你打算用哪 5 组关键词覆盖哪些角度；不要输出 JSON）。`
  : '输出必须是严格 JSON：{ \"queries3\": [\"q1\",\"q2\",\"q3\"], \"queries2\": [\"q4\",\"q5\"] }，不要输出解释、不要输出除 JSON 以外的任何文字。'}
\n
论文信息：\n
- 标题：${paper.title}\n
- 作者：${paper.authors || '未知'}\n
- 摘要：${paper.abstract || '暂无摘要'}\n
\n
用户问题：${userQuestion}\n
\n
lastQuery: ${lastQuery}\n
previousQueries: ${previousQueries.length ? previousQueries.join(' | ') : '(none)'}\n
previousEvalNotes: ${previousEvalNotes.length ? previousEvalNotes.join(' | ') : '(none)'}\n`

  return prompt
}

/**
 * 将“用户提问”改写为适合检索的 query。\n
 * 说明：用户问题可能缺少关键词（如“这篇论文讲什么”），因此必须让模型生成\n
 * 能命中论文内容的“检索式 query”（可包含中英关键词、方法名、数据集名、任务名等）。\n
 */
export async function generateSearchQuery(args: {
  model: any
  userQuestion: string
  paper: PaperMeta
  previousQueries: string[]
  previousEvalNotes: string[]
}) {
  const { model, userQuestion, paper, previousQueries, previousEvalNotes } = args
  // Step 1) 先让模型输出“思考摘要”
  const thinkingPrompt = buildQueryGeneratorPrompt({
    userQuestion,
    paper,
    previousQueries,
    previousEvalNotes,
    mode: 'thinking',
  })
  const thinkingRes = await generateText({
    model,
    prompt: thinkingPrompt,
    temperature: 0.2,
    maxOutputTokens: 220,
  })
  const thinking = String(thinkingRes.text || '').trim()
  if (thinking) console.log('[rag][query-thinking]', thinking.slice(0, 1200))

  // Step 2) 再输出严格 JSON
  const jsonPrompt = buildQueryGeneratorPrompt({
    userQuestion,
    paper,
    previousQueries,
    previousEvalNotes,
    mode: 'json',
    extraContext: thinking ? `思考摘要：\n${thinking}\n` : undefined,
  })
  const res = await generateText({
    model,
    prompt: jsonPrompt,
    temperature: 0.2,
    maxOutputTokens: 200,
  })

  const obj = safeJsonObject(res.text)
  const q = String(obj?.query || '').trim()
  if (!q) {
    // 最后兜底：用标题 + 用户问题
    return `${paper.title} ${userQuestion}`
  }
  return q.slice(0, 200)
}

export async function generateFineSearchQueries(args: {
  model: any
  userQuestion: string
  paper: PaperMeta
  previousQueries: string[]
  previousEvalNotes: string[]
  lastQuery: string
  lastChunkCount: number
}) {
  const { model, userQuestion, paper, previousQueries, previousEvalNotes, lastQuery, lastChunkCount } = args

  const thinkingPrompt = buildFineQueryGeneratorPrompt({
    userQuestion,
    paper,
    previousQueries,
    previousEvalNotes,
    lastQuery,
    lastChunkCount,
    mode: 'thinking',
  })
  const thinkingRes = await generateText({
    model,
    prompt: thinkingPrompt,
    temperature: 0.2,
    maxOutputTokens: 220,
  })
  const thinking = String(thinkingRes.text || '').trim()
  if (thinking) console.log('[rag][finequery-thinking]', thinking.slice(0, 1200))

  const jsonPrompt = buildFineQueryGeneratorPrompt({
    userQuestion,
    paper,
    previousQueries,
    previousEvalNotes,
    lastQuery,
    lastChunkCount,
    mode: 'json',
  })
  const res = await generateText({
    model,
    prompt: jsonPrompt,
    temperature: 0.2,
    maxOutputTokens: 200,
  })

  const obj = safeJsonObject(res.text)
  const raw3 = Array.isArray(obj?.queries3) ? obj.queries3 : []
  const raw2 = Array.isArray(obj?.queries2) ? obj.queries2 : []

  const q3 = raw3.map((x: any) => normalizeShortQuery(String(x || ''), 3)).filter(Boolean)
  const q2 = raw2.map((x: any) => normalizeShortQuery(String(x || ''), 2)).filter(Boolean)

  // Ensure 5 queries (best-effort); keep them short and diverse.
  const fallback3a = normalizeShortQuery(lastQuery, 3) || normalizeShortQuery(`${paper.title} ${userQuestion}`, 3)
  const fallback3b = normalizeShortQuery(paper.title, 3) || fallback3a
  const fallback3c = normalizeShortQuery(userQuestion, 3) || fallback3a

  const fallback2a = normalizeShortQuery(lastQuery, 2) || normalizeShortQuery(paper.title, 2) || fallback3a
  const fallback2b = normalizeShortQuery(userQuestion, 2) || fallback2a

  const out3 = [q3[0] || fallback3a, q3[1] || fallback3b, q3[2] || fallback3c].map((q) => normalizeShortQuery(q, 3))
  const out2 = [q2[0] || fallback2a, q2[1] || fallback2b].map((q) => normalizeShortQuery(q, 2))

  // Final: 3x3word + 2x2word
  return [...out3, ...out2]
}

