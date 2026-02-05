export interface SanitizedNameResult {
  sanitized: string
  changed: boolean
}

/**
 * Sanitize a user-provided filename for use as a Supabase Storage object name.
 *
 * Goals:
 * - remove/replace characters that can be rejected by Storage key validation
 * - keep `.pdf` extension (if present)
 * - keep names reasonably short to avoid downstream issues
 */
export function sanitizeStorageObjectName(inputName: string): SanitizedNameResult {
  const original = String(inputName || '')

  // Normalize to make diacritics predictable; non-ascii will still be replaced below.
  const normalized = original.normalize('NFKD')

  const lower = normalized.toLowerCase()
  const hasPdfExt = lower.endsWith('.pdf')
  const base = hasPdfExt ? normalized.slice(0, -4) : normalized

  // Allow ASCII letters/digits plus some safe separators. Replace everything else with `_`.
  // Note: Supabase dashboard rejects certain filenames; this keeps object keys conservative.
  let safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_')
  safeBase = safeBase.replace(/_+/g, '_').replace(/^[_\-.]+|[_\-.]+$/g, '')

  if (!safeBase) safeBase = 'file'

  // Keep names short (object key can be long, but very long names are painful).
  const MAX_BASE_LEN = 120
  if (safeBase.length > MAX_BASE_LEN) {
    safeBase = safeBase.slice(0, MAX_BASE_LEN).replace(/^[_\-.]+|[_\-.]+$/g, '')
    if (!safeBase) safeBase = 'file'
  }

  const sanitized = hasPdfExt ? `${safeBase}.pdf` : safeBase
  return { sanitized, changed: sanitized !== original }
}

