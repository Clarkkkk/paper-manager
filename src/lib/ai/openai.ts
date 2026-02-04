import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { getUserProfile } from '@/lib/supabase/server'

// API 提供商类型
export type ApiProvider = 'google' | 'openai' | 'openrouter' | 'custom'

// 用户配置类型
interface UserProfile {
  preferred_model?: string
  openai_api_key?: string | null
  api_provider?: ApiProvider
  api_base_url?: string | null
}

// 各提供商默认 Base URL
const DEFAULT_BASE_URLS: Record<ApiProvider, string> = {
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: '',
}

// 各提供商默认模型
const DEFAULT_MODELS: Record<ApiProvider, string> = {
  google: 'gemini-2.0-flash-lite',
  openai: 'gpt-4o-mini',
  openrouter: 'liquid/lfm-2.5-1.2b-instruct:free',  // 使用 LFM 2.5 1.2B，更稳定
  custom: 'gpt-4',
}

// 判断提供商使用的 SDK 类型
function getSDKType(provider: ApiProvider): 'google' | 'openai' {
  if (provider === 'google') {
    return 'google'
  }
  // OpenAI, OpenRouter 和自定义都使用 OpenAI SDK（兼容 OpenAI 格式）
  return 'openai'
}

// 验证并修正模型 ID
function validateModelId(modelId: string): string {
  // 去除 models/ 前缀（Google API 有时返回带前缀的模型名）
  if (modelId.startsWith('models/')) {
    modelId = modelId.replace('models/', '')
  }
  
  // 不再限制模型列表，允许用户使用任何模型名称
  // 如果模型不存在，API 会返回错误，用户可以自行选择其他模型
  return modelId
}

// 动态创建 AI 客户端 (支持多提供商)
export async function getAIClient(fixedModel?: string) {
  const profile = await getUserProfile() as UserProfile | null
  
  console.log('[AI Client] Profile:', JSON.stringify({
    hasProfile: !!profile,
    apiProvider: profile?.api_provider,
    preferredModel: profile?.preferred_model,
    hasApiKey: !!profile?.openai_api_key,
    keyPreview: profile?.openai_api_key?.substring(0, 10) + '...',
  }))
  
  // 如果指定了固定模型，直接使用（用于元数据提取等不需要大模型的任务）
  if (fixedModel) {
    console.log('[AI Client] Using fixed model:', fixedModel)
    const provider: ApiProvider = 'openai'  // 固定模型使用 OpenAI 格式
    const openai = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseURL: DEFAULT_BASE_URLS.openai,
    })
    
    return {
      client: (modelId: string) => openai.chat(modelId),
      model: fixedModel,
      hasCustomKey: false,
      provider,
    }
  }
  
  // 获取提供商，默认 OpenRouter（使用系统免费模型）
  let provider: ApiProvider = (profile?.api_provider as ApiProvider) || 'openrouter'
  
  // 检查是否使用系统默认（用户没有配置自定义 key）
  const hasCustomKey = profile?.openai_api_key && !profile.openai_api_key.includes('****')
  
  console.log('[AI Client] hasCustomKey:', hasCustomKey)
  
  // 如果没有自定义 key，强制使用 OpenRouter 免费模型
  if (!hasCustomKey) {
    provider = 'openrouter'
  }
  
  // 获取模型，使用用户偏好或提供商默认
  let modelId = profile?.preferred_model || DEFAULT_MODELS[provider]
  console.log('[AI Client] Initial modelId:', modelId)
  
  // 验证并修正模型 ID
  modelId = validateModelId(modelId)
  
  // 获取 Base URL
  let baseUrl = profile?.api_base_url || ''
  if (!baseUrl) {
    baseUrl = DEFAULT_BASE_URLS[provider]
  }
  
  // 获取 API Key
  let apiKey: string | undefined
  
  if (hasCustomKey && profile?.openai_api_key) {
    // 使用用户自定义 Key
    apiKey = profile.openai_api_key
  } else {
    // 使用系统默认 OpenRouter API Key
    apiKey = process.env.OPENROUTER_API_KEY
    console.log('[AI Client] Using system API key, env exists:', !!process.env.OPENROUTER_API_KEY)
  }
  
  // 如果没有 API key，报错
  if (!apiKey) {
    throw new Error('系统 API Key 未配置。请在 .env.local 中设置 OPENROUTER_API_KEY')
  }
  
  // 如果使用系统默认，只允许免费模型
  if (!hasCustomKey) {
    // 确保使用免费的 LFM 模型（更稳定）
    if (!modelId.includes(':free')) {
      modelId = 'liquid/lfm-2.5-1.2b-instruct:free'
    }
  }
  
  console.log(`[AI Client] Final config: provider=${provider}, model=${modelId}, hasCustomKey=${hasCustomKey}`)
  
  const sdkType = getSDKType(provider)
  
  // 创建对应的客户端
  if (sdkType === 'google') {
    const google = createGoogleGenerativeAI({
      apiKey,
      baseURL: baseUrl || DEFAULT_BASE_URLS.google,
    })
    
    return {
      client: (modelId: string) => google(modelId),
      model: modelId,
      hasCustomKey,
      provider,
    }
  } else if (provider === 'openrouter') {
    // 使用官方 OpenRouter Provider
    const openrouter = createOpenRouter({
      apiKey,
      headers: {
        'HTTP-Referer': 'https://myscispace.app',
        'X-Title': 'MySciSpace',
      },
    })
    
    return {
      client: (modelId: string) => openrouter.chat(modelId),
      model: modelId,
      hasCustomKey,
      provider,
    }
  } else {
    // OpenAI 和自定义提供商
    const openai = createOpenAI({
      apiKey,
      baseURL: baseUrl || DEFAULT_BASE_URLS.openai,
    })
    
    return {
      client: (modelId: string) => openai.chat(modelId),
      model: modelId,
      hasCustomKey,
      provider,
    }
  }
}

