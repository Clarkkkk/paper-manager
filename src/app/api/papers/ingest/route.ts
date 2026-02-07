import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedMany, getRagEmbeddingModel } from '@/lib/ai/embeddings'
import { chunkPages, type PageText } from '@/lib/rag/chunking'
import { detectPaperLanguage } from '@/lib/rag/language'
import { ensurePdfjsWorker } from '@/lib/pdf/pdfjs-worker'
import { ensureDOMMatrix } from '@/lib/pdf/dommatrix-polyfill'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

type PdfjsModuleLike = {
  GlobalWorkerOptions?: { workerSrc?: unknown }
  getDocument: (params: {
    url: string
    disableWorker: boolean
    rangeChunkSize: number
    disableAutoFetch?: boolean
    stopAtErrors?: boolean
  }) => {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items?: Array<{ str?: string }> }> }> }>
    destroy: () => Promise<void>
  }
}

let pdfjsPromise: Promise<PdfjsModuleLike> | null = null
async function getPdfjs(): Promise<PdfjsModuleLike> {
  if (!pdfjsPromise) {
    ensureDOMMatrix()
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m as unknown as PdfjsModuleLike)
  }
  return pdfjsPromise
}

async function extractAllPagesText(url: string): Promise<PageText[]> {
  const pdfjs = await getPdfjs()
  ensurePdfjsWorker(pdfjs)

  const loadingTask = pdfjs.getDocument({
    url,
    disableWorker: true,
    rangeChunkSize: 1024 * 1024,
    disableAutoFetch: true,
    stopAtErrors: false,
  })

  try {
    const pdf = await loadingTask.promise
    const totalPages = pdf.numPages || 0
    const pages: PageText[] = []

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = (content.items || [])
        .map((it) => (it && typeof it.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      pages.push({ page: i, text })
    }

    return pages
  } finally {
    try {
      await loadingTask.destroy()
    } catch {
      // ignore
    }
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const supabaseAny = supabase as any

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const paperId = String(searchParams.get('paperId') || '')
  if (!paperId) {
    return NextResponse.json({ error: 'paperId is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAny
    .from('paper_ingestions')
    .select('*')
    .eq('paper_id', paperId)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ ingestion: null })
  }

  // 防御：如果函数异常退出/超时，status 可能永远停留在 running。
  // 这里对“长时间未更新的 running”做降级处理，避免 UI 永久显示构建中。
  try {
    const status = String(data?.status || '')
    const updatedAtRaw = data?.updated_at
    const updatedAtMs = updatedAtRaw ? new Date(String(updatedAtRaw)).getTime() : NaN
    // maxDuration=300s；给足缓冲，超过 10 分钟仍 running 基本可视为卡死/超时
    const STALE_MS = 10 * 60 * 1000
    const isStaleRunning = status === 'running' && Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > STALE_MS

    if (isStaleRunning) {
      const msg = `stale running: last update ${(Date.now() - updatedAtMs) / 1000}s ago`
      const { data: patched } = await supabaseAny
        .from('paper_ingestions')
        .update({
          status: 'failed',
          error: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('paper_id', paperId)
        .eq('user_id', user.id)
        .select('*')
        .single()

      return NextResponse.json({ ingestion: patched || data })
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ingestion: data })
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const supabase = await createClient()
  const supabaseAny = supabase as any

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const paperId = String(body?.paperId || '')
  const force = body?.force === true
  if (!paperId) {
    return NextResponse.json({ error: 'paperId is required' }, { status: 400 })
  }

  // Validate paper ownership + get file_url.
  const { data: paperResult, error: paperError } = await supabaseAny
    .from('papers')
    .select('file_url')
    .eq('id', paperId)
    .eq('user_id', user.id)
    .single()

  const paper = paperResult as { file_url: string } | null
  if (paperError || !paper?.file_url) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
  }

  const embeddingModel = getRagEmbeddingModel()

  // If already succeeded with same model, return quickly.
  const { data: existingIngest } = await supabaseAny
    .from('paper_ingestions')
    .select('status, embedding_model, chunk_count')
    .eq('paper_id', paperId)
    .eq('user_id', user.id)
    .maybeSingle()

  const existing = existingIngest as { status?: string; embedding_model?: string; chunk_count?: number } | null
  if (!force && existing?.status === 'succeeded' && existing.embedding_model === embeddingModel) {
    return NextResponse.json({ ok: true, status: 'succeeded', chunkCount: existing.chunk_count || 0 })
  }
  // 如果已有记录长时间 running，视为卡死，允许继续走本次 ingest 覆盖状态
  //（不在这里强制失败，后续会 upsert running 并重建）

  // Mark running (upsert).
  await supabaseAny.from('paper_ingestions').upsert(
    {
      paper_id: paperId,
      user_id: user.id,
      status: 'running',
      embedding_model: embeddingModel,
      language: null,
      error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'paper_id' }
  )

  // Clear previous chunks to avoid stale data when re-ingesting.
  await supabaseAny.from('paper_chunks').delete().eq('paper_id', paperId).eq('user_id', user.id)

  try {
    // Signed URL for range-capable parsing.
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('papers')
      .createSignedUrl(paper.file_url, 60 * 30) // 30 minutes

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error('Failed to get signed URL')
    }

    const pages = await extractAllPagesText(signedUrlData.signedUrl)
    const langSample = pages
      .slice(0, 3)
      .map((p) => p.text)
      .join('\n\n')
    const language = detectPaperLanguage(langSample)

    const chunks = chunkPages(pages, {
      chunkSizeChars: Number(process.env.RAG_CHUNK_SIZE_CHARS || '2000') || 2000,
      overlapChars: Number(process.env.RAG_CHUNK_OVERLAP_CHARS || '200') || 200,
    })

    const texts = chunks.map((c) => c.content)
    const embeddings = await embedMany(texts)

    const rows = chunks.map((c, i) => ({
      paper_id: paperId,
      user_id: user.id,
      chunk_index: c.chunk_index,
      page_start: c.page_start,
      page_end: c.page_end,
      content: c.content,
      embedding: embeddings[i],
    }))

    // Batch upsert to avoid payload limits.
    const batchSize = 200
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      await supabaseAny.from('paper_chunks').upsert(batch, { onConflict: 'paper_id,chunk_index' })
    }

    await supabaseAny.from('paper_ingestions').upsert(
      {
        paper_id: paperId,
        user_id: user.id,
        status: 'succeeded',
        embedding_model: embeddingModel,
        chunk_count: rows.length,
        language,
        error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'paper_id' }
    )

    return NextResponse.json({
      ok: true,
      status: 'succeeded',
      chunkCount: rows.length,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabaseAny.from('paper_ingestions').upsert(
      {
        paper_id: paperId,
        user_id: user.id,
        status: 'failed',
        embedding_model: embeddingModel,
        error: msg,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'paper_id' }
    )

    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        error: msg,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    )
  }
}

