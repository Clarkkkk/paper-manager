/**
 * 统一的 JSON 解析工具：\n
 * - 兼容模型输出的 ```json 代码围栏\n
 * - 尝试提取最大 `{...}` 片段再 parse\n
 */

export function stripCodeFences(text: string) {
  const t = String(text || '').trim()
  if (!t.startsWith('```')) return t
  const firstNl = t.indexOf('\n')
  const withoutFirst = firstNl !== -1 ? t.slice(firstNl + 1) : ''
  const lastFence = withoutFirst.lastIndexOf('```')
  return (lastFence !== -1 ? withoutFirst.slice(0, lastFence) : withoutFirst).trim()
}

export function safeJsonObject(text: string): unknown | null {
  const cleaned = stripCodeFences(text)

  // Fast path: parse whole content if it looks like JSON object.
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      return JSON.parse(cleaned)
    } catch {
      // fallthrough
    }
  }

  // Fallback: extract the largest {...} span.
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const candidate = cleaned.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

