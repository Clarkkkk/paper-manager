'use client'

import { useRef, useEffect, useState, Dispatch, SetStateAction } from 'react'
import { Paper } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader2, User, Bot, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { useRagDebugStore, type RagDebugData } from '@/lib/rag/debug-store'
import { useRagProgressStore } from '@/lib/rag/progress-store'
import { RAG_EVENT_PREFIX } from '@/lib/rag/progress'
import type { RagProgressStateForMessage } from '@/lib/rag/progress-store'

// 导出 Message 类型供父组件使用
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  paper: Paper
  pdfContent?: string
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

export function ChatPanel({ paper, pdfContent, messages, setMessages }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [contextMode, setContextMode] = useState<'rag' | 'full'>('full')
  const [ingestion, setIngestion] = useState<any>(null)
  const [isLoadingIngestion, setIsLoadingIngestion] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)
  const ragDebugByMessageId = useRagDebugStore((s) => s.byMessageId)
  const setRagDebugForMessage = useRagDebugStore((s) => s.setForMessage)
  const ragProgressByMessageId = useRagProgressStore((s) => s.byMessageId)
  const setRagProgressForMessage = useRagProgressStore((s) => s.setForMessage)
  const clearRagProgressForMessage = useRagProgressStore((s) => s.clearForMessage)

  // 处理建议点击
  const handleSuggestionClick = (text: string) => {
    setInput(text)
  }

  // 自动滚动到底部
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages])

  // 读取索引构建状态（不阻塞聊天）
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoadingIngestion(true)
      try {
        const res = await fetch(`/api/papers/ingest?paperId=${encodeURIComponent(paper.id)}`, {
          credentials: 'include',
        })
        const data = res.ok ? await res.json() : null
        if (!cancelled) setIngestion(data?.ingestion || null)
      } catch {
        if (!cancelled) setIngestion(null)
      } finally {
        if (!cancelled) setIsLoadingIngestion(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [paper.id])

  const triggerIngest = async (opts: { force?: boolean } = {}) => {
    try {
      setIngestion((prev: any) => ({ ...(prev || {}), status: 'running' }))
      await fetch('/api/papers/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paperId: paper.id, ...(opts.force ? { force: true } : {}) }),
      })
      // Refresh status
      const res = await fetch(`/api/papers/ingest?paperId=${encodeURIComponent(paper.id)}`, {
        credentials: 'include',
      })
      const data = res.ok ? await res.json() : null
      setIngestion(data?.ingestion || null)
    } catch {
      // ignore
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    // 如果索引未就绪，后台触发构建（不阻塞当前提问）
    if (ingestion?.status !== 'succeeded') {
      void fetch('/api/papers/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paperId: paper.id }),
      }).catch(() => { })
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    setInput('')
    setIsLoading(true)

    try {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()

      // 先添加用户消息
      setMessages(prev => [...prev, userMessage])

      // 使用 ref 来累积内容，减少渲染频率
      const contentRef = { current: '' }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          paperId: paper.id,
          contextMode,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const errorData = await response.json()
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
      }

      // 读取流式响应（纯文本流，不是 SSE）
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
      }
      setMessages(prev => [...prev, assistantMessage])

      if (reader) {
        // 控制行（进度/调试）会出现在模型正文前：\n
        // - __RAG_EVENT__:{...}\n
        // - __RAG_DEBUG__:{...}\n
        // 一旦收到 answer_start 事件，就切换到“正文模式”，后续不再做逐行解析（避免等换行导致卡顿）。
        const DEBUG_PREFIX = '__RAG_DEBUG__:'
        let mode: 'control' | 'content' = 'control'
        let buffer = ''

        let updateCount = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk

          if (mode === 'control') {
            while (true) {
              const nl = buffer.indexOf('\n')
              if (nl === -1) break

              const line = buffer.slice(0, nl)
              buffer = buffer.slice(nl + 1)

              if (line.startsWith(RAG_EVENT_PREFIX)) {
                const jsonText = line.slice(RAG_EVENT_PREFIX.length)
                try {
                  const ev = JSON.parse(jsonText)
                  setRagProgressForMessage(assistantMessage.id, ev)
                  if (ev?.stage === 'answer_start') {
                    mode = 'content'
                    // answer_start 之后，剩余 buffer（若有）就是正文 token，直接拼接
                    break
                  }
                } catch (e) {
                  console.warn('[ChatPanel] Failed to parse RAG event:', e)
                }
                continue
              }

              if (line.startsWith(DEBUG_PREFIX)) {
                const jsonText = line.slice(DEBUG_PREFIX.length)
                try {
                  const data = JSON.parse(jsonText) as RagDebugData
                  setRagDebugForMessage(assistantMessage.id, data)
                } catch (e) {
                  console.warn('[ChatPanel] Failed to parse RAG debug:', e)
                }
                continue
              }

              // 未识别的控制行：视为正文开始（兜底）
              mode = 'content'
              contentRef.current += line + '\n'
              break
            }
          }

          if (mode === 'content' && buffer) {
            contentRef.current += buffer
            buffer = ''
          }

          // 每5个chunk更新一次UI，减少渲染
          updateCount++
          if (updateCount % 5 === 0) {
            setMessages(prev => {
              const newMessages = [...prev]
              if (newMessages.length > 0) {
                newMessages[newMessages.length - 1] = {
                  ...assistantMessage,
                  content: contentRef.current,
                }
              }
              return newMessages
            })
          }
        }

        // 最终更新，确保内容完整
        setMessages(prev => {
          const newMessages = [...prev]
          if (newMessages.length > 0) {
            newMessages[newMessages.length - 1] = {
              ...assistantMessage,
              content: contentRef.current,
            }
          }
          return newMessages
        })

        // 流结束后清理进度（避免 UI 残留）
        clearRagProgressForMessage(assistantMessage.id)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return // 用户取消了请求，静默处理
      }
      console.error('Chat error:', error)
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ ${errorMsg}`,
      }])
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const renderRagProgressLabel = (p: RagProgressStateForMessage | undefined) => {
    const attempt = typeof p?.attempt === 'number' ? p.attempt : undefined
    const chunkCount = typeof p?.chunkCount === 'number' ? p.chunkCount : undefined
    const stage = String(p?.stage || '')
    switch (stage) {
      case 'rag_start':
        return '正在准备检索…'
      case 'thinking_precheck':
        return '正在思考（判断是否需要检索）…'
      case 'thinking_query':
        return '正在思考（生成检索 query）…'
      case 'full_context_load':
        return '正在加载全文上下文…'
      case 'attempt_start':
        return `正在检索（第 ${attempt ?? '?'} / 3 次）…`
      case 'retrieval_start':
        return `正在召回相关片段（第 ${attempt ?? '?'} / 3 次）…`
      case 'retrieval_done':
        return `已召回 ${chunkCount ?? 0} 个片段，正在评估…`
      case 'thinking_eval':
        return '正在思考（评估片段是否足够回答）…'
      case 'eval_start':
        return '正在评估检索结果…'
      case 'eval_done':
        return p?.hasSufficientChunk ? '已找到可回答的引用片段，准备生成回答…' : '当前片段不足以回答，准备重试…'
      case 'refine_and_retry':
        return '结果不足以回答，正在调整检索并重试…'
      case 'rag_stop':
        return '检索完成，准备生成回答…'
      case 'answer_start':
        return '正在生成回答…'
      case 'error':
        return `检索过程出错：${String(p?.message || 'unknown')}`
      default:
        return '正在处理…'
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages - 使用原生 div 滚动 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="p-4 space-y-4">
          {/* Ingestion status */}
          {!isLoadingIngestion && (
            ingestion ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
                {ingestion?.status === 'running' ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    正在构建论文索引（RAG）…你可以继续提问，但回答质量可能受影响
                  </div>
                ) : ingestion?.status === 'failed' ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      索引构建失败：{String(ingestion?.error || 'unknown').slice(0, 120)}
                    </div>
                    <Button size="sm" variant="secondary" className="h-7" onClick={() => triggerIngest({ force: true })}>
                      重试
                    </Button>
                  </div>
                ) : ingestion?.status === 'succeeded' ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      索引已构建完成（chunk={String(ingestion?.chunk_count ?? '')}，lang={String(ingestion?.language ?? 'unknown')}）
                    </div>
                    <Button size="sm" variant="secondary" className="h-7" onClick={() => triggerIngest({ force: true })}>
                      重新构建
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      尚未构建论文索引（RAG）。建议先构建索引以获得更准确的引用回答。
                    </div>
                    <Button size="sm" variant="secondary" className="h-7" onClick={() => triggerIngest()}>
                      构建
                    </Button>
                  </div>
                )}
              </div>
            ) : null
          )}

          {messages.length === 0 ? (
            <EmptyChat paperTitle={paper.title} onSuggestionClick={handleSuggestionClick} />
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'flex-row-reverse' : ''
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
                  message.role === 'user'
                    ? 'bg-emerald-500/20'
                    : 'bg-zinc-800'
                )}>
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Bot className="w-4 h-4 text-zinc-400" />
                  )}
                </div>

                {/* Message Content */}
                <div className={cn(
                  'flex-1 rounded-xl px-3.5 py-2.5 max-w-[85%]',
                  message.role === 'user'
                    ? 'bg-emerald-600/20 text-zinc-200 ml-auto'
                    : 'bg-zinc-800/50 text-zinc-300'
                )}>
                  {/* RAG Progress (assistant only) */}
                  {message.role === 'assistant' && ragProgressByMessageId[message.id] && (
                    (message.content.length === 0 || ragProgressByMessageId[message.id]?.stage !== 'answer_start') ? (
                      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{renderRagProgressLabel(ragProgressByMessageId[message.id])}</span>
                      </div>
                    ) : null
                  )}
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="text-sm leading-relaxed mb-2 last:mb-0">
                            {children}
                          </p>
                        ),
                        code: ({ children }) => (
                          <code className="text-emerald-400 bg-zinc-900/50 px-1 py-0.5 rounded text-xs">
                            {children}
                          </code>
                        ),
                        ul: ({ children }) => (
                          <ul className="space-y-1 my-2 text-sm">
                            {children}
                          </ul>
                        ),
                        li: ({ children }) => (
                          <li className="flex gap-1.5">
                            <span className="text-emerald-500 shrink-0">•</span>
                            <span>{children}</span>
                          </li>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>

                  {/* RAG Debug Panel (assistant only) */}
                  {message.role === 'assistant' && ragDebugByMessageId[message.id] && (
                    <details className="mt-3 rounded-lg border border-zinc-700/50 bg-zinc-950/30 px-3 py-2">
                      <summary className="cursor-pointer text-xs text-zinc-400 select-none">
                        查看检索过程与引用原文
                      </summary>
                      <RagDebugView data={ragDebugByMessageId[message.id]} />
                    </details>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Bot className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="bg-zinc-800/50 rounded-xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={contextMode === 'rag' ? 'secondary' : 'ghost'}
              className="h-8"
              onClick={() => setContextMode('rag')}
              disabled={isLoading}
            >
              RAG 模式
            </Button>
            <Button
              type="button"
              size="sm"
              variant={contextMode === 'full' ? 'secondary' : 'ghost'}
              className="h-8"
              onClick={() => setContextMode('full')}
              disabled={isLoading}
            >
              全量上下文
            </Button>
          </div>
          <div className="text-xs text-zinc-600">
            {contextMode === 'full' ? '不走检索，直接注入全文（按预算截断）' : '检索召回片段后再回答'}
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="询问关于这篇论文的问题..."
            rows={1}
            className="resize-none bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 min-h-[44px] max-h-[120px]"
            onKeyDown={(e) => {
              // 当使用中文/日文/韩文等 IME 组合输入时，Enter 可能用于“上屏/选词”，不应发送消息
              // React: e.nativeEvent.isComposing；部分浏览器也会用 keyCode=229
              e.persist()
              const isComposing =
                e.nativeEvent?.isComposing === true

              if (isComposing) return

              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit(e)
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input?.trim()}
            className="h-11 w-11 shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
        <p className="text-xs text-zinc-600 mt-2 text-center">
          AI 回答基于论文内容，可能存在不准确之处
        </p>
      </div>
    </div>
  )
}

function RagDebugView({ data }: { data: RagDebugData }) {
  return (
    <div className="mt-2 space-y-3 text-xs text-zinc-300">
      <div className="text-zinc-400">
        traceId: <span className="text-zinc-300">{data.traceId}</span>
      </div>
      {data.contextMode && (
        <div className="text-zinc-400">
          contextMode: <span className="text-zinc-300">{data.contextMode}</span>
        </div>
      )}
      {data.fullContext && (
        <div className="text-zinc-400">
          fullContext:{' '}
          <span className="text-zinc-300">
            included={data.fullContext.includedChunks}/{data.fullContext.totalChunks}, chars={data.fullContext.charCount},
            truncated={String(data.fullContext.truncated)}
          </span>
        </div>
      )}
      <div className="text-zinc-400">
        usedAttempt: <span className="text-zinc-300">{data.usedAttempt}</span>
      </div>

      {data.attempts.length === 0 ? (
        <div className="text-zinc-500">（本次未使用 RAG attempts）</div>
      ) : data.attempts.map((a) => (
        <div key={a.attempt} className="rounded-md border border-zinc-800 bg-zinc-900/30 p-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-400">
            <span>attempt: {a.attempt}</span>
            <span>relevant: {String(a.eval.isRelevant)}</span>
            <span>score: {a.eval.score.toFixed(2)}</span>
          </div>
          <div className="mt-1">
            <span className="text-zinc-400">query: </span>
            <span className="text-zinc-200">{a.query}</span>
          </div>
          {a.eval.refinedQuery && (
            <div className="mt-1">
              <span className="text-zinc-400">refinedQuery: </span>
              <span className="text-zinc-200">{a.eval.refinedQuery}</span>
            </div>
          )}
          <div className="mt-1 text-zinc-400">reason: {a.eval.explanation}</div>

          <div className="mt-2 space-y-2">
            {(a.chunks || []).slice(0, 10).map((c, idx) => (
              <details key={c.id || idx} className="rounded bg-zinc-950/40 px-2 py-1">
                <summary className="cursor-pointer text-zinc-300">
                  #{idx + 1} p.{c.page_start ?? '?'}-{c.page_end ?? '?'} chunk={c.chunk_index}{' '}
                  <span className="text-zinc-500">
                    source={c.source || 'n/a'} score={typeof (c as any).model_score === 'number' ? (c as any).model_score.toFixed(2) : 'n/a'}
                  </span>
                </summary>
                <pre className="mt-1 whitespace-pre-wrap text-zinc-200">
                  {c.content}
                </pre>
              </details>
            ))}
            {(!a.chunks || a.chunks.length === 0) && <div className="text-zinc-500">(无命中)</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

interface EmptyChatProps {
  paperTitle: string
  onSuggestionClick: (text: string) => void
}

function EmptyChat({ paperTitle, onSuggestionClick }: EmptyChatProps) {
  const suggestions = [
    "这篇论文的主要贡献是什么？",
    "作者使用了什么方法？",
    "实验结果如何？",
    "请解读论文中的每一张主图",
  ]

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
        <MessageSquare className="w-8 h-8 text-zinc-600" />
      </div>
      <h3 className="text-sm font-medium text-zinc-300 mb-1">
        开始对话
      </h3>
      <p className="text-xs text-zinc-500 max-w-[200px] mb-4">
        向 AI 提问关于这篇论文的任何问题
      </p>
      <div className="space-y-2 w-full max-w-[280px]">
        {suggestions.map((text) => (
          <button
            key={text}
            onClick={() => onSuggestionClick(text)}
            className="w-full text-left text-xs px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors border border-zinc-800 hover:border-zinc-700"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
