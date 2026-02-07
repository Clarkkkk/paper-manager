import { generateText } from 'ai'
import type { PaperMeta } from './types'
import { safeJsonObject } from './json'

export type RagPrecheckResult = {
  isPaperRelated: boolean
  canAnswerDirectly: boolean
  reason?: string
}

export async function ragPrecheck(args: {
  model: Parameters<typeof generateText>[0]['model']
  userQuestion: string
  paper: PaperMeta
  recentMessages: Array<{ role: string; content: string }>
}) {
  const { model, userQuestion, paper, recentMessages } = args

  const recent = recentMessages
    .slice(-6)
    .map((m) => `${m.role}: ${String(m.content || '').slice(0, 400)}`)
    .join('\n')

  const prompt = `你是一个“对话预检器”。你的任务不是回答问题，而是判断是否需要进行论文检索（RAG）。\n
请只输出严格 JSON（仅 JSON），禁止输出任何其它文字。\n
\n
输出 JSON Schema（你必须产出符合该 schema 的 JSON）：\n
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
用户问题：${userQuestion}\n`

  const res = await generateText({
    model,
    prompt,
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

