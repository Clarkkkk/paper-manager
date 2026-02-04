/**
 * Generate journal recognition data from Excel file
 * Usage: npx tsx scripts/generate-journal-data.ts
 */

import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const EXCEL_PATH = '/Users/cai/Desktop/智能体/论文列表/期刊名称.xlsx'
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'data')

// Publisher DOI prefix patterns mapped to SPECIFIC journal names
const DOI_PREFIX_TO_JOURNAL: Record<string, string> = {
  // Nature specific journals
  's41591': 'Nature Medicine',
  's41597': 'Scientific Data',
  's41586': 'Nature',
  's41587': 'Nature Biotechnology',
  's41588': 'Nature Genetics',
  's41592': 'Nature Methods',
  's41593': 'Nature Ecology & Evolution',
  's41590': 'Nature Neuroscience',
  's41562': 'Nature Energy',
  's41560': 'Nature Materials',
  's41567': 'Nature Physics',
  's41570': 'Nature Astronomy',
  's41551': 'Nature Biomedical Engineering',
  's41565': 'Nature Nanotechnology',
  's41563': 'Nature Catalysis',
  's41564': 'Nature Chemistry',
  's41598': 'Scientific Reports',
  's41467': 'Nature Communications',
  's41559': 'Nature Cardiovascular Research',
  's41392': 'Signal Transduction and Targeted Therapy',

  // Cell specific journals
  'j.cell': 'Cell',
  'j.med': 'Cell',
  'j.thecell': 'Cell',
  'j.cancer': 'Cancer Cell',
  'j.stem': 'Cell Stem Cell',
  'j.mol': 'Molecular Cell',

  // Lancet specific journals
  'S2589-7500': 'Lancet Digital Health',
  'S1470-2045': 'Lancet Oncology',
  'S1472-8460': 'Lancet HIV',
  'S2213-8587': 'Lancet Global Health',
  'S0140-6736': 'Lancet',

  // Other publishers (generic fallback)
  '10.1126': 'Science',
  'science.': 'Science',
  '10.1056': 'New England Journal of Medicine',
  '10.1001': 'JAMA',
  '10.1136': 'BMJ',
  '10.1073': 'PNAS',
  '10.15252': 'EMBO Journal',
  '10.7554': 'eLife',
  '10.1109': 'IEEE',
  '10.1016': 'Elsevier Journal', // Generic Elsevier
  '10.1002': 'Wiley Journal',     // Generic Wiley
  '10.1038': 'Springer Journal',   // Generic Springer (also Nature)
  '10.1186': 'Springer Journal',
}

// Publisher patterns for fuzzy matching
const PUBLISHER_PATTERNS: Record<string, string[]> = {
  'Science': ['10.1126', 'science.'],
  'NEJM': ['10.1056'],
  'JAMA': ['10.1001'],
  'BMJ': ['10.1136'],
  'PNAS': ['10.1073'],
  'EMBO': ['10.15252'],
  'eLife': ['10.7554'],
  'Wiley': ['10.1002', '10.1111'],
  'Elsevier': ['10.1016', '10.2016', '10.3016'],
  'Springer': ['10.1007', '10.1038', '10.1186'],
  'IEEE': ['10.1109'],
  'ACS': ['10.1021'],
  'RSC': ['10.1039'],
}

// Common journal name variations for matching
function normalizeJournalName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^\w\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Convert to title case (e.g., "NATURE MEDICINE" -> "Nature Medicine")
// Keep acronyms like JAMA, MMWR, BMJ, PNAS, IEEE uppercase
function toTitleCase(name: string): string {
  const lowercaseWords = ['of', 'the', 'and', 'in', 'for', 'on', 'to', 'with', 'at', 'by', 'from', 'a', 'an']
  const acronyms = ['JAMA', 'MMWR', 'BMJ', 'PNAS', 'IEEE', 'ACS', 'RSC', 'EMBO', 'NEJM']

  return name
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      // Check if this word is an acronym (should be uppercase)
      const upperWord = word.toUpperCase()
      if (acronyms.includes(upperWord)) {
        return upperWord
      }
      // First word always capitalized
      if (i === 0 || !lowercaseWords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word
    })
    .join(' ')
    .replace(/&/g, '&')
}

