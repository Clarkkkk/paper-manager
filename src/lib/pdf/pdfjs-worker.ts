const DEFAULT_WORKER_SRC = 'pdfjs-dist/legacy/build/pdf.worker.mjs'

type PdfjsLike = {
  GlobalWorkerOptions?: {
    workerSrc?: unknown
  }
}

let workerConfigured = false

/**
 * Ensure PDF.js has a valid `GlobalWorkerOptions.workerSrc` configured.
 *
 * Why:
 * - In Node.js, PDF.js runs in "fake worker" mode by default.
 * - Fake worker internally does a dynamic `import(workerSrc)`, and will throw if workerSrc is missing.
 * - In Next.js server bundling, resolving a filesystem path is unreliable. A bare module specifier works.
 */
export function ensurePdfjsWorker(pdfjs: PdfjsLike, workerSrc: string = DEFAULT_WORKER_SRC) {
  if (workerConfigured) return

  const gwo = pdfjs?.GlobalWorkerOptions
  if (!gwo) return

  // PDF.js requires workerSrc to be a usable specifier/string in fake-worker setup.
  // In Node.js, pdfjs-dist sets a *relative* default (`./pdf.worker.mjs`) which breaks in
  // Next/Turbopack server bundles because the import happens relative to the emitted chunk.
  const current = gwo.workerSrc
  const shouldOverride =
    typeof current !== 'string' ||
    !current ||
    current.startsWith('./') ||
    current.startsWith('../')

  if (shouldOverride) {
    gwo.workerSrc = workerSrc
  }

  workerConfigured = true
}

