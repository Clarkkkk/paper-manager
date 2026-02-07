export type PageText = {
  page: number
  text: string
}

export type Chunk = {
  chunk_index: number
  page_start: number | null
  page_end: number | null
  content: string
}

export type ChunkingOptions = {
  chunkSizeChars?: number
  overlapChars?: number
}

/**
 * Simple character-based chunker for MVP.
 *
 * - Keeps stable `chunk_index` order
 * - Tracks page_start/page_end best-effort
 */
export function chunkPages(pages: PageText[], opts: ChunkingOptions = {}): Chunk[] {
  const chunkSizeChars = opts.chunkSizeChars ?? 2000
  const overlapChars = opts.overlapChars ?? 200

  const chunks: Chunk[] = []
  let buf = ''
  let bufPageStart: number | null = null
  let currentPage: number | null = null

  const pushChunk = (content: string, pageStart: number | null, pageEnd: number | null) => {
    const c = content.replace(/\s+/g, ' ').trim()
    if (!c) return
    chunks.push({
      chunk_index: chunks.length,
      page_start: pageStart,
      page_end: pageEnd,
      content: c,
    })
  }

  for (const p of pages) {
    const t = (p.text || '').trim()
    if (!t) continue

    if (bufPageStart == null) bufPageStart = p.page
    currentPage = p.page

    // Separate pages to avoid accidental word joins.
    buf += (buf ? '\n\n' : '') + t

    while (buf.length >= chunkSizeChars) {
      const content = buf.slice(0, chunkSizeChars)
      pushChunk(content, bufPageStart, currentPage)

      const overlap = Math.max(0, Math.min(overlapChars, chunkSizeChars))
      buf = overlap ? buf.slice(chunkSizeChars - overlap) : buf.slice(chunkSizeChars)
      // After cutting, we no longer know the exact start page; keep best-effort.
      bufPageStart = currentPage
    }
  }

  if (buf.trim()) {
    pushChunk(buf, bufPageStart, currentPage)
  }

  return chunks
}

