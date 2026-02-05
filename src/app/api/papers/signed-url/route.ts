import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7

export async function POST(req: NextRequest) {
  try {
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
    const expiresInRaw = Number(body?.expiresInSeconds)
    const expiresInSeconds =
      Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? Math.min(expiresInRaw, ONE_WEEK_SECONDS) : ONE_WEEK_SECONDS

    if (!paperId) {
      return NextResponse.json({ error: 'paperId is required' }, { status: 400 })
    }

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

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('papers')
      .createSignedUrl(paper.file_url, expiresInSeconds)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 })
    }

    const expiresAt = Date.now() + expiresInSeconds * 1000

    return NextResponse.json({
      signedUrl: signedUrlData.signedUrl,
      expiresAt,
      file_url: paper.file_url,
    })
  } catch (error) {
    console.error('[signed-url] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

