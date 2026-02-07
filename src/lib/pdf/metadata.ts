import { getDocumentProxy } from 'unpdf'
import { getAIClient } from '@/lib/ai/openai'
import { generateText } from 'ai'
import { DOI_PREFIX_MAP, NORMALIZED_JOURNAL_MAP, COMMON_JOURNALS } from '@/data/journal-recognition'
import { ensurePdfjsWorker } from '@/lib/pdf/pdfjs-worker'
import { ensureDOMMatrix } from '@/lib/pdf/dommatrix-polyfill'

const MAX_EXTRACTED_TEXT_LENGTH = 50000
const AI_METADATA_TEXT_LENGTH = 3000
const MAX_PDF_SIZE = 50 * 1024 * 1024
const EXTRACTION_TIMEOUT_MS = 50000
const MAX_PAGES_TO_SCAN = 5

type PdfDocumentProxyLike = {
  numPages: number
  getMetadata: () => Promise<unknown>
  getPage: (pageNumber: number) => Promise<unknown>
}

type PdfjsModuleLike = {
  GlobalWorkerOptions?: {
    workerSrc?: unknown
  }
  getDocument: (params: {
    url: string
    disableWorker: boolean
    rangeChunkSize: number
    disableAutoFetch?: boolean
    stopAtErrors?: boolean
  }) => { promise: Promise<PdfDocumentProxyLike>; destroy: () => Promise<void> }
}

let pdfjsPromise: Promise<PdfjsModuleLike> | null = null
async function getPdfjs(): Promise<PdfjsModuleLike> {
  if (!pdfjsPromise) {
    ensureDOMMatrix()
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m as unknown as PdfjsModuleLike)
  }
  return pdfjsPromise
}

export interface AIDetectedMetadata {
  title: string
  authors: string
  journal: string
  keywords: string
}

export interface ExtractMetadataResult extends AIDetectedMetadata {
  _debug: {
    source: string
    needsAIRefinement: boolean
    processingTimeMs: number
    fileSizeMB: number
    textLength: number
    truncated: boolean
    pagesScanned?: number
    error?: string
  }
}

export async function extractMetadataFromBuffer(
  buffer: Uint8Array,
  fileName: string
): Promise<ExtractMetadataResult> {
  const startTime = Date.now()

  if (buffer.length > MAX_PDF_SIZE) {
    return {
      title: '',
      authors: '',
      journal: '',
      keywords: '',
      _debug: {
        source: 'size_exceeded',
        needsAIRefinement: true,
        processingTimeMs: Date.now() - startTime,
        fileSizeMB: buffer.length / 1024 / 1024,
        textLength: 0,
        truncated: false,
      }
    }
  }

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null

  try {
    pdf = await getDocumentProxy(buffer)
  } catch (error) {
    console.error('Failed to parse PDF:', error instanceof Error ? error.message : 'Unknown error')
    return createErrorResult('parse_failed', error, startTime, buffer.length)
  }

  const extractionPromise = performExtraction(pdf, fileName, buffer.length, startTime)
  const timeoutPromise = new Promise<ExtractMetadataResult>((_, reject) => {
    setTimeout(() => reject(new Error('Extraction timeout')), EXTRACTION_TIMEOUT_MS)
  })

  try {
    return await Promise.race([extractionPromise, timeoutPromise])
  } catch (error) {
    console.error('Extraction error:', error instanceof Error ? error.message : 'Unknown error')
    return createErrorResult('extraction_error', error, startTime, buffer.length)
  }
}

/**
 * Extract metadata from a PDF URL. When the server supports HTTP Range,
 * PDF.js will fetch only the required byte ranges internally.
 */
export async function extractMetadataFromUrl(
  url: string,
  fileName: string
): Promise<ExtractMetadataResult> {
  const startTime = Date.now()
  // File size is unknown here (we only have a URL). Keep it as 0 in debug.
  const fileSize = 0

  const pdfjsLib = await getPdfjs()
  // Even with disableWorker=true, PDF.js may attempt to set up a fake worker and requires workerSrc.
  ensurePdfjsWorker(pdfjsLib)
  const loadingTask = pdfjsLib.getDocument({
    url,
    disableWorker: true,
    rangeChunkSize: 1024 * 1024,
    disableAutoFetch: true,
    stopAtErrors: false,
  })

  try {
    const pdf = await loadingTask.promise

    const extractionPromise = performExtraction(pdf, fileName, fileSize, startTime)
    const timeoutPromise = new Promise<ExtractMetadataResult>((_, reject) => {
      setTimeout(() => reject(new Error('Extraction timeout')), EXTRACTION_TIMEOUT_MS)
    })

    try {
      return await Promise.race([extractionPromise, timeoutPromise])
    } catch (error) {
      console.error('Extraction error:', error instanceof Error ? error.message : 'Unknown error')
      return createErrorResult('extraction_error', error, startTime, fileSize)
    }
  } catch (error) {
    console.error('Failed to parse PDF:', error instanceof Error ? error.message : 'Unknown error')
    return createErrorResult('parse_failed', error, startTime, fileSize)
  } finally {
    try {
      await loadingTask.destroy()
    } catch {
      // ignore
    }
  }
}