// Extract keywords from journal name for matching
function extractKeywords(name: string): string[] {
  const normalized = normalizeJournalName(name)
  const words = normalized.split(' ').filter(w => w.length > 2)
  // Remove common words
  const stopWords = ['THE', 'AND', 'OF', 'JOURNAL', 'SCIENCE', 'MEDICINE', 'RESEARCH']
  return words.filter(w => !stopWords.includes(w))
}

function main() {
  console.log('Reading Excel file...')
  const workbook = XLSX.readFile(EXCEL_PATH)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]

  console.log(`Found ${data.length} rows`)

  // Extract journal names from column A
  const journals = data
    .map(row => row[0])
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)

  console.log(`Found ${journals.length} valid journal names`)

  // Build recognition data
  const journalRecognition: {
    normalizedNames: Record<string, string[]>
    keywordMap: Record<string, string[]>
    doiPrefixMap: Record<string, string>
  } = {
    normalizedNames: {},
    keywordMap: {},
    doiPrefixMap: {},
  }

  // Process each journal
  for (const journal of journals) {
    const normalized = normalizeJournalName(journal)
    const titleCaseName = toTitleCase(journal)
    const keywords = extractKeywords(journal)

    // Add to normalized names map (handle variations)
    const variations = [
      normalized,
      normalized.replace(/&/g, ' AND '),
      normalized.replace(/\s+/g, ' '),
    ]

    for (const variation of variations) {
      if (!journalRecognition.normalizedNames[variation]) {
        journalRecognition.normalizedNames[variation] = []
      }
      journalRecognition.normalizedNames[variation].push(titleCaseName)
    }

    // Add keywords for fuzzy matching
    for (const kw of keywords.slice(0, 5)) {
      if (!journalRecognition.keywordMap[kw]) {
        journalRecognition.keywordMap[kw] = []
      }
      if (!journalRecognition.keywordMap[kw].includes(titleCaseName)) {
        journalRecognition.keywordMap[kw].push(titleCaseName)
      }
    }
  }

  // Add DOI prefix mappings (specific journal names)
  for (const [prefix, journal] of Object.entries(DOI_PREFIX_TO_JOURNAL)) {
    journalRecognition.doiPrefixMap[prefix.toLowerCase()] = journal
  }

  // Generate TypeScript output
  const output = `/**
 * Auto-generated journal recognition data
 * Generated from ${journals.length} SCI journal names
 * Last updated: ${new Date().toISOString()}
 */

// DOI 前缀到期刊名的映射
export const DOI_PREFIX_MAP: Record<string, string> = {
${Object.entries(journalRecognition.doiPrefixMap)
  .map(([prefix, journal]) => `  '${prefix}': '${journal.replace(/'/g, "\\'")}'`)
  .join(',\n')}
}

// 期刊名规范化映射（用于精确匹配）
export const NORMALIZED_JOURNAL_MAP: Record<string, string[]> = {
${Object.entries(journalRecognition.normalizedNames)
  .slice(0, 1000) // Limit to prevent huge file
  .map(([name, journals]) => `  '${name.replace(/'/g, "\\'")}': ${JSON.stringify(journals)}`)
  .join(',\n')}
}

// 期刊关键词映射（用于模糊匹配）
export const JOURNAL_KEYWORD_MAP: Record<string, string[]> = {
${Object.entries(journalRecognition.keywordMap)
  .slice(0, 2000) // Limit to prevent huge file
  .map(([kw, journals]) => `  '${kw}': ${JSON.stringify(journals)}`)
  .join(',\n')}
}

// 常用期刊列表（按字母排序）
export const COMMON_JOURNALS: string[] = [
${journals.slice(0, 500).map(j => `  '${toTitleCase(j).replace(/'/g, "\\'")}'`).join(',\n')}
]

// 导出总期刊数
export const TOTAL_JOURNALS = ${journals.length}
`

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUTPUT_DIR, 'journal-recognition.ts'), output)

  console.log(`Generated journal-recognition.ts`)
  console.log(`- DOI prefixes: ${Object.keys(journalRecognition.doiPrefixMap).length}`)
  console.log(`- Normalized names: ${Object.keys(journalRecognition.normalizedNames).length}`)
  console.log(`- Keyword mappings: ${Object.keys(journalRecognition.keywordMap).length}`)
  console.log(`- Common journals: 500`)
}

main()
