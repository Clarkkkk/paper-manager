import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'
import { extractTextFromPdfUrl, supportsHttpRange, withRetries } from '@/lib/pdf/pdfjs-url-text'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const requestId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

  // `timeline`: absolute timestamps (ms since request start)
  // `timings`: per-step durations (ms since previous mark)
  const timeline: Record<string, number> = {}
  const timings: Record<string, number> = {}
  // `spans`: additional raw durations (not step-based)
  const spans: Record<string, number> = {}
  let lastMarkAt = startedAt
  const mark = (name: string) => {
    const now = Date.now()
    timeline[name] = now - startedAt
    timings[name] = now - lastMarkAt
    lastMarkAt = now
  }

  console.log('[parse-pdf]', JSON.stringify({ requestId, event: 'start' }))

  try {
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    mark('auth_ms')
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const paperId = body?.paperId as string | undefined
    const warmCache = body?.warm_cache === true
    mark('parse_body_ms')
    
    if (!paperId) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    // 获取论文信息
    const { data: paperResult, error: paperError } = await supabaseAny
      .from('papers')
      .select('file_url')
      .eq('id', paperId)
      .eq('user_id', user.id)
      .single()
    mark('db_paper_ms')

    const paper = paperResult as { file_url: string } | null
    
    if (paperError || !paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    // Cache is stored in the same (private) bucket under the user's folder,
    // so it works with existing Storage RLS policies.
    const cachePath = `${user.id}/parsed/${paperId}.json`

    // 获取 PDF 文件的 signed URL
    const { data: signedUrlData } = await supabase.storage
      .from('papers')
      .createSignedUrl(paper.file_url, 60 * 5) // 5分钟有效
    mark('signed_url_ms')

    if (!signedUrlData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to get PDF URL' }, { status: 500 })
    }

    const signedUrl = signedUrlData.signedUrl

    // Prefer Range-based parsing (lower peak memory). Fallback to full download when unsupported.
    const rangeSupported = await supportsHttpRange(signedUrl)
    mark('range_probe_ms')
    const maxLength = Number(process.env.PDF_PARSE_MAX_CHARS || '30000')
    const maxPagesEnv = Number(process.env.PDF_PARSE_MAX_PAGES || '')
    const maxPages = Number.isFinite(maxPagesEnv) && maxPagesEnv > 0 ? maxPagesEnv : undefined

    // Try cache hit (best-effort).
    try {
      const cacheReadStart = Date.now()
      const { data: cacheBlob, error: cacheErr } = await supabase.storage.from('papers').download(cachePath)
      spans.cache_read_ms = Date.now() - cacheReadStart

      if (!cacheErr && cacheBlob) {
        const cacheText = await cacheBlob.text()
        const parsed = JSON.parse(cacheText) as {
          file_url?: string
          text?: string
          pages?: number
          truncated?: boolean
          maxChars?: number
          createdAt?: string
        }

        if (
          parsed?.file_url === paper.file_url &&
          typeof parsed.text === 'string' &&
          (typeof parsed.maxChars !== 'number' || parsed.maxChars >= maxLength)
        ) {
          const cachedText = parsed.text
          const text = cachedText.length > maxLength ? cachedText.slice(0, maxLength) : cachedText
          spans.total_ms = Date.now() - startedAt
          console.log(
            '[parse-pdf]',
            JSON.stringify({
              requestId,
              paperId,
              event: 'cache_hit',
              cachePath,
              timeline,
              timings,
              spans,
              pages: parsed.pages ?? 0,
              truncated: parsed.truncated ?? text.length >= maxLength,
            })
          )

          return NextResponse.json({
            ...(warmCache ? {} : { text }),
            pages: parsed.pages ?? 0,
            _debug: {
              mode: 'cache',
              rangeSupported,
              pagesScanned: 0,
              truncated: parsed.truncated ?? text.length >= maxLength,
              timeline,
              timings,
              spans,
              requestId,
              cache: { hit: true, path: cachePath },
            },
          })
        }
      }
    } catch (e) {
      console.warn('[parse-pdf] cache read failed:', e)
    }

    if (rangeSupported) {
      try {
        const rangeStart = Date.now()
        const { result, attempts } = await withRetries(
          async () =>
            extractTextFromPdfUrl(signedUrl, {
              maxChars: maxLength,
              ...(maxPages ? { maxPages } : {}),
              debugLabel: `parse-pdf:${requestId}`,
            }),
          3
        )
        spans.range_extract_ms = Date.now() - rangeStart

        let text = result.text
          .replace(/\s+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()

        if (text.length > maxLength) {
          text = text.slice(0, maxLength) + '\n\n[... 内容已截断，论文较长 ...]'
        } else if (result.truncated) {
          text = text + '\n\n[... 内容已截断，论文较长 ...]'
        }

        // Best-effort cache write.
        try {
          const cacheWriteStart = Date.now()
          const payload = {
            file_url: paper.file_url,
            text,
            pages: result.totalPages,
            truncated: result.truncated || text.length >= maxLength,
            maxChars: maxLength,
            createdAt: new Date().toISOString(),
          }
          await supabase.storage.from('papers').upload(
            cachePath,
            new Blob([JSON.stringify(payload)], { type: 'application/json' }),
            { upsert: true, contentType: 'application/json' }
          )
          spans.cache_write_ms = Date.now() - cacheWriteStart
        } catch (e) {
          console.warn('[parse-pdf] cache write failed:', e)
        }

        mark('total_ms')
        spans.total_ms = Date.now() - startedAt
        console.log(
          '[parse-pdf]',
          JSON.stringify({
            requestId,
            paperId,
            event: 'done_range',
            timeline,
            timings,
            spans,
            attempts,
            pagesScanned: result.pagesScanned,
            totalPages: result.totalPages,
            truncated: result.truncated,
          })
        )

        return NextResponse.json({
          ...(warmCache ? {} : { text }),
          pages: result.totalPages,
          _debug: {
            mode: 'range_pdfjs',
            attempts,
            rangeSupported: true,
            pagesScanned: result.pagesScanned,
            truncated: result.truncated,
            timeline,
            timings,
            spans,
            requestId,
            cache: { hit: false, path: cachePath, warmed: true },
          },
        })
      } catch (e) {
        console.warn('[parse-pdf] Range parsing failed, falling back:', e)
      }
    }

    // Fallback: download full PDF then parse with unpdf (existing behavior)
    const fetchStart = Date.now()
    const pdfResponse = await fetch(signedUrl)
    const pdfBuffer = await pdfResponse.arrayBuffer()
    spans.fallback_fetch_ms = Date.now() - fetchStart
    mark('fallback_fetch_done_ms')

    const unpdfStart = Date.now()
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer))
    const { text: pdfText, totalPages } = await extractText(pdf, { mergePages: true })
    spans.fallback_unpdf_ms = Date.now() - unpdfStart

    let fullText = typeof pdfText === 'string' ? pdfText : (pdfText as string[]).join('\n')
    fullText = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (fullText.length > maxLength) {
      fullText = fullText.slice(0, maxLength) + '\n\n[... 内容已截断，论文较长 ...]'
    }

    // Best-effort cache write for fallback path too.
    try {
      const cacheWriteStart = Date.now()
      const payload = {
        file_url: paper.file_url,
        text: fullText,
        pages: totalPages,
        truncated: fullText.length >= maxLength,
        maxChars: maxLength,
        createdAt: new Date().toISOString(),
      }
      await supabase.storage.from('papers').upload(
        cachePath,
        new Blob([JSON.stringify(payload)], { type: 'application/json' }),
        { upsert: true, contentType: 'application/json' }
      )
      spans.cache_write_ms = Date.now() - cacheWriteStart
    } catch (e) {
      console.warn('[parse-pdf] cache write failed:', e)
    }

    mark('total_ms')
    spans.total_ms = Date.now() - startedAt
    console.log(
      '[parse-pdf]',
      JSON.stringify({
        requestId,
        paperId,
        event: 'done_fallback',
        timeline,
        timings,
        spans,
        totalPages,
      })
    )

    return NextResponse.json({
      ...(warmCache ? {} : { text: fullText }),
      pages: totalPages,
      _debug: {
        mode: 'full_unpdf',
        attempts: rangeSupported ? 3 : 0,
        rangeSupported,
        timeline,
        timings,
        spans,
        requestId,
        cache: { hit: false, path: cachePath, warmed: true },
      },
    })
    
  } catch (error) {
    console.error('PDF parse error:', error)
    console.log(
      '[parse-pdf]',
      JSON.stringify({
        requestId,
        event: 'error',
        timeline,
        spans,
        timings: { ...timings, total_ms: Date.now() - startedAt },
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    )
    return NextResponse.json({ 
      error: 'Failed to parse PDF',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