async function performExtraction(
  pdf: PdfDocumentProxyLike,
  fileName: string,
  fileSize: number,
  startTime: number
): Promise<ExtractMetadataResult> {
  let rawMetadata: Record<string, unknown> = {}
  try {
    rawMetadata = (await pdf.getMetadata()) as Record<string, unknown> || {}
  } catch (metaError) {
    console.warn('Could not extract PDF metadata:', metaError)
  }

  let extractedText = ''
  let pagesScanned = 0
  try {
    const textResult = await extractTextFromFirstPages(pdf, MAX_PAGES_TO_SCAN)
    extractedText = textResult.text
    pagesScanned = textResult.pagesScanned
  } catch (textError) {
    console.warn('Text extraction failed:', textError)
  }

  const infoObj = rawMetadata.info as Record<string, string> | undefined
  const getValue = (key: string): string => {
    const keyLower = key.toLowerCase()
    const keyCap = key.charAt(0).toUpperCase() + key.slice(1)
    if (infoObj) {
      for (const k of [key, keyLower, keyCap]) {
        const val = infoObj[k]
        if (val && typeof val === 'string') return val
      }
    }
    for (const k of [key, keyLower, keyCap]) {
      const val = rawMetadata[k]
      if (val && typeof val === 'string') return val
    }
    return ''
  }

  const titleRaw = getValue('Title')
  const authorRaw = getValue('Author')
  const subjectRaw = getValue('Subject')

  const needsAIRefinement = shouldUseAIRefinement(titleRaw, authorRaw, subjectRaw, fileName)

  let finalTitle = titleRaw || fileName.replace(/\.pdf$/i, '')
  let finalAuthor = authorRaw || ''
  let finalJournal = ''
  let keywords = ''

  let processedText = extractedText
  if (extractedText.length > MAX_EXTRACTED_TEXT_LENGTH) {
    processedText = extractedText.substring(0, MAX_EXTRACTED_TEXT_LENGTH) + 
      '\n\n[... 内容已截断，论文较长 ...]'
  }

  if (needsAIRefinement) {
    console.log('Using AI for full metadata extraction...')
    const aiMetadata = await refineMetadataWithAI(extractedText, processedText)
    
    if (aiMetadata.title) {
      finalTitle = aiMetadata.title
      console.log('AI Title:', finalTitle)
    }
    if (aiMetadata.authors) {
      finalAuthor = aiMetadata.authors
      console.log('AI Authors:', finalAuthor)
    }
    if (aiMetadata.journal) {
      finalJournal = aiMetadata.journal
      console.log('AI Journal:', finalJournal)
    }
    keywords = aiMetadata.keywords
    console.log('AI Keywords:', keywords)
  } else {
    console.log('Using heuristic extraction...')
    
    const doi = extractDOI(subjectRaw)
    console.log('DOI:', doi)

    if (!looksLikeJournalName(finalTitle)) {
      finalTitle = extractTitleFromSubject(finalTitle, subjectRaw)
    }
    console.log('Heuristic Title:', finalTitle)

    finalJournal = extractJournalFromSubject(subjectRaw)
    if (!finalJournal) finalJournal = extractJournalFromDOI(doi)
    console.log('Journal:', finalJournal)

    console.log('Generating keywords with AI...')
    const keywordResult = await refineMetadataWithAI(extractedText, processedText, {
      title: finalTitle,
      journal: finalJournal
    })
    keywords = keywordResult.keywords || ''
    if (!keywords) {
      keywords = inferKeywordsFromTitle(finalTitle, finalJournal)
    }
    console.log('Keywords:', keywords)
  }

  const processingTime = Date.now() - startTime

  return {
    title: finalTitle,
    authors: finalAuthor,
    journal: finalJournal,
    keywords,
    _debug: {
      source: needsAIRefinement ? 'ai_metadata_refinement' : 'heuristic_with_ai_keywords',
      needsAIRefinement,
      processingTimeMs: processingTime,
      fileSizeMB: fileSize / 1024 / 1024,
      textLength: extractedText.length,
      truncated: extractedText.length > MAX_EXTRACTED_TEXT_LENGTH,
      pagesScanned,
    }
  }
}

