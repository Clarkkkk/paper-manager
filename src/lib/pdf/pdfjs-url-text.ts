import { ensurePdfjsWorker } from '@/lib/pdf/pdfjs-worker'

type PdfjsModuleLike = {
  GlobalWorkerOptions: {
    workerSrc: string
  }
  getDocument: (params: {
    url: string
    disableWorker: boolean
    rangeChunkSize: number
    disableAutoFetch?: boolean
    stopAtErrors?: boolean
  }) => {
    promise: Promise<PdfDocumentProxyLike>
    destroy: () => Promise<void>
  }
}

type PdfTextItemLike = { str?: string }
type PdfPageProxyLike = {
  getTextContent: () => Promise<{ items?: PdfTextItemLike[] }>
}
type PdfDocumentProxyLike = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxyLike>
}

let pdfjsPromise: Promise<PdfjsModuleLike> | null = null

async function getPdfjs(): Promise<PdfjsModuleLike> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m as unknown as PdfjsModuleLike)
  }
  return pdfjsPromise
}

export interface PdfUrlExtractOptions {
  maxPages?: number
  maxChars?: number
  rangeChunkSize?: number
  /**
   * Optional label to enable/associate debug timing logs.
   * Logs are printed only when `true`.
   */
  debugLabel?: string
}

export interface PdfUrlExtractResult {
  text: string
  totalPages: number
  pagesScanned: number
  truncated: boolean
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Best-effort detection of HTTP Range support.
 * We try a 1-byte range request and look for HTTP 206.
 */
const rangeSupportCache = new Map<string, { value: boolean; expiresAt: number }>()
const RANGE_SUPPORT_TTL_MS = 2 * 60 * 1000

export async function supportsHttpRange(url: string): Promise<boolean> {
  const now = Date.now()
  // Signed URLs often change query params; Range support depends on the underlying object path/host.
  // Strip query string so cache is effective across signed-url refreshes.
  const cacheKey = url.split('?')[0]
  const cached = rangeSupportCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    console.log('[pdfjs-url-text]', JSON.stringify({ event: 'range_probe_cache_hit', ok: cached.value }))
    return cached.value
  }

  try {
    const t0 = Date.now()
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-0',
        // Avoid gzip/brotli since Range on compressed responses is tricky.
        'Accept-Encoding': 'identity',
      },
    })

    const ok = res.status === 206
    rangeSupportCache.set(cacheKey, { value: ok, expiresAt: Date.now() + RANGE_SUPPORT_TTL_MS })
    console.log(
      '[pdfjs-url-text]',
      JSON.stringify({
        event: 'range_probe',
        ms: Date.now() - t0,
        status: res.status,
        ok,
      })
    )
    return ok
  } catch {
    rangeSupportCache.set(cacheKey, { value: false, expiresAt: Date.now() + RANGE_SUPPORT_TTL_MS })
    return false
  }
}

/**
 * Extract text from a PDF URL using PDF.js. When the server supports Range,
 * PDF.js will request only the needed byte ranges internally.
 */
export async function extractTextFromPdfUrl(
  url: string,
  opts: PdfUrlExtractOptions = {}
): Promise<PdfUrlExtractResult> {
  const pdfjs = await getPdfjs()
  const debugEnabled = true
  const t0 = Date.now()
  const debug = (event: string, data?: Record<string, unknown>) => {
    if (!debugEnabled) return
    console.log(
      '[pdfjs-url-text]',
      JSON.stringify({
        label: opts.debugLabel || '',
        event,
        ms: Date.now() - t0,
        ...data,
      })
    )
  }

  const maxPages = opts.maxPages ?? 5_000
  const maxChars = opts.maxChars ?? 80_000
  // Larger chunks reduce HTTP request count/latency overhead.
  const rangeChunkSize = opts.rangeChunkSize ?? 1024 * 1024

  // Even with disableWorker=true, PDF.js may attempt to set up a fake worker and requires workerSrc.
  ensurePdfjsWorker(pdfjs)
  debug('worker_configured', { rangeChunkSize, maxPages, maxChars })

  const loadingTask = pdfjs.getDocument({
    url,
    disableWorker: true,
    rangeChunkSize,
    // Critical for performance: avoid background prefetch of the entire file.
    disableAutoFetch: true,
    // Reduce noise for partially-loaded documents; we handle errors higher up.
    stopAtErrors: false,
  })
  debug('getDocument_called')

  try {
    const tLoadStart = Date.now()
    const pdf = await loadingTask.promise
    debug('document_loaded', { loadMs: Date.now() - tLoadStart })
    const totalPages: number = pdf.numPages || 0

    const pagesToScan = Math.min(totalPages, maxPages)
    const parts: string[] = []
    let pagesScanned = 0
    let chars = 0
    let truncated = false
    let totalGetPageMs = 0
    let totalTextMs = 0

    for (let i = 1; i <= pagesToScan; i++) {
      const tPageStart = Date.now()
      const page = await pdf.getPage(i)
      totalGetPageMs += Date.now() - tPageStart

      const tTextStart = Date.now()
      const content = await page.getTextContent()
      totalTextMs += Date.now() - tTextStart

      const pageText = (content.items || [])
        .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (pageText) {
        parts.push(pageText)
        chars += pageText.length + 2
      }

      pagesScanned = i
      if (debugEnabled && (i === 1 || i === pagesToScan || i % 5 === 0)) {
        debug('page_scanned', { i, chars, pageTextLen: pageText.length })
      }

      if (chars >= maxChars) {
        truncated = true
        break
      }
    }

    let text = parts.join('\n\n')
    if (text.length > maxChars) {
      text = text.slice(0, maxChars)
      truncated = true
    }

    debug('done', {
      totalPages,
      pagesScanned,
      truncated,
      totalMs: Date.now() - t0,
      getPageMs: totalGetPageMs,
      getTextContentMs: totalTextMs,
      avgGetPageMs: pagesScanned ? Math.round((totalGetPageMs / pagesScanned) * 10) / 10 : 0,
      avgGetTextContentMs: pagesScanned ? Math.round((totalTextMs / pagesScanned) * 10) / 10 : 0,
    })

    return { text, totalPages, pagesScanned, truncated }
  } finally {
    try {
      await loadingTask.destroy()
    } catch {
      // ignore
    }
  }
}

/**
 * Retry helper for Range-based extraction: tries up to maxAttempts then throws last error.
 */
export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  maxAttempts: number = 3
): Promise<{ result: T; attempts: number }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn(attempt)
      return { result, attempts: attempt }
    } catch (e) {
      lastError = e
      if (attempt < maxAttempts) {
        await sleep(150 * Math.pow(2, attempt - 1))
      }
    }
  }
  throw lastError
}

