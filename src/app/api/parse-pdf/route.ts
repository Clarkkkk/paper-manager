import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'

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

    // 下载 PDF 文件
    const pdfResponse = await fetch(signedUrlData.signedUrl)
    const pdfBuffer = await pdfResponse.arrayBuffer()

    // 使用 unpdf 解析 PDF
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer))
    const { text: pdfText, totalPages } = await extractText(pdf, { mergePages: true })
    
    let fullText = typeof pdfText === 'string' ? pdfText : (pdfText as string[]).join('\n')
    
    // 清理文本
    fullText = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    // 限制文本长度（避免超出 AI 模型的 context window）
    const maxLength = 80000 // 约 20000 tokens
    if (fullText.length > maxLength) {
      fullText = fullText.slice(0, maxLength) + '\n\n[... 内容已截断，论文较长 ...]'
    }

    return NextResponse.json({ 
      text: fullText,
      pages: totalPages,
    })
    
  } catch (error) {
    console.error('PDF parse error:', error)
    return NextResponse.json({ 
      error: 'Failed to parse PDF',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
