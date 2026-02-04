import { NextRequest, NextResponse } from 'next/server'
import { extractMetadataFromBuffer } from '@/lib/pdf/metadata'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const contentType = req.headers.get('content-type') || ''

    // Case 1: JSON with file_url (uploaded to Supabase first)
    if (contentType.includes('application/json')) {
      const body = await req.json()

      if (body.file_url) {
        const supabase = await createClient()
        const { data, error } = await supabase.storage
          .from('papers')
          .download(body.file_url)

        if (error || !data) {
          return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 400 })
        }

        const arrayBuffer = await data.arrayBuffer()
        const buffer = new Uint8Array(arrayBuffer)
        const fileName = body.file_name || 'unknown.pdf'

        console.log('Processing from Supabase:', fileName, 'Size:', (buffer.length / 1024 / 1024).toFixed(2) + ' MB')

        const result = await extractMetadataFromBuffer(buffer, fileName)

        return NextResponse.json({
          title: result.title,
          authors: result.authors,
          journal: result.journal,
          keywords: result.keywords,
          _debug: result._debug,
        })
      }

      return NextResponse.json({ error: 'No file_url provided' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 })

  } catch (error: unknown) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error')

    return NextResponse.json({
      error: 'Failed to extract metadata',
      title: '',
      authors: '',
      keywords: '',
      journal: '',
      _debug: {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      }
    }, { status: 200 })
  }
}
