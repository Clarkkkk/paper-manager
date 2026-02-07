export type PaperLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | 'unknown'

function ratio(part: number, total: number) {
  if (!total) return 0
  return part / total
}

/**
 * Extremely lightweight language detector (heuristic).\n
 * We only need a coarse signal to guide query generation.\n
 */
export function detectPaperLanguage(text: string): PaperLanguage {
  const s = (text || '').slice(0, 8000)
  let total = 0
  let cjk = 0
  let hiraKata = 0
  let hangul = 0
  let latin = 0
  let cyrillic = 0
  let arabic = 0

  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    // Ignore whitespace/punctuation
    if (code <= 0x20) continue
    total++

    // CJK Unified Ideographs
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjk++
      continue
    }
    // Hiragana/Katakana
    if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) {
      hiraKata++
      continue
    }
    // Hangul
    if (code >= 0xac00 && code <= 0xd7af) {
      hangul++
      continue
    }
    // Cyrillic
    if (code >= 0x0400 && code <= 0x04ff) {
      cyrillic++
      continue
    }
    // Arabic
    if (code >= 0x0600 && code <= 0x06ff) {
      arabic++
      continue
    }
    // Latin letters
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      latin++
      continue
    }
  }

  const rCjk = ratio(cjk, total)
  const rJa = ratio(hiraKata, total)
  const rKo = ratio(hangul, total)
  const rRu = ratio(cyrillic, total)
  const rAr = ratio(arabic, total)
  const rLatin = ratio(latin, total)

  if (rJa > 0.08) return 'ja'
  if (rKo > 0.08) return 'ko'
  if (rRu > 0.08) return 'ru'
  if (rAr > 0.08) return 'ar'
  if (rCjk > 0.12) return 'zh'
  if (rLatin > 0.35) return 'en'
  return 'unknown'
}

export function languageLabel(lang: PaperLanguage) {
  switch (lang) {
    case 'zh':
      return '中文'
    case 'en':
      return '英文'
    case 'ja':
      return '日文'
    case 'ko':
      return '韩文'
    case 'ru':
      return '俄文'
    case 'ar':
      return '阿拉伯文'
    default:
      return '未知'
  }
}

