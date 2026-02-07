import { NextRequest, NextResponse } from 'next/server'
import { FREE_MODELS } from '@/lib/ai/config'
import { createClient } from '@/lib/supabase/server'

// 从各提供商 API 获取最新模型列表
export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, baseUrl, includeModelId } = await req.json()

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    let models: Array<{ id: string; name: string; description?: string }> = []

    // 系统默认只返回免费模型
    if (provider === 'system') {
      return NextResponse.json({ models: FREE_MODELS })
    }

    // 尝试从数据库读取用户已保存的 key（不向客户端返回，仅用于服务端拉取模型列表）
    // 这样即使前端不回填 key（为安全），刷新后仍能拿到完整模型列表，避免选择被回退到免费模型。
    let resolvedKey: string | undefined = typeof apiKey === 'string' && apiKey ? apiKey : undefined
    let resolvedBaseUrl: string | undefined = typeof baseUrl === 'string' && baseUrl ? baseUrl : undefined
    let resolvedIncludeModelId: string | undefined =
      typeof includeModelId === 'string' && includeModelId ? includeModelId : undefined

    const logMeta: Record<string, unknown> = {
      provider,
      hasBodyKey: !!resolvedKey,
      hasBodyBaseUrl: !!resolvedBaseUrl,
      includeModelId: resolvedIncludeModelId || null,
    }
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('openai_api_key, api_base_url, preferred_model')
          .eq('id', user.id)
          .single()

        const profileAny = profile as any
        const profileKey = typeof profileAny?.openai_api_key === 'string' ? profileAny.openai_api_key : undefined
        const profileBaseUrl = typeof profileAny?.api_base_url === 'string' ? profileAny.api_base_url : undefined
        const profilePreferredModel =
          typeof profileAny?.preferred_model === 'string' ? profileAny.preferred_model : undefined

        if (!resolvedKey && profileKey && !profileKey.includes('*')) {
          resolvedKey = profileKey
        }
        if (!resolvedBaseUrl && profileBaseUrl) {
          resolvedBaseUrl = profileBaseUrl
        }
        if (!resolvedIncludeModelId && profilePreferredModel) {
          resolvedIncludeModelId = profilePreferredModel
        }

        logMeta.hasProfileKey = !!profileKey && !String(profileKey).includes('*')
        logMeta.hasProfileBaseUrl = !!profileBaseUrl
        logMeta.profilePreferredModel = profilePreferredModel || null
      }
    } catch {
      // ignore (fall back to env/defaults)
    }

    console.log('[models]', JSON.stringify(logMeta))

    switch (provider) {
      case 'openai':
        models = await fetchOpenAIModels(resolvedKey, resolvedBaseUrl)
        break
      case 'google':
        models = await fetchGoogleModels(resolvedKey, resolvedBaseUrl)
        break
      case 'openrouter':
        // 如果 resolvedKey 可用，则可获取完整（含付费）模型列表
        models = await fetchOpenRouterModels(resolvedKey, false, resolvedIncludeModelId)
        break
      default:
        // 自定义提供商返回空列表
        models = []
    }

    console.log(
      '[models]',
      JSON.stringify({
        provider,
        returned: models.length,
        hasIncludedModel: resolvedIncludeModelId ? models.some((m) => m.id === resolvedIncludeModelId) : null,
        head: models.slice(0, 5).map((m) => m.id),
      })
    )

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Fetch models error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 }
    )
  }
}

