'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileText, Copy, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Paper } from '@/types/database'

interface ExportNotesProps {
  paper: Paper
  noteContent: string
}

export function ExportNotes({ paper, noteContent }: ExportNotesProps) {
  const [copying, setCopying] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 生成完整的 Markdown 内容
  const generateMarkdown = () => {
    const date = new Date().toLocaleDateString('zh-CN')
    return `# ${paper.title}

${paper.authors ? `**作者**: ${paper.authors}\n` : ''}
**生成日期**: ${date}

---

${noteContent}

---

*由 MySciSpace AI 自动生成*
`
  }

  // 复制到剪贴板
  const handleCopy = async () => {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(generateMarkdown())
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败')
    } finally {
      setTimeout(() => setCopying(false), 1500)
    }
  }

  // 下载为 Markdown 文件
  const handleDownloadMarkdown = () => {
    setExporting(true)
    try {
      const content = generateMarkdown()
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${sanitizeFilename(paper.title)}-notes.md`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('笔记已导出')
    } catch {
      toast.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  // 下载为 HTML（可打印为 PDF）
  const handleDownloadHtml = () => {
    setExporting(true)
    try {
      const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${paper.title} - Notes</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; color: #111; }
    h2 { font-size: 1.25rem; margin-top: 2rem; margin-bottom: 0.75rem; color: #059669; }
    h3 { font-size: 1rem; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #333; }
    p { margin-bottom: 1rem; color: #444; }
    ul { margin: 0.75rem 0; padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; color: #444; }
    strong { color: #222; }
    code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .footer { margin-top: 3rem; font-size: 0.75rem; color: #999; text-align: center; }
    @media print {
      body { padding: 20px; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(paper.title)}</h1>
  <p class="meta">
    ${paper.authors ? `<strong>作者:</strong> ${escapeHtml(paper.authors)}<br>` : ''}
    <strong>生成日期:</strong> ${new Date().toLocaleDateString('zh-CN')}
  </p>
  <hr>
  ${markdownToHtml(noteContent)}
  <hr>
  <p class="footer">由 MySciSpace AI 自动生成</p>
</body>
</html>`

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${sanitizeFilename(paper.title)}-notes.html`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('笔记已导出为 HTML（可用浏览器打印为 PDF）')
    } catch {
      toast.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  if (!noteContent) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
        <DropdownMenuItem 
          onClick={handleCopy}
          className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
        >
          {copying ? (
            <Check className="mr-2 h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          复制 Markdown
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleDownloadMarkdown}
          className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
        >
          <FileText className="mr-2 h-4 w-4" />
          下载 .md 文件
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleDownloadHtml}
          className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
        >
          <Download className="mr-2 h-4 w-4" />
          下载 HTML（可打印 PDF）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 辅助函数：清理文件名
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 100)
}

// 辅助函数：转义 HTML
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

// 简单的 Markdown 转 HTML
function markdownToHtml(md: string): string {
  return md
    // Headers
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Lists
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
    // Clean up
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hul])/g, '$1')
    .replace(/(<\/[hul].*?>)<\/p>/g, '$1')
}
