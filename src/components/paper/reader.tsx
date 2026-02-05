'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Paper, Note } from '@/types/database'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeft, FileText, MessageSquare, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { NotesPanel } from './notes-panel'
import { ChatPanel, Message } from './chat-panel'
import { ModelSelector, useQuickModel } from './model-selector'
import { cn } from '@/lib/utils'

interface PaperReaderProps {
  paper: Paper
  note: Note | null
  pdfPath: string
}

type CachedSignedUrl = {
  signedUrl: string
  expiresAt: number
  file_url: string
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

function getSignedUrlCacheKey(paperId: string) {
  return `myscispace:paper-signed-url:${paperId}`
}

export function PaperReader({ paper, note, pdfPath }: PaperReaderProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'notes' | 'chat'>('notes')
  const [pdfContent, setPdfContent] = useState<string>('')
  const [isLoadingPdf, setIsLoadingPdf] = useState(true)
  const [pdfUrl, setPdfUrl] = useState<string>('')
  const [isLoadingPdfUrl, setIsLoadingPdfUrl] = useState(true)
  
  // 使用快捷模型选择
  const [quickModel, setQuickModel] = useState<string>('liquid/lfm-2.5-1.2b-instruct:free')
  
  // 将聊天消息状态提升到父组件，防止切换 tab 时丢失
  const [chatMessages, setChatMessages] = useState<Message[]>([])

  // 同步快捷模型
  const handleModelChange = useCallback((modelId: string) => {
    setQuickModel(modelId)
  }, [])

  // 获取（并缓存）PDF 的 signed URL，用于 iframe 加载
  useEffect(() => {
    let cancelled = false
    const loadSignedUrl = async () => {
      setIsLoadingPdfUrl(true)
      try {
        const key = getSignedUrlCacheKey(paper.id)
        const raw = localStorage.getItem(key)
        if (raw) {
          try {
            const cached = JSON.parse(raw) as CachedSignedUrl
            const stillValid =
              cached &&
              typeof cached.signedUrl === 'string' &&
              cached.signedUrl &&
              cached.file_url === pdfPath &&
              typeof cached.expiresAt === 'number' &&
              cached.expiresAt > Date.now() + 60_000 // 1min skew

            if (stillValid) {
              if (!cancelled) setPdfUrl(cached.signedUrl)
              return
            }
          } catch {
            // ignore bad cache
          }
        }

        const res = await fetch('/api/papers/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paperId: paper.id,
            expiresInSeconds: Math.floor(ONE_WEEK_MS / 1000),
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to get signed URL')
        }

        const data = (await res.json()) as { signedUrl?: string; expiresAt?: number; file_url?: string }
        if (!data?.signedUrl || typeof data.expiresAt !== 'number') {
          throw new Error('Invalid signed URL response')
        }

        const cached: CachedSignedUrl = {
          signedUrl: data.signedUrl,
          expiresAt: data.expiresAt,
          file_url: data.file_url || pdfPath,
        }

        localStorage.setItem(key, JSON.stringify(cached))
        if (!cancelled) setPdfUrl(data.signedUrl)
      } catch (e) {
        console.error('[PaperReader] signed url error:', e)
        if (!cancelled) setPdfUrl('')
      } finally {
        if (!cancelled) setIsLoadingPdfUrl(false)
      }
    }

    loadSignedUrl()
    return () => {
      cancelled = true
    }
  }, [paper.id, pdfPath])

  // 页面加载时提取 PDF 内容
  useEffect(() => {
    const extractPdfContent = async () => {
      setIsLoadingPdf(true)
      try {
        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperId: paper.id }),
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.text) {
            setPdfContent(data.text)
            console.log(`PDF 内容已提取: ${data.pages} 页, ${data.text.length} 字符`)
          }
        } else {
          console.error('PDF 提取失败')
        }
      } catch (error) {
        console.error('PDF 提取错误:', error)
      } finally {
        setIsLoadingPdf(false)
      }
    }

    extractPdfContent()
  }, [paper.id])

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* PDF Viewer */}
      <div className={cn(
        'flex-1 flex flex-col bg-zinc-900 transition-all duration-300',
        sidebarCollapsed ? 'mr-0' : 'mr-0'
      )}>
        {/* Header */}
        <div className="h-14 border-b border-zinc-800 px-4 flex items-center gap-3 shrink-0">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium text-zinc-200 truncate">
              {paper.title}
            </h1>
            {paper.authors && (
              <p className="text-xs text-zinc-500 truncate">
                {paper.authors}
              </p>
            )}
          </div>
          
          {/* 快捷模型选择器 */}
          <ModelSelector onModelChange={handleModelChange} />
          
          {/* PDF 内容加载状态 */}
          {isLoadingPdf && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              提取中...
            </div>
          )}
          {!isLoadingPdf && pdfContent && (
            <div className="text-xs text-emerald-500">
              ✓ 已加载
            </div>
          )}
        </div>

        {/* PDF Embed */}
        <div className="flex-1 bg-zinc-950 relative">
          {isLoadingPdfUrl ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-zinc-500">正在生成访问链接…</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
              title={paper.title}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-zinc-500">PDF 加载失败</p>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 z-10',
          'h-12 w-5 bg-zinc-800 hover:bg-zinc-700 rounded-l-md transition-all',
          'flex items-center justify-center text-zinc-400 hover:text-zinc-200',
          sidebarCollapsed ? 'right-0' : 'right-[420px]'
        )}
      >
        {sidebarCollapsed ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {/* AI Sidebar */}
      <div className={cn(
        'shrink-0 border-l border-zinc-800 bg-zinc-950 transition-all duration-300 overflow-hidden flex flex-col',
        sidebarCollapsed ? 'w-0' : 'w-[420px]'
      )}>
        {/* Tab Headers */}
        <div className="h-14 border-b border-zinc-800 px-4 flex items-center shrink-0">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('notes')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === 'notes' 
                  ? 'bg-zinc-800 text-zinc-100' 
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              笔记
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === 'chat' 
                  ? 'bg-zinc-800 text-zinc-100' 
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              对话
              {chatMessages.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-full">
                  {chatMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content - 使用 CSS 控制显示，不卸载组件 */}
        <div className="flex-1 overflow-hidden relative">
          {/* Notes Panel */}
          <div className={cn(
            'absolute inset-0',
            activeTab === 'notes' ? 'visible' : 'invisible'
          )}>
            <ScrollArea className="h-full">
              <NotesPanel paper={paper} existingNote={note} pdfContent={pdfContent} quickModel={quickModel} />
            </ScrollArea>
          </div>
          
          {/* Chat Panel */}
          <div className={cn(
            'absolute inset-0',
            activeTab === 'chat' ? 'visible' : 'invisible'
          )}>
            <ChatPanel 
              paper={paper} 
              pdfContent={pdfContent}
              messages={chatMessages}
              setMessages={setChatMessages}
              quickModel={quickModel}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