// OpenAI 模型列表
async function fetchOpenAIModels(apiKey?: string, baseUrl?: string) {
  const key = apiKey || process.env.SYSTEM_OPENAI_API_KEY
  if (!key) return getDefaultOpenAIModels()

  try {
    const res = await fetch(`${baseUrl || 'https://api.openai.com/v1'}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    
    if (!res.ok) return getDefaultOpenAIModels()
    
    const data = await res.json()
    const models = data.data || []
    
    // 过滤出聊天模型
    const chatModels = models
      .filter((m: { id: string }) => 
        m.id.includes('gpt') || 
        m.id.includes('o1') || 
        m.id.includes('o3') ||
        m.id.includes('chatgpt')
      )
      .map((m: { id: string }) => ({
        id: m.id,
        name: formatModelName(m.id),
        description: getModelDescription(m.id),
      }))
      .sort((a: { id: string }, b: { id: string }) => {
        // 按版本号排序，最新的在前
        const priority = ['o3', 'o1', 'gpt-5', 'gpt-4', 'gpt-3.5']
        for (const p of priority) {
          if (a.id.includes(p) && !b.id.includes(p)) return -1
          if (!a.id.includes(p) && b.id.includes(p)) return 1
        }
        return b.id.localeCompare(a.id)
      })

    return chatModels.length > 0 ? chatModels : getDefaultOpenAIModels()
  } catch {
    return getDefaultOpenAIModels()
  }
}

// Google Gemini 模型列表
async function fetchGoogleModels(apiKey?: string, baseUrl?: string) {
  const key = apiKey || process.env.GOOGLE_API_KEY
  if (!key) return getDefaultGoogleModels()

  try {
    const apiBase = baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    const res = await fetch(`${apiBase}/models?key=${key}`)
    
    if (!res.ok) return getDefaultGoogleModels()
    
    const data = await res.json()
    const models = data.models || []
    
    // 过滤出 Gemini 模型
    const geminiModels = models
      .filter((m: { name: string; supportedGenerationMethods?: string[] }) => 
        m.name.includes('gemini') && 
        m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m: { name: string; displayName?: string; description?: string }) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || formatModelName(m.name.replace('models/', '')),
        description: m.description?.slice(0, 50) || '',
      }))
      .sort((a: { id: string }, b: { id: string }) => {
        // 按版本排序
        const priority = ['2.5', '2.0', '1.5', '1.0']
        for (const p of priority) {
          if (a.id.includes(p) && !b.id.includes(p)) return -1
          if (!a.id.includes(p) && b.id.includes(p)) return 1
        }
        return b.id.localeCompare(a.id)
      })

    return geminiModels.length > 0 ? geminiModels : getDefaultGoogleModels()
  } catch {
    return getDefaultGoogleModels()
  }
}

// OpenRouter 模型列表
async function fetchOpenRouterModels(apiKey?: string, freeOnly: boolean = false, includeModelId?: string) {
  try {
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://myscispace.app',
      'X-Title': 'MySciSpace',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', { headers })

    console.log(
      '[models][openrouter]',
      JSON.stringify({
        ok: res.ok,
        status: res.status,
        hasAuth: !!apiKey,
        includeModelId: includeModelId || null,
        freeOnly,
      })
    )
    
    if (!res.ok) return freeOnly ? FREE_MODELS : getDefaultOpenRouterModels()
    
    const data: unknown = await res.json()
    const modelsRaw: unknown = (data as { data?: unknown } | null)?.data
    const models = Array.isArray(modelsRaw) ? (modelsRaw as Array<Record<string, unknown>>) : []
    
    // 如果只需要免费模型
    if (freeOnly) {
      const freeModels = models
        .map((m) => {
          const id = typeof m.id === 'string' ? m.id : ''
          if (!id) return null
          const pricing = (m.pricing && typeof m.pricing === 'object' ? (m.pricing as Record<string, unknown>) : null) || null
          const promptPrice = pricing && typeof pricing.prompt === 'string' ? pricing.prompt : undefined
          const isFree = promptPrice === '0' || id.endsWith(':free')
          if (!isFree) return null
          const name = typeof m.name === 'string' && m.name ? m.name : formatModelName(id)
          return { id, name, description: '免费' }
        })
        .filter((x): x is { id: string; name: string; description: string } => Boolean(x))
        .slice(0, 50)
      
      return freeModels.length > 0 ? freeModels : FREE_MODELS
    }
    
    // 返回所有模型，按流行度排序（为了 UI 体验限制数量）。
    // 但要保证 includeModelId（如用户已保存的 preferred_model）在列表里，避免刷新后选中项被回退到第一个（常见是免费）。
    const all = models
      .map((m) => {
        const id = typeof m.id === 'string' ? m.id : ''
        const name = typeof m.name === 'string' && m.name ? m.name : id ? formatModelName(id) : ''
        const descriptionRaw = typeof m.description === 'string' ? m.description : ''
        const pricing = (m.pricing && typeof m.pricing === 'object' ? (m.pricing as Record<string, unknown>) : null) || null
        const promptPrice = pricing && typeof pricing.prompt === 'string' ? pricing.prompt : undefined
        const description = promptPrice === '0' || id.endsWith(':free') ? '免费' : (descriptionRaw.slice(0, 30) || '')
        return id ? { id, name, description } : null
      })
      .filter((x): x is { id: string; name: string; description: string } => Boolean(x))

    const include = includeModelId ? all.find((m) => m.id === includeModelId) : undefined
    // Return full list for client-side filtering/search.
    // Client will still only render a small window (e.g. first 100 after filtering) for UX/perf.
    if (includeModelId && !all.some((m) => m.id === includeModelId)) {
      return include
        ? [include, ...all]
        : [{ id: includeModelId, name: includeModelId, description: '' }, ...all]
    }
    return all
  } catch {
    return freeOnly ? FREE_MODELS : getDefaultOpenRouterModels()
  }
}

// 格式化模型名称
function formatModelName(id: string): string {
  return id
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/Gpt/g, 'GPT')
    .replace(/4o/g, '4o')
}

// 获取模型描述
function getModelDescription(id: string): string {
  if (id.includes('o3')) return '最新推理模型'
  if (id.includes('o1')) return '推理优化'
  if (id.includes('gpt-5')) return '最新一代'
  if (id.includes('gpt-4o')) return '多模态旗舰'
  if (id.includes('gpt-4-turbo')) return '高性能'
  if (id.includes('gpt-4')) return '强大'
  if (id.includes('gpt-3.5')) return '快速经济'
  return ''
}

// 默认模型列表（API 调用失败时使用）
function getDefaultOpenAIModels() {
  return [
    { id: 'gpt-5', name: 'GPT-5', description: '最新一代' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: '轻量版' },
    { id: 'o3-mini', name: 'o3-mini', description: '最新推理' },
    { id: 'o1', name: 'o1', description: '推理优化' },
    { id: 'o1-mini', name: 'o1-mini', description: '推理轻量' },
    { id: 'gpt-4o', name: 'GPT-4o', description: '多模态旗舰' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '快速实惠' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '高性能' },
    { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', description: '最新版' },
  ]
}

function getDefaultGoogleModels() {
  return [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '最强大' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '快速' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '高效' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: '免费' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '稳定' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '经济' },
  ]
}

function getDefaultOpenRouterModels() {
  return [
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: '最新 Claude' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: '强大推理' },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', description: '旗舰' },
    { id: 'openai/gpt-5', name: 'GPT-5', description: '最新 OpenAI' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI 多模态' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Google 最强' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', description: '推理优化' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: '高性价比' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: '开源最强' },
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', description: '中文优化' },
    { id: 'mistralai/mistral-large', name: 'Mistral Large', description: '欧洲旗舰' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', description: '免费' },
  ]
}
