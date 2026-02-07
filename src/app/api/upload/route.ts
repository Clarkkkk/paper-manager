import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { extractMetadataFromBuffer } from '@/lib/pdf/metadata'
import { sanitizeStorageObjectName } from '@/lib/storage/sanitize-object-name'

export const runtime = 'nodejs'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableUploadError(error: any): boolean {
  const msg = String(error?.message || '')
  const orig = error?.originalError
  const cause = orig?.cause
  const causeCode = String(cause?.code || '')

  // Undici socket reset / remote closed
  if (causeCode === 'UND_ERR_SOCKET') return true
  // Generic fetch failure
  if (msg.includes('fetch failed')) return true

  return false
}

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
    const { sanitized: sanitizedName, changed: nameChanged } = sanitizeStorageObjectName(file.name)
    const filePath = `${user.id}/${timestamp}-${sanitizedName}`
    if (nameChanged) {
      console.log('[Upload] Original filename sanitized for storage:', {
        original: file.name,
        sanitized: sanitizedName,
      })
    }

    const arrayBuffer = await file.arrayBuffer()
    // Create a complete copy of the buffer BEFORE parallel processing
    // This prevents "detached ArrayBuffer" errors during concurrent access
    const uint8Array = new Uint8Array(new Uint8Array(arrayBuffer))
    const fileBuffer = Buffer.from(uint8Array) // copy from stable buffer

    // Upload first (retries for transient network/socket errors), then extract metadata.
    let uploadResult: any
    let lastUploadError: any

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Upload] Starting Supabase upload... attempt=${attempt}`)
        const { data, error } = await supabase.storage
          .from('papers')
          .upload(filePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: false,
          })

        if (error) {
          console.error('[Upload] Supabase upload error:', error)
          throw error
        }

        console.log('[Upload] Supabase upload successful:', data)
        uploadResult = data
        lastUploadError = null
        break
      } catch (e: any) {
        lastUploadError = e
        const retryable = isRetryableUploadError(e)
        console.error(`[Upload] Upload failed attempt=${attempt}, retryable=${retryable}`, e)
        if (!retryable || attempt === 3) break
        await sleep(250 * Math.pow(2, attempt - 1))
      }
    }

    if (!uploadResult) {
      throw new Error(`Upload process failed: ${lastUploadError?.message || lastUploadError || 'unknown_error'}`)
    }

    console.log('[Upload] Starting metadata extraction...')
    let metadataResult: any
    try {
      metadataResult = await extractMetadataFromBuffer(uint8Array, file.name)
      console.log('Metadata extraction result:', metadataResult._debug?.source)
    } catch (e) {
      console.error('Metadata extraction unexpected error:', e)
      metadataResult = {
        title: file.name.replace(/\.pdf$/i, ''),
        authors: '',
        journal: '',
        keywords: '',
        _debug: {
          source: 'crash_fallback',
          needsAIRefinement: true,
          processingTimeMs: 0,
          fileSizeMB: 0,
          textLength: 0,
          truncated: false,
        },
      }
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
        abstract: metadataResult.abstract,
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
