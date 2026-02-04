import { createClient } from '@/lib/supabase/server'
import { UploadButton } from '@/components/dashboard/upload-button'
import { PapersView } from '@/components/dashboard/papers-view'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: papers } = await supabase
    .from('papers')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            我的论文库
          </h1>
          <p className="text-zinc-500 mt-1">
            上传论文，让 AI 帮你生成结构化笔记
          </p>
        </div>
        {papers && papers.length > 0 && <UploadButton />}
      </div>

      {/* Content */}
      <PapersView papers={papers || []} />
    </div>
  )
}
