type OpenAIEmbeddingResponse = {
  data?: Array<{
    embedding?: number[]
    index?: number
  }>
  error?: {
    message?: string
    type?: string
    code?: string | number
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function getEmbeddingConfig() {
  const baseURL = process.env.RAG_EMBEDDING_BASE_URL || 'https://openrouter.ai/api/v1'
  const apiKey = process.env.RAG_EMBEDDING_API_KEY || process.env.OPENROUTER_API_KEY || ''
  const model = process.env.RAG_EMBEDDING_MODEL || 'openai/text-embedding-3-small'
  const batchSize = Number(process.env.RAG_EMBEDDING_BATCH_SIZE || '32')
  return {
    baseURL,
    apiKey,
    model,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? Math.min(batchSize, 128) : 32,
  }
}

export function getRagEmbeddingModel() {
  return getEmbeddingConfig().model
}

async function requestEmbeddings(inputs: string[], attempt: number): Promise<number[][]> {
  const { baseURL, apiKey, model } = getEmbeddingConfig()
  if (!apiKey) {
    throw new Error('缺少 embeddings API Key：请设置 OPENROUTER_API_KEY 或 RAG_EMBEDDING_API_KEY')
  }

  const inputCount = inputs.length
  const res = await fetch(`${baseURL.replace(/\/+$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // Helpful metadata for OpenRouter
      'HTTP-Referer': 'https://myscispace.app',
      'X-Title': 'MySciSpace',
    },
    body: JSON.stringify({
      model,
      input: inputs,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < 4) {
      await sleep(300 * Math.pow(2, attempt - 1))
      return requestEmbeddings(inputs, attempt + 1)
    }
    throw new Error(`embeddings 请求失败: status=${res.status} body=${text.slice(0, 500)}`)
  }

  const json = (await res.json()) as OpenAIEmbeddingResponse
  const data = Array.isArray(json?.data) ? json.data : []
  const embeddings: number[][] = new Array(inputs.length)

  for (let i = 0; i < data.length; i++) {
    const item = data[i]
    const idx = typeof item?.index === 'number' ? item.index : i
    if (idx >= 0 && idx < inputs.length && Array.isArray(item?.embedding)) {
      embeddings[idx] = item.embedding as number[]
    }
  }

  const missing: number[] = []
  for (let i = 0; i < embeddings.length; i++) {
    if (!embeddings[i]) missing.push(i)
  }

  // Some providers may return fewer items even with 200 OK; treat as retryable.
  if (missing.length > 0) {
    console.warn(
      '[embeddings] missing items',
      JSON.stringify({
        attempt,
        model,
        baseURL,
        inputCount,
        returnedCount: data.length,
        missingCount: missing.length,
        missingIndexes: missing.slice(0, 12),
        hasErrorField: !!(json as any)?.error,
        errorMessage: (json as any)?.error?.message?.slice?.(0, 160),
      })
    )

    if (attempt < 4) {
      await sleep(300 * Math.pow(2, attempt - 1))
      return requestEmbeddings(inputs, attempt + 1)
    }

    // Last resort: try to fetch missing ones one-by-one to salvage partial failures.
    for (const idx of missing) {
      const single = await requestEmbeddings([inputs[idx]], 1)
      embeddings[idx] = single[0]
    }
  }

  return embeddings
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  const { batchSize } = getEmbeddingConfig()
  const out: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embs = await requestEmbeddings(batch, 1)
    out.push(...embs)
  }

  return out
}

export async function embedQuery(text: string): Promise<number[]> {
  const [emb] = await embedMany([text])
  return emb
}

