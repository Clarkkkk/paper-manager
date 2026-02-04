'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paper, Note } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import { ExportNotes } from './export-notes'

interface NotesPanelProps {
  paper: Paper
  existingNote: Note | null
  pdfContent?: string
  quickModel?: string
}

export function NotesPanel({ paper, existingNote, pdfContent: preloadedPdfContent, quickModel }: NotesPanelProps) {
  const [note, setNote] = useState(existingNote?.content || '')
  const [streamingContent, setStreamingContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  
  // 获取当前使用的模型
  const currentModel = quickModel || localStorage.getItem('myscispace-quick-model') || 'liquid/lfm-2.5-1.2b-instruct:free'

  const handleGenerate = async () => {
    setStreamingContent('')
    setIsLoading(true)
    
    // 使用预加载的 PDF 内容
    const pdfContent = preloadedPdfContent || ''
    
    if (!pdfContent) {
      toast.warning('PDF 内容尚未加载完成，将使用有限信息生成笔记')
    }
    
    try {
      
      // 2. 调用生成笔记 API
      const response = await fetch('/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paperId: paper.id,
          paperContent: pdfContent,
          model: currentModel, // 发送快捷选择的模型
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '生成失败')
      }
      
      // 3. 读取流式响应
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          fullContent += chunk
          setStreamingContent(fullContent)
        }
      }
      
      // 4. 完成后保存
      setNote(fullContent)
      setStreamingContent('')
      toast.success('笔记生成完成!')
      router.refresh()
      
    } catch (error) {
      console.error('Generate notes error:', error)
      toast.error(error instanceof Error ? error.message : '笔记生成失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 显示内容：加载中显示流式输出，否则显示保存的笔记
  const displayContent = isLoading ? streamingContent : note

  return (
    <div className="p-4 space-y-4">
      {/* Generate Button */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleGenerate}
          disabled={isLoading}
          className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              生成中...
            </>
          ) : note ? (
            <>
              <RefreshCw className="w-4 h-4" />
              重新生成
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              生成 AI 笔记
            </>
          )}
        </Button>
        
        {/* Export Button */}
        {note && !isLoading && (
          <ExportNotes paper={paper} noteContent={note} />
        )}
        
        {note && !isLoading && (
          <span className="text-xs text-zinc-500 ml-auto">
            基于 AI 自动生成
          </span>
        )}
      </div>

      {/* Notes Content */}
      {displayContent ? (
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            components={{
              h2: ({ children }) => (
                <h2 className="text-lg font-semibold text-emerald-400 mt-6 mb-3 first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-base font-medium text-zinc-200 mt-4 mb-2">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-zinc-400 leading-relaxed mb-3">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="space-y-1.5 my-3 ml-1">
                  {children}
                </ul>
              ),
              li: ({ children }) => (
                <li className="text-zinc-400 flex gap-2">
                  <span className="text-emerald-500 shrink-0">•</span>
                  <span>{children}</span>
                </li>
              ),
              strong: ({ children }) => (
                <strong className="text-zinc-200 font-medium">
                  {children}
                </strong>
              ),
              code: ({ children }) => (
                <code className="text-emerald-400 bg-zinc-800/50 px-1.5 py-0.5 rounded text-sm">
                  {children}
                </code>
              ),
            }}
          >
            {displayContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">
            还没有笔记
          </h3>
          <p className="text-xs text-zinc-500 max-w-[200px]">
            点击上方按钮，让 AI 为你生成结构化的论文笔记
          </p>
        </div>
      )}
    </div>
  )
}
