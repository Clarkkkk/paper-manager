import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { extractMetadataFromBuffer } from '@/lib/pdf/metadata'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 })
    }

    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `${user.id}/${timestamp}-${sanitizedName}`

    const arrayBuffer = await file.arrayBuffer()
    // Create a complete copy of the buffer BEFORE parallel processing
    // This prevents "detached ArrayBuffer" errors during concurrent access
    const uint8Array = new Uint8Array(new Uint8Array(arrayBuffer))
    const fileBuffer = Buffer.from(new Uint8Array(arrayBuffer))

    // Run upload and metadata extraction in parallel
    let uploadResult, metadataResult;
    try {
      [uploadResult, metadataResult] = await Promise.all([
        (async () => {
          console.log('Starting Supabase upload...')
          const { data, error } = await supabase.storage
            .from('papers')
            .upload(filePath, fileBuffer, {
              contentType: 'application/pdf',
              upsert: false,
            })
          if (error) {
            console.error('Supabase upload error:', error)
            throw error
          }
          console.log('Supabase upload successful:', data)
          return data
        })(),
        (async () => {
          console.log('Starting metadata extraction...')
          try {
             const result = await extractMetadataFromBuffer(uint8Array, file.name)
             console.log('Metadata extraction result:', result._debug?.source)
             return result
          } catch (e) {
             console.error('Metadata extraction unexpected error:', e)
             // Return a safe fallback if extraction totally crashes
             return {
                title: file.name.replace(/\.pdf$/i, ''),
                authors: '',
                journal: '',
                keywords: '',
                _debug: { source: 'crash_fallback', needsAIRefinement: true, processingTimeMs: 0, fileSizeMB: 0, textLength: 0, truncated: false }
             }
          }
        })(),
      ])
    } catch (innerError: any) {
      console.error('Parallel execution failed:', innerError)
      // Determine if it was upload or metadata (though metadata catches itself mostly)
      throw new Error(`Upload process failed: ${innerError.message || innerError}`)
    }

    const { data: signedUrlData } = await supabase.storage
      .from('papers')
      .createSignedUrl(uploadResult.path, 60 * 60 * 24 * 7)

    return NextResponse.json({
      file_url: uploadResult.path,
      file_name: file.name,
      file_size: file.size,
      signed_url: signedUrlData?.signedUrl,
      metadata: {
        title: metadataResult.title,
        authors: metadataResult.authors,
        journal: metadataResult.journal,
        keywords: metadataResult.keywords,
      },
      _debug: metadataResult._debug,
    })

  } catch (error: any) {
    console.error('Upload error details:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error.message || error}` },
      { status: 500 }
    )
  }
}
