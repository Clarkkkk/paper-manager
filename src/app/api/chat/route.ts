import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getAIClient, RAG_SYSTEM_PROMPT } from '@/lib/ai/openai'
import { NextRequest } from 'next/server'
import { runRagRetrievalLoop } from '@/lib/rag/pipeline'
import { formatPaperMeta, formatRetrievalAttemptsForPrompt } from '@/lib/rag/prompt'
import type { PaperMeta } from '@/lib/rag/types'
import { encodeRagProgressEventLine } from '@/lib/rag/progress'
import { ragPrecheck } from '@/lib/rag/precheck'

function makeTraceId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`
}

export async function POST(req: NextRequest) {
  try {
    const traceId = makeTraceId()
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    // 验证用户身份
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { messages, paperId } = body || {}
    const contextMode = body?.contextMode === 'full' ? 'full' : 'rag'
    
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Invalid messages format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 获取论文信息（用于 RAG 上下文）
    let paperMeta: PaperMeta | null = null
    if (paperId) {
      const { data: paperDataResult } = await supabase
        .from('papers')
        .select('title, abstract, authors')
        .eq('id', paperId)
        .eq('user_id', user.id)
        .single()

      const paperData = paperDataResult as { title: string; abstract?: string; authors?: string } | null
      
      if (paperData) {
        paperMeta = {
          title: paperData.title,
          authors: paperData.authors || null,
          abstract: paperData.abstract || null,
        }
      }

      // Try to load detected language from ingestion state (best-effort).
      try {
        const { data: ingestData } = await supabaseAny
          .from('paper_ingestions')
          .select('language')
          .eq('paper_id', paperId)
          .eq('user_id', user.id)
          .maybeSingle()
        const lang = (ingestData as any)?.language
        if (paperMeta) {
          paperMeta.language = typeof lang === 'string' ? lang : null
        }
      } catch {
        // ignore
      }
    }

    const lastUserMessage = [...messages].reverse().find((m) => m && m.role === 'user' && typeof m.content === 'string')
    const userQuestion = String(lastUserMessage?.content || '').trim()

    // 获取 AI 客户端配置（模型由服务端根据用户 profile 统一决定）
    const { client, model: modelId, hasCustomKey } = await getAIClient()
    
    console.log(`[Chat API] Using model: ${modelId}`)

    // RAG：最多 3 次 query 生成 + 检索 + 相关性评估
    // 我们用自定义 ReadableStream：RAG 阶段持续写入 `__RAG_EVENT__`，然后再开始输出模型正文 token。
    // 这样前端可以实时展示“正在检索/命中数量/正在评估/正在重试/开始生成回答”等进度。

    // Debug: check if provider separates reasoning vs final text.
    const chunkTypeCounts: Record<string, number> = {}
    let textDeltaLen = 0
    let reasoningDeltaLen = 0
    let textDeltaPreview = ''
    let reasoningDeltaPreview = ''

    const encoder = new TextEncoder()
    let cancelled = false

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const safeEnqueueText = (text: string) => {
          if (cancelled) return
          try {
            controller.enqueue(encoder.encode(text))
          } catch {
            // ignore
          }
        }

        const safeEnqueueEvent = (ev: Parameters<typeof encodeRagProgressEventLine>[0]) => {
          safeEnqueueText(encodeRagProgressEventLine(ev))
        }

        ;(async () => {
          // 1) 先发一个起始事件（如果没有 RAG 条件，也能用来结束 loading）
          safeEnqueueEvent({ stage: 'rag_start', ts: Date.now(), traceId })

          // 2) 异步写入用户消息（不阻塞进度输出）
          try {
            if (paperId && messages.length > 0) {
              const lastMessage = messages[messages.length - 1]
              if (lastMessage.role === 'user') {
                void supabaseAny.from('chat_messages').insert({
                  paper_id: paperId,
                  user_id: user.id,
                  role: 'user',
                  content: lastMessage.content,
                } as any)
              }
            }
          } catch {
            // ignore
          }

          // 3) RAG 检索与评估（会持续输出 __RAG_EVENT__ 行）
          let retrievalAttemptsText = ''
          let retrievalAttemptsRaw: any[] = []
          let usedAttempt = 0
          let usedChunkIds: string[] = []
          let precheck: { isPaperRelated: boolean; canAnswerDirectly: boolean; reason?: string } | null = null

          let shouldRunRag = contextMode !== 'full' && Boolean(paperId && paperMeta && userQuestion)
          let fullContextMeta: any = null
          let fullContextText = ''

          // 3.1) 预检：判断是否需要检索（不相关/可直接回答则跳过 RAG）
          if (contextMode !== 'full' && paperId && paperMeta && userQuestion) {
            try {
              safeEnqueueEvent({ stage: 'thinking_precheck', ts: Date.now(), traceId })
              precheck = await ragPrecheck({
                model: client(modelId),
                userQuestion,
                paper: paperMeta,
                recentMessages: (Array.isArray(messages) ? messages : []).map((m: any) => ({
                  role: String(m?.role || ''),
                  content: String(m?.content || ''),
                })),
              })
              console.log('[rag][precheck]', JSON.stringify({ traceId, paperId, ...precheck }))

              // 跳过条件：
              // - 明显与论文无关 -> 不跑 RAG
              // - 与论文相关但无需检索/引用即可回答 -> 不跑 RAG
              if (!precheck.isPaperRelated || precheck.canAnswerDirectly) {
                shouldRunRag = false
              }
            } catch (e) {
              // 预检失败不阻塞：继续走 RAG
              console.warn('[rag][precheck] failed:', e)
              safeEnqueueEvent({ stage: 'error', ts: Date.now(), traceId, message: 'precheck_failed' })
              precheck = null
              shouldRunRag = true
            }
          }

          // 3.1.5) Full-context mode: load full paper chunks (budgeted) and skip RAG.
          if (contextMode === 'full' && paperId && paperMeta && userQuestion) {
            try {
              safeEnqueueEvent({ stage: 'full_context_load', ts: Date.now(), traceId })
              const maxCharsRaw = Number(process.env.FULL_CONTEXT_MAX_CHARS || '80000')
              const maxChunksRaw = Number(process.env.FULL_CONTEXT_MAX_CHUNKS || '60')
              const maxChars = Number.isFinite(maxCharsRaw) && maxCharsRaw > 1000 ? maxCharsRaw : 80000
              const maxChunks = Number.isFinite(maxChunksRaw) && maxChunksRaw > 0 ? maxChunksRaw : 60

              const { data: chunkRows, error: chunkErr } = await supabaseAny
                .from('paper_chunks')
                .select('chunk_index, page_start, page_end, content')
                .eq('paper_id', paperId)
                .eq('user_id', user.id)
                .order('chunk_index', { ascending: true })

              if (chunkErr) {
                console.warn('[full_context] load chunks failed:', chunkErr)
              }

              const rows = Array.isArray(chunkRows) ? chunkRows : []
              let charCount = 0
              const included: any[] = []
              for (const r of rows) {
                if (included.length >= maxChunks) break
                const header = `[chunk_index=${String(r.chunk_index)} p.${String(r.page_start ?? '?')}-${String(r.page_end ?? '?')}]\n`
                const text = String(r.content || '')
                const entryLen = header.length + text.length + 2
                if (included.length > 0 && charCount + entryLen > maxChars) break
                included.push({ ...r })
                charCount += entryLen
              }
              // If budget too small and nothing included, include at least one chunk (truncated).
              if (included.length === 0 && rows.length > 0) {
                const r = rows[0]
                const header = `[chunk_index=${String(r.chunk_index)} p.${String(r.page_start ?? '?')}-${String(r.page_end ?? '?')}]\n`
                const text = String(r.content || '').slice(0, Math.max(0, maxChars - header.length - 2))
                included.push({ ...r, content: text })
                charCount = header.length + text.length + 2
              }

              const firstIdx = included.length ? Number(included[0].chunk_index) : undefined
              const lastIdx = included.length ? Number(included[included.length - 1].chunk_index) : undefined
              const truncated = included.length < rows.length

              fullContextMeta = {
                totalChunks: rows.length,
                includedChunks: included.length,
                maxChars,
                maxChunks,
                charCount,
                truncated,
                firstChunkIndex: Number.isFinite(firstIdx as any) ? firstIdx : undefined,
                lastChunkIndex: Number.isFinite(lastIdx as any) ? lastIdx : undefined,
              }

              fullContextText =
                included.length > 0
                  ? `--- Full Paper Text (chunked) ---\n\n${included
                      .map((r) => {
                        const header = `[chunk_index=${String(r.chunk_index)} p.${String(r.page_start ?? '?')}-${String(r.page_end ?? '?')}]\n`
                        return `${header}${String(r.content || '')}`
                      })
                      .join('\n\n')}\n`
                  : ''

              console.log('[full_context]', JSON.stringify({ traceId, paperId, ...fullContextMeta }))
              shouldRunRag = false
            } catch (e) {
              console.warn('[full_context] failed:', e)
              safeEnqueueEvent({ stage: 'error', ts: Date.now(), traceId, message: 'full_context_failed' })
              fullContextMeta = null
              fullContextText = ''
              // Fall back to rag (best-effort)
              shouldRunRag = Boolean(paperId && paperMeta && userQuestion)
            }
          }

          // 3.2) 仅在需要时运行 RAG
          if (shouldRunRag && paperId && paperMeta && userQuestion) {
            try {
              const attempts = await runRagRetrievalLoop({
                supabaseAny,
                ragModel: client(modelId),
                paperId,
                paper: paperMeta,
                userQuestion,
                traceId,
                onProgress: (ev) => safeEnqueueEvent(ev),
              })

              retrievalAttemptsRaw = attempts
              retrievalAttemptsText = formatRetrievalAttemptsForPrompt(attempts, {
                maxChunksPerAttempt: Number(process.env.RAG_PROMPT_MAX_CHUNKS_PER_ATTEMPT || '10') || 10,
              })

              // Choose “used” attempt for UI: prefer first relevant, otherwise highest model-derived chunk score.
              const relevant = attempts.find((a) => a.eval?.isRelevant)
              const best =
                relevant ||
                [...attempts].sort((a, b) => {
                  const aBest = Math.max(
                    0,
                    ...(a.chunks || []).map((c: any) => (typeof c.model_score === 'number' ? c.model_score : 0))
                  )
                  const bBest = Math.max(
                    0,
                    ...(b.chunks || []).map((c: any) => (typeof c.model_score === 'number' ? c.model_score : 0))
                  )
                  // tie-breaker: eval.score
                  if (bBest !== aBest) return bBest - aBest
                  return (b.eval?.score || 0) - (a.eval?.score || 0)
                })[0]

              usedAttempt = best?.attempt || 0
              usedChunkIds = (best?.chunks || [])
                .slice()
                .sort(
                  (x: any, y: any) =>
                    (typeof y.model_score === 'number' ? y.model_score : -1) - (typeof x.model_score === 'number' ? x.model_score : -1)
                )
                .slice(0, Number(process.env.RAG_UI_MAX_USED_CHUNKS || '6') || 6)
                .map((c) => c.id)
                .filter(Boolean)
            } catch (e) {
              console.warn('[Chat API] RAG pipeline failed:', e)
              safeEnqueueEvent({ stage: 'error', ts: Date.now(), traceId, message: 'rag_pipeline_failed' })
            }
          }

          // 4) 构建 system prompt（包含 paper meta + 检索过程）
          const paperContext = paperMeta ? formatPaperMeta(paperMeta) : ''
          const precheckHint =
            precheck && !shouldRunRag
              ? precheck.isPaperRelated
                ? `【预检】无需检索即可回答（reason=${String(precheck.reason || '').slice(0, 60)}）。请直接回答；不要编造论文引用。\n\n`
                : `【预检】该问题可能与论文无关（reason=${String(precheck.reason || '').slice(0, 60)}）。你可以直接按通用知识回答，并明确说明与论文无关；不要编造论文引用。\n\n`
              : ''

          const systemMessage = paperContext
            ? `${precheckHint}${RAG_SYSTEM_PROMPT}\n\n--- Paper Context ---\n${paperContext}\n\n${contextMode === 'full' ? fullContextText : retrievalAttemptsText}`
            : `${precheckHint}${RAG_SYSTEM_PROMPT}`

          // 5) 在模型正文开始之前，先发 debug prelude（可选），再发 answer_start（客户端据此切换到“正文模式”）
          const ragDebugPrelude =
            paperId && paperMeta && userQuestion
              ? `__RAG_DEBUG__:${JSON.stringify({
                  traceId,
                  paperId,
                  userQuestion,
                  contextMode,
                  fullContext: fullContextMeta,
                  precheck,
                  attempts: retrievalAttemptsRaw,
                  usedAttempt,
                  usedChunkIds,
                  createdAt: Date.now(),
                })}\n`
              : ''
          if (ragDebugPrelude) safeEnqueueText(ragDebugPrelude)
          safeEnqueueEvent({ stage: 'answer_start', ts: Date.now(), traceId })

          // 6) 开始输出模型正文 token（保持原来的 streamText 行为）
          const result = await streamText({
            model: client(modelId),
            system: systemMessage,
            messages,
            maxOutputTokens: 2048,
            temperature: 0.7,
            onChunk({ chunk }) {
              chunkTypeCounts[chunk.type] = (chunkTypeCounts[chunk.type] || 0) + 1
              if (chunk.type === 'text-delta' && typeof (chunk as any).delta === 'string') {
                const d = String((chunk as any).delta)
                textDeltaLen += d.length
                if (textDeltaPreview.length < 600) {
                  textDeltaPreview += d.slice(0, 600 - textDeltaPreview.length)
                }
              }
              if (chunk.type === 'reasoning-delta') {
                const d = String((chunk as any).delta)
                reasoningDeltaLen += d.length
                if (reasoningDeltaPreview.length < 600) {
                  reasoningDeltaPreview += d.slice(0, 600 - reasoningDeltaPreview.length)
                }
              }
            },
            onError({ error }) {
              console.error('[Chat API] Stream error:', error)
            },
            onFinish(event) {
              try {
                console.log(
                  '[Chat API] Stream finished:',
                  event.reasoning,
                  event.providerMetadata,
                  event.usage,
                  JSON.stringify({
                    traceId,
                    paperId,
                    modelId,
                    finishReason: (event as any)?.finishReason,
                    textLen: typeof (event as any)?.text === 'string' ? (event as any).text.length : undefined,
                    reasoningTextLen:
                      typeof (event as any)?.reasoningText === 'string' ? (event as any).reasoningText.length : undefined,
                    hasReasoningText:
                      typeof (event as any)?.reasoningText === 'string' && (event as any).reasoningText.length > 0,
                    textHead: String((event as any)?.text || '').slice(0, 600),
                    reasoningHead: String((event as any)?.reasoningText || '').slice(0, 600),
                    chunkTypeCounts,
                    textDeltaLen,
                    reasoningDeltaLen,
                    textDeltaPreview,
                    reasoningDeltaPreview,
                  })
                )
              } catch (e) {
                console.warn('[Chat API] onFinish log failed:', e)
              }
            },
          })

          const aiRes = result.toTextStreamResponse()
          const reader = aiRes.body?.getReader()
          if (!reader) {
            controller.close()
            return
          }

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (cancelled) break
            if (value) controller.enqueue(value)
          }

          try {
            reader.cancel()
          } catch {
            // ignore
          }
          controller.close()
        })().catch((e) => controller.error(e))
      },
      cancel() {
        cancelled = true
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Model-Used': modelId,
        'X-Has-Custom-Key': String(hasCustomKey),
      },
    })
    
  } catch (error) {
    console.error('Chat API Error:', error)
    
    let errorMessage = 'Internal server error'
    let statusCode = 500
    
    if (error instanceof Error) {
      // 检测 API 配额错误 / 限流
      if (error.message.includes('429') || 
          error.message.includes('RESOURCE_EXHAUSTED') || 
          error.message.includes('quota') ||
          error.message.includes('rate-limit') ||
          error.message.includes('rate limited') ||
          error.message.includes('upstream')) {
        errorMessage = '⚠️ 免费模型暂时不可用，请稍后再试或配置自己的 API Key'
        statusCode = 429
      } else if (error.message.includes('Unauthorized') || error.message.includes('invalid api key')) {
        errorMessage = 'API Key 无效，请检查配置'
        statusCode = 401
      } else {
        errorMessage = error.message
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
