'use client'

import { useRef, useEffect, useState, Dispatch, SetStateAction } from 'react'
import { Paper } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader2, User, Bot, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

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
  quickModel?: string
}

export function ChatPanel({ paper, pdfContent, messages, setMessages, quickModel }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // 获取当前使用的模型
  const currentModel = quickModel || localStorage.getItem('myscispace-quick-model') || 'liquid/lfm-2.5-1.2b-instruct:free'
  
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    
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
      let updateCount = 0
      
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
          paperContent: pdfContent,
          model: currentModel, // 发送快捷选择的模型
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
        let updateCount = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          contentRef.current += chunk
          
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

  return (
    <div className="h-full flex flex-col">
      {/* Messages - 使用原生 div 滚动 */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="p-4 space-y-4">
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
        <form onSubmit={onSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="询问关于这篇论文的问题..."
            rows={1}
            className="resize-none bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 min-h-[44px] max-h-[120px]"
            onKeyDown={(e) => {
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
