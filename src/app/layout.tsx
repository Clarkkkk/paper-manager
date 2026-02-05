import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: 'MySciSpace - AI 论文阅读助手',
  description: '上传 PDF 论文，AI 自动生成结构化笔记，并支持基于论文内容的智能问答',
  keywords: ['论文', 'AI', '笔记', '学术', 'PDF', '问答'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
