'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Uppy, { type UppyFile } from '@uppy/core'
import Tus from '@uppy/tus'
import { createClient } from '@/lib/supabase/client'

export type ResumableUploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export interface ResumableUploadState {
  status: ResumableUploadStatus
  percent: number | null
  error: string | null
}

type UploadMeta = {
  bucketName: string
  objectName: string
  contentType?: string
  cacheControl?: string
  metadata?: string
}

export interface UploadPdfParams {
  file: File
  bucketName: string
  objectName: string // path inside bucket, e.g. "<uid>/<ts>-name.pdf"
  contentType?: string
  cacheControl?: string
  metadata?: Record<string, unknown>
}

function getProjectIdFromSupabaseUrl(supabaseUrl: string): string | null {
  try {
    const url = new URL(supabaseUrl)
    const host = url.hostname
    // Typical: <project>.supabase.co
    if (host.endsWith('.supabase.co')) {
      return host.split('.')[0] || null
    }
    return null
  } catch {
    return null
  }
}

function getTusEndpoint(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const projectId = getProjectIdFromSupabaseUrl(supabaseUrl)
  // Supabase docs recommend using the direct storage hostname for TUS.
  if (projectId) {
    return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`
  }
  // Fallback: best-effort (may not work for custom domains).
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`
}

type TusPluginLike = {
  setOptions?: (opts: { headers?: Record<string, string> }) => void
}

export function useResumableUpload() {
  const [state, setState] = useState<ResumableUploadState>({
    status: 'idle',
    percent: null,
    error: null,
  })

  const uppy = useMemo(() => {
    return new Uppy<UploadMeta, Record<string, never>>({
      autoProceed: false,
      allowMultipleUploads: false,
      restrictions: {
        maxNumberOfFiles: 1,
      },
    })
  }, [])

  const resolverRef = useRef<{
    resolve: (value: { objectName: string }) => void
    reject: (err: Error) => void
  } | null>(null)

  useEffect(() => {
    const endpoint = getTusEndpoint()
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    uppy.use(Tus, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      allowedMetaFields: [
        'bucketName',
        'objectName',
        'contentType',
        'cacheControl',
        'metadata',
      ],
      // Headers will be set per-upload based on the current session.
      headers: {
        apikey: anonKey,
      },
    })

    const onProgress = (_file?: UppyFile<UploadMeta, Record<string, never>>, progress?: unknown) => {
      const p = progress as { bytesUploaded?: number; bytesTotal?: number } | undefined
      if (!p?.bytesTotal) {
        setState((s) => ({ ...s, percent: null }))
        return
      }
      const percent = ((p.bytesUploaded || 0) / p.bytesTotal) * 100
      setState((s) => ({ ...s, percent }))
    }

    const onSuccess = (file?: UppyFile<UploadMeta, Record<string, never>>) => {
      setState((s) => ({ ...s, status: 'success', error: null, percent: 100 }))
      const objectName = String(file?.meta?.objectName || '')
      resolverRef.current?.resolve({ objectName })
      resolverRef.current = null
    }

    const onError = (_file?: UppyFile<UploadMeta, Record<string, never>>, error?: unknown) => {
      const message =
        (typeof error === 'object' && error && 'message' in error && typeof (error as { message: unknown }).message === 'string')
          ? (error as { message: string }).message
          : '上传失败'
      const errObj = error instanceof Error ? error : new Error(message)
      setState((s) => ({ ...s, status: 'error', error: message }))
      resolverRef.current?.reject(errObj)
      resolverRef.current = null
    }

    uppy.on('upload-progress', onProgress)
    uppy.on('upload-success', onSuccess)
    uppy.on('upload-error', onError)

    return () => {
      uppy.off('upload-progress', onProgress)
      uppy.off('upload-success', onSuccess)
      uppy.off('upload-error', onError)
      uppy.destroy()
    }
  }, [uppy])

  const uploadPdf = async (params: UploadPdfParams): Promise<{ objectName: string }> => {
    const supabase = createClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session?.access_token) {
      throw new Error('登录状态异常，请重新登录')
    }

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonKey) {
      throw new Error('Supabase 环境变量未配置')
    }

    // Ensure Tus headers include the user's JWT.
    const tus = uppy.getPlugin('Tus') as unknown as TusPluginLike | undefined
    tus?.setOptions?.({
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
    })

    // Replace any existing file.
    uppy.cancelAll()
    uppy.getFiles().forEach((f) => {
      uppy.removeFile(f.id)
    })

    setState({ status: 'uploading', percent: 0, error: null })

    const contentType = params.contentType || params.file.type || 'application/pdf'
    uppy.addFile({
      name: params.file.name,
      type: contentType,
      data: params.file,
      meta: {
        bucketName: params.bucketName,
        objectName: params.objectName,
        contentType,
        cacheControl: params.cacheControl || '3600',
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
      },
    })

    return await new Promise<{ objectName: string }>((resolve, reject) => {
      resolverRef.current = { resolve, reject }
      uppy.upload().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : '上传失败'
        setState((s) => ({ ...s, status: 'error', error: message }))
        resolverRef.current?.reject(e instanceof Error ? e : new Error(message))
        resolverRef.current = null
      })
    })
  }

  const cancel = () => {
    uppy.cancelAll()
    setState({ status: 'idle', percent: null, error: null })
  }

  const reset = () => {
    setState({ status: 'idle', percent: null, error: null })
  }

  return {
    state,
    uploadPdf,
    cancel,
    reset,
  }
}