async function extractTextFromFirstPages(
  pdf: PdfDocumentProxyLike,
  maxPages: number
): Promise<{ text: string; pagesScanned: number }> {
  const texts: string[] = []
  const numPages = pdf.numPages
  const pagesToScan = Math.min(numPages, maxPages)

  for (let i = 1; i <= pagesToScan; i++) {
    try {
      const page = (await pdf.getPage(i)) as { getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }
      const content = await page.getTextContent()
      const pageText = (content.items || [])
        .map((item) => (typeof item?.str === 'string' ? item.str : ''))
        .join(' ')
      texts.push(pageText)
    } catch (pageError) {
      console.warn(`Failed to extract text from page ${i}:`, pageError)
    }
  }

  return {
    text: texts.join('\n\n'),
    pagesScanned: texts.length
  }
}

function createErrorResult(
  source: string,
  error: unknown,
  startTime: number,
  fileSize: number
): ExtractMetadataResult {
  return {
    title: '',
    authors: '',
    journal: '',
    keywords: '',
    _debug: {
      source,
      needsAIRefinement: true,
      processingTimeMs: Date.now() - startTime,
      fileSizeMB: fileSize / 1024 / 1024,
      textLength: 0,
      truncated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

function extractJournalFromSubject(subject: string): string {
  if (!subject) return ''

  const normalizedSubject = subject.toUpperCase().replace(/[^\w\s&]/g, ' ').replace(/\s+/g, ' ').trim()
  const matches: { length: number; journal: string }[] = []

  for (const [normalized, journals] of Object.entries(NORMALIZED_JOURNAL_MAP)) {
    if (normalizedSubject.includes(normalized)) {
      matches.push({ length: normalized.length, journal: journals[0] })
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.length - a.length)
    return matches[0].journal
  }

  const elsevierMatch = subject.match(/^(The\s+)?([A-Z][A-Za-z\s&]+[A-Za-z]),?\s+\d+/)
  if (elsevierMatch) {
    const journalName = elsevierMatch[2].trim()
    if (!/^\d+$/.test(journalName) && journalName.length > 3) {
      const normalized = journalName.toUpperCase().replace(/[^\w\s&]/g, ' ').replace(/\s+/g, ' ').trim()
      for (const knownJournal of COMMON_JOURNALS) {
        if (knownJournal.toUpperCase().includes(normalized) || normalized.includes(knownJournal.toUpperCase())) {
          return knownJournal
        }
      }
      return journalName
    }
  }

  return ''
}

function extractJournalFromDOI(doi: string): string {
  if (!doi) return ''
  const doiLower = doi.toLowerCase()

  for (const [prefix, journal] of Object.entries(DOI_PREFIX_MAP)) {
    if (doiLower.includes(prefix.toLowerCase())) {
      return journal as string
    }
  }

  return ''
}

function extractDOI(subject: string): string {
  if (!subject) return ''
  const match = subject.match(/doi[:\s]*([^\s,]+)/i)
  return match ? match[1] : ''
}

function extractTitleFromSubject(title: string, subject: string): string {
  if (title.length >= 20 && !looksLikeJournalName(title)) {
    return title
  }

  const elsevierMatch = subject.match(/^(?:The\s+)?([A-Z][A-Za-z\s&]+[A-Za-z])\s+\d+[\s\d\-:]+(\d+)$/)
  if (elsevierMatch) {
    const potentialTitle = elsevierMatch[1].trim()
    if (!looksLikeJournalName(potentialTitle) && potentialTitle.length >= 10) {
      return potentialTitle
    }
  }

  const natureMatch = subject.match(/^([A-Z][a-z]+)\s+\d+[\s,]+[\d–-]+[\s(]+(\d{4})/)
  if (natureMatch) {
    return title
  }

  return title
}

function shouldUseAIRefinement(title: string, author: string, subject: string, fileName: string): boolean {
  const titleLooksBad = !title || 
    title.length < 10 || 
    /^[A-Z0-9]+$/.test(title) ||
    title.includes('grabs') ||
    title.toLowerCase() === fileName.toLowerCase().replace(/\.pdf$/i, '') ||
    looksLikeJournalName(title)
  
  const authorLooksBad = !author || 
    author.length < 3 ||
    author.toLowerCase() === fileName.toLowerCase().replace(/\.pdf$/i, '')
  
  const subjectLooksBad = !subject || subject.length < 5

  return titleLooksBad || authorLooksBad || subjectLooksBad
}

function looksLikeJournalName(text: string): boolean {
  if (!text || text.length < 10) return false
  
  const upper = text.toUpperCase()
  
  const journalPatterns = [
    /^(THE\s+)?[A-Z][A-Z\s&]+JOURNAL/i,
    /^(THE\s+)?[A-Z][A-Z\s&]+REVIEW/i,
    /^(THE\s+)?[A-Z][A-Z\s&]+REPORTS/i,
    /^(THE\s+)?[A-Z][A-Z\s&]+LETTERS/i,
    /^(THE\s+)?[A-Z][A-Z\s&]+PROCEEDINGS/i,
    /^(THE\s+)?[A-Z][A-Z\s&]+TRANSACTIONS/i,
    /^(THE\s+)?NATURE$/i,
    /^(THE\s+)?SCIENCE$/i,
    /^(THE\s+)?CELL$/i,
    /^[A-Z]+\s+\d+$/,
  ]

  for (const pattern of journalPatterns) {
    if (pattern.test(text)) {
      return true
    }
  }

  const journalIndicators = [
    'JOURNAL OF', 'REVIEW OF', 'ANNALS OF', 'PROCEEDINGS OF',
    'NATURE', 'SCIENCE', 'CELL', 'LANCET', 'BMJ', 'JAMA',
    'ONCOLOGY', 'PATHOLOGY', 'RADIOLOGY', 'MEDICINE',
  ]

  for (const indicator of journalIndicators) {
    if (upper.includes(indicator)) {
      if (upper.startsWith(indicator) || upper.length < 50) {
        return true
      }
    }
  }

  return false
}

function extractAbstractFromText(text: string): string {
  if (!text) return ''

  const abstractMatch = text.match(/(?:^|\n)Abstract\.?\s*\n([\s\S]{200,1000}?)(?:\n\n|\n[A-Z][a-z]+:)/i)
  if (abstractMatch) {
    return abstractMatch[1].trim()
  }

  const altMatch = text.match(/(?:^|\n)[A-Z][A-Za-z\s]+\n(?:Background|Objective|Methods|Results|Conclusions?)[\s\S]{0,500}/i)
  if (altMatch) {
    return altMatch[0].substring(0, 1000).trim()
  }

  if (text.length > 500) {
    return text.substring(0, 2000).trim()
  }

  return text.substring(0, 1500)
}

async function refineMetadataWithAI(
  extractedText: string,
  processedText: string,
  context?: { title?: string; journal?: string }
): Promise<AIDetectedMetadata> {
  try {
    const { client, model } = await getAIClient()

    const aiTextChunk = extractedText.substring(0, AI_METADATA_TEXT_LENGTH)
    const abstract = extractAbstractFromText(processedText)

    const prompt = `分析这篇学术论文，提取完整的元数据信息。

论文标题：${context?.title || '未知'}
期刊：${context?.journal || '未知'}

论文开头部分：
${aiTextChunk}

摘要：
${abstract.substring(0, 1500)}

请提取以下信息（如果是无效数据则返回空字符串）：
1. 论文的真实标题（不是文件名或期刊名）
2. 作者列表（多人用逗号分隔）
3. 期刊/会议名称
4. 3-5 个中文关键词

只返回 JSON 格式：
{
  "title": "论文的真实标题",
  "authors": "作者1, 作者2, 作者3",
  "journal": "期刊名称或会议名称",
  "keywords": "关键词1, 关键词2, 关键词3"
}`

    const result = await generateText({
      model: client(model),
      prompt,
      maxOutputTokens: 1000,
      temperature: 0.2,
    })

    console.log('AI model:', model)

    const match = result.text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (parsed.title || parsed.authors || parsed.journal || parsed.keywords) {
          return {
            title: parsed.title || '',
            authors: parsed.authors || '',
            journal: parsed.journal || '',
            keywords: parsed.keywords || ''
          }
        }
      } catch {
        console.warn('Failed to parse AI metadata JSON')
      }
    }

    return {
      title: '',
      authors: '',
      journal: '',
      keywords: ''
    }
  } catch (error) {
    console.error('AI metadata refinement failed:', error)
    return {
      title: '',
      authors: '',
      journal: '',
      keywords: ''
    }
  }
}

function inferKeywordsFromTitle(title: string, journal: string): string {
  const kws = new Set<string>()
  const t = (title + ' ' + journal).toLowerCase()

  const patterns: [string, ...string[]][] = [
    ['intelligence', '人工智能', '机器学习'],
    ['deep learning', '深度学习'],
    ['neural', '神经网络'],
    ['pathology', '病理学'],
    ['cancer', '癌症'],
    ['oncology', '肿瘤学'],
    ['breast', '乳腺癌'],
    ['gastric', '胃癌'],
    ['her2', 'HER2'],
    ['therapy', '治疗'],
    ['diagnosis', '诊断'],
    ['imaging', '医学影像'],
    ['multimodal', '多模态'],
    ['biomarker', '生物标志物'],
    ['immune', '免疫治疗'],
    ['checkpoint', '免疫检查点'],
  ]

  for (const [keyword, ...translations] of patterns) {
    if (t.includes(keyword)) {
      translations.forEach(k => kws.add(k))
    }
  }

  const list = Array.from(kws)
  if (list.length < 3) list.push('科学研究', '生物医学')
  return list.slice(0, 5).join(', ')
}