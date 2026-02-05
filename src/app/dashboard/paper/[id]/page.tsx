import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PaperReader } from '@/components/paper/reader'

interface PaperPageProps {
  params: Promise<{ id: string }>
}

export default async function PaperPage({ params }: PaperPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const supabaseAny = supabase as any

  // 获取论文信息
  const { data: paperResult, error } = await supabaseAny
    .from('papers')
    .select('*')
    .eq('id', id)
    .single()

  const paper = paperResult as any

  if (error || !paper) {
    notFound()
  }

  // 获取笔记（如果存在）
  const { data: note } = await supabaseAny
    .from('notes')
    .select('*')
    .eq('paper_id', id)
    .single()

  return (
    <PaperReader 
      paper={paper} 
      note={note} 
      pdfPath={paper.file_url} 
    />
  )
}
