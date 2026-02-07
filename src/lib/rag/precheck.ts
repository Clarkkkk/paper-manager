import { generateText } from 'ai'
import type { PaperMeta } from './types'
import { safeJsonObject } from './json'

export type RagPrecheckResult = {
  isPaperRelated: boolean
  canAnswerDirectly: boolean
  reason?: string
}

function buildPrecheckPrompt(args: {
  userQuestion: string
  paper: PaperMeta
  recentMessages: Array<{ role: string; content: string }>
  mode?: 'thinking' | 'json'
  extraContext?: string
}) {
  const { userQuestion, paper, recentMessages, extraContext } = args
  const mode = args.mode || 'json'

  const recent = recentMessages
    .slice(-6)
    .map((m) => `${m.role}: ${String(m.content || '').slice(0, 400)}`)
    .join('\n')

  return `你是一个“对话预检器”。你的任务不是回答问题，而是判断是否需要进行论文检索（RAG）。\n
输出格式：\n
${mode === 'thinking'
  ? '先输出“思考摘要”（200字以内，列出你判断 isPaperRelated / canAnswerDirectly 的关键依据；不要输出 JSON）。'
  : '现在请按以下JSON Schema输出严格 JSON（仅 JSON），禁止输出任何其它文字。'}\n
\n
输出 JSON Schema：\n
{\n
  \"type\": \"object\",\n
  \"additionalProperties\": false,\n
  \"required\": [\"isPaperRelated\", \"canAnswerDirectly\", \"reason\"],\n
  \"properties\": {\n
    \"isPaperRelated\": {\"type\": \"boolean\", \"description\": \"用户问题是否与这篇论文内容相关\"},\n
    \"canAnswerDirectly\": {\"type\": \"boolean\", \"description\": \"不做检索/引用也能回答（通用问题或上下文已足够）\"},\n
    \"reason\": {\"type\": \"string\", \"description\": \"<= 60 字符的简短理由\"}\n
  }\n
}\n
\n
判断规则：\n
- 首先根据论文标题和摘要（如有）判断该问题是否与论文相关。\n
- 如果明显是与当前论文无关的常识性问题：isPaperRelated=false, canAnswerDirectly=true。\n
- 如果与论文相关但仅凭标题/摘要/用户当前上下文就能回答；注意，如果与论文相关，绝对不能仅凭常识回答，直接回答的前提必须是标题/摘要/用户当前上下文已覆盖相关内容：isPaperRelated=true, canAnswerDirectly=true。\n
- 如果与论文相关且需要引用/核对论文内容才能可靠回答：isPaperRelated=true, canAnswerDirectly=false。\n
\n
论文信息：\n
- 标题：${paper.title}\n
- 作者：${paper.authors || '未知'}\n
- 摘要：${paper.abstract || '暂无摘要'}\n
\n
最近对话：\n
${recent || '(none)'}\n
\n
用户问题：${userQuestion}\n
\n
${extraContext ? `extraContext:\n${extraContext}\n` : ''}`
}

export async function ragPrecheck(args: {
  model: Parameters<typeof generateText>[0]['model']
  userQuestion: string
  paper: PaperMeta
  recentMessages: Array<{ role: string; content: string }>
}) {
  const { model, userQuestion, paper, recentMessages } = args

  // Step 1) 先让模型输出“思考摘要”（便于调试/日志）
  const thinkingPrompt = buildPrecheckPrompt({
    userQuestion,
    paper,
    recentMessages,
    mode: 'thinking',
  })
  const thinkingRes = await generateText({
    model,
    prompt: thinkingPrompt,
    temperature: 0.1,
    maxOutputTokens: 220,
  })
  const thinking = String(thinkingRes.text || '').trim()
  if (thinking) console.log('[rag][precheck-thinking]', thinking.slice(0, 1200))

  // Step 2) 再输出严格 JSON
  const jsonPrompt = buildPrecheckPrompt({
    userQuestion,
    paper,
    recentMessages,
    mode: 'json',
    extraContext: thinking ? `思考摘要：\n${thinking}\n` : undefined,
  })
  const res = await generateText({
    model,
    prompt: jsonPrompt,
    temperature: 0.1,
    maxOutputTokens: 220,
  })

  const obj = safeJsonObject(res.text)
  const anyObj = (obj && typeof obj === 'object') ? (obj as Record<string, unknown>) : null
  const isPaperRelated = Boolean(anyObj?.isPaperRelated)
  const canAnswerDirectly = Boolean(anyObj?.canAnswerDirectly)
  const reason = typeof anyObj?.reason === 'string' ? anyObj.reason.slice(0, 120) : undefined

  return { isPaperRelated, canAnswerDirectly, reason } satisfies RagPrecheckResult
}

