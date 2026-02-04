import { NextRequest, NextResponse } from 'next/server'

// 从各提供商 API 获取最新模型列表
export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, baseUrl } = await req.json()

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    let models: Array<{ id: string; name: string; description?: string }> = []

    // 系统默认只返回免费模型
    if (provider === 'system') {
      return NextResponse.json({ models: getFreeModels() })
    }

    switch (provider) {
      case 'openai':
        models = await fetchOpenAIModels(apiKey, baseUrl)
        break
      case 'google':
        models = await fetchGoogleModels(apiKey, baseUrl)
        break
      case 'openrouter':
        models = await fetchOpenRouterModels(apiKey)
        break
      default:
        // 自定义提供商返回空列表
        models = []
    }

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Fetch models error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 }
    )
  }
}

// 获取系统免费模型列表 - 33个 OpenRouter 免费模型
function getFreeModels() {
  return [
    { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 2.5 1.2B', description: '稳定可用，推荐默认' },
    { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', description: 'Meta 开源' },
    { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B', description: 'Google 轻量' },
    { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1', description: '推理能力强' },
    { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B', description: '更强能力' },
    { id: 'meta-llama/llama-3.1-405b-instruct:free', name: 'Llama 3.1 405B', description: '开源旗舰' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', description: '70B 强力' },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1', description: '欧洲开源' },
    { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T', description: 'TNG 优化版' },
    { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', description: '27B 能力版' },
    { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Venice Uncensored', description: '无审查版' },
    { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2', description: 'TNG R1T2' },
    { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini', description: 'Arcee 轻量' },
    { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large', description: 'Arcee 预览版' },
    { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano', description: 'NVIDIA 9B' },
    { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron VL', description: 'NVIDIA 12B VL' },
    { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 30B', description: 'NVIDIA 30B' },
    { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash', description: 'StepFun 闪速' },
    { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3', description: 'Upstage 专业' },
    { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM Thinking', description: '思考模型' },
    { id: 'allenai/molmo-2-8b:free', name: 'Molmo 2 8B', description: 'AllenAI 视觉' },
    { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B', description: 'Qwen 80B' },
    { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder', description: '代码专用' },
    { id: 'qwen/qwen-2.5-vl-7b-instruct:free', name: 'Qwen2.5-VL', description: '视觉语言' },
    { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', description: '智谱 AI' },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', description: 'OpenAI 开源' },
    { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B', description: 'OpenAI 小型' },
    { id: 'google/gemma-3n-e2b-it:free', name: 'Gemma 3n 2B', description: 'Gemma 轻量' },
    { id: 'google/gemma-3n-e4b-it:free', name: 'Gemma 3n 4B', description: 'Gemma 4B' },
    { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B', description: 'Nous 优化' },
    { id: 'openrouter/free:free', name: 'Free Router', description: '自动路由' },
    { id: 'qwen/qwen3-4b:free', name: 'Qwen3 4B', description: '速度较快' },
  ]
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
async function fetchOpenRouterModels(apiKey?: string, freeOnly: boolean = false) {
  try {
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://myscispace.app',
      'X-Title': 'MySciSpace',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', { headers })
    
    if (!res.ok) return freeOnly ? getFreeModels() : getDefaultOpenRouterModels()
    
    const data = await res.json()
    const models = data.data || []
    
    // 如果只需要免费模型
    if (freeOnly) {
      const freeModels = models
        .filter((m: { id: string; pricing?: { prompt?: string } }) => 
          m.pricing?.prompt === '0' || m.id.endsWith(':free')
        )
        .slice(0, 50)
        .map((m: { id: string; name?: string; description?: string }) => ({
          id: m.id,
          name: m.name || formatModelName(m.id),
          description: '免费',
        }))
      
      return freeModels.length > 0 ? freeModels : getFreeModels()
    }
    
    // 返回所有模型，按流行度排序
    return models
      .slice(0, 100) // 限制数量
      .map((m: { id: string; name?: string; description?: string; pricing?: { prompt?: string } }) => ({
        id: m.id,
        name: m.name || formatModelName(m.id),
        description: m.pricing?.prompt === '0' ? '免费' : (m.description?.slice(0, 30) || ''),
      }))
  } catch {
    return freeOnly ? getFreeModels() : getDefaultOpenRouterModels()
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
