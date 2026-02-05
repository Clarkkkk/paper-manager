import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface PdfUrlExtractOptions {
  maxPages?: number
  maxChars?: number
  rangeChunkSize?: number
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
export async function supportsHttpRange(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-0',
        // Avoid gzip/brotli since Range on compressed responses is tricky.
        'Accept-Encoding': 'identity',
      },
    })

    return res.status === 206
  } catch {
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
  const maxPages = opts.maxPages ?? 5_000
  const maxChars = opts.maxChars ?? 80_000
  const rangeChunkSize = opts.rangeChunkSize ?? 256 * 1024

  // PDF.js worker is not available in this server context.
  ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = undefined

  const loadingTask = (pdfjsLib as any).getDocument({
    url,
    disableWorker: true,
    rangeChunkSize,
    // Reduce noise for partially-loaded documents; we handle errors higher up.
    stopAtErrors: false,
  })

  try {
    const pdf = await loadingTask.promise
    const totalPages: number = pdf.numPages || 0

    const pagesToScan = Math.min(totalPages, maxPages)
    const parts: string[] = []
    let pagesScanned = 0
    let chars = 0
    let truncated = false

    for (let i = 1; i <= pagesToScan; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = (content.items || [])
        .map((item: any) => (item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (pageText) {
        parts.push(pageText)
        chars += pageText.length + 2
      }

      pagesScanned = i

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

