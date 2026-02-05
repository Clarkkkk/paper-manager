import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'
import { extractTextFromPdfUrl, supportsHttpRange, withRetries } from '@/lib/pdf/pdfjs-url-text'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paperId } = await req.json()
    
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

    const paper = paperResult as { file_url: string } | null
    
    if (paperError || !paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    // 获取 PDF 文件的 signed URL
    const { data: signedUrlData } = await supabase.storage
      .from('papers')
      .createSignedUrl(paper.file_url, 60 * 5) // 5分钟有效

    if (!signedUrlData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to get PDF URL' }, { status: 500 })
    }

    const signedUrl = signedUrlData.signedUrl

    // Prefer Range-based parsing (lower peak memory). Fallback to full download when unsupported.
    const rangeSupported = await supportsHttpRange(signedUrl)
    const maxLength = 80000

    if (rangeSupported) {
      try {
        const { result, attempts } = await withRetries(
          async () => extractTextFromPdfUrl(signedUrl, { maxChars: maxLength }),
          3
        )

        let text = result.text
          .replace(/\s+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()

        if (text.length > maxLength) {
          text = text.slice(0, maxLength) + '\n\n[... 内容已截断，论文较长 ...]'
        } else if (result.truncated) {
          text = text + '\n\n[... 内容已截断，论文较长 ...]'
        }

        return NextResponse.json({
          text,
          pages: result.totalPages,
          _debug: {
            mode: 'range_pdfjs',
            attempts,
            rangeSupported: true,
            pagesScanned: result.pagesScanned,
            truncated: result.truncated,
          },
        })
      } catch (e) {
        console.warn('[parse-pdf] Range parsing failed, falling back:', e)
      }
    }

    // Fallback: download full PDF then parse with unpdf (existing behavior)
    const pdfResponse = await fetch(signedUrl)
    const pdfBuffer = await pdfResponse.arrayBuffer()

    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer))
    const { text: pdfText, totalPages } = await extractText(pdf, { mergePages: true })

    let fullText = typeof pdfText === 'string' ? pdfText : (pdfText as string[]).join('\n')
    fullText = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (fullText.length > maxLength) {
      fullText = fullText.slice(0, maxLength) + '\n\n[... 内容已截断，论文较长 ...]'
    }

    return NextResponse.json({
      text: fullText,
      pages: totalPages,
      _debug: {
        mode: 'full_unpdf',
        attempts: rangeSupported ? 3 : 0,
        rangeSupported,
      },
    })
    
  } catch (error) {
    console.error('PDF parse error:', error)
    return NextResponse.json({ 
      error: 'Failed to parse PDF',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