// 兼容旧代码
export async function getOpenAIClient() {
  return getAIClient()
}

// 判断模型提供商（用于旧代码兼容）
export function getModelProvider(modelId: string): 'google' | 'openai' {
  if (modelId.startsWith('gemini') || modelId.startsWith('models/gemini')) {
    return 'google'
  }
  return 'openai'
}

// 生成笔记的 Prompt
export const GENERATE_NOTES_PROMPT = `你是一位专业的学术论文分析专家。请分析提供的论文内容，并用中文生成结构化的笔记（Markdown 格式）。

你的回复必须严格按照以下结构：

## 一句话总结
用2-3句话概括论文的核心贡献。

## 创新点
- 列出论文的主要创新贡献
- 每个要点要简洁但信息丰富

## 方法
- 描述技术方法和实现
- 包括使用的关键算法或框架

## 实验结果
- 总结关键实验发现
- 包括重要的指标或对比结果

## 局限性
- 论文承认的局限性有哪些？
- 有什么可以改进的地方？

## 相关工作
- 提及的关键相关论文或方法

注意：请用中文回答，专业术语可以保留英文（如 LLM, Transformer 等）。`

// RAG 对话的系统 Prompt
export const RAG_SYSTEM_PROMPT = `你是一个专业的论文阅读助手，帮助用户理解和分析学术论文。

你可以访问当前论文的相关信息。请基于论文内容回答用户的问题。

回答要求：
1. 用中文回答，专业术语可保留英文
2. 回答要简洁、准确、有帮助
3. 如果论文信息不足以回答问题，请诚实说明，并基于标题和已知信息进行合理推测
4. 可以结合你的知识对论文主题进行补充说明

如果用户问的是关于论文内容的具体问题，而你只有标题信息，你可以：
- 解释论文标题的含义
- 介绍相关领域的背景知识
- 推测论文可能的研究方向和方法`
