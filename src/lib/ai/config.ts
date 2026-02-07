// ============================================================
// AI 模型统一配置中心
// 所有 AI 相关的类型、常量、模型列表都集中在这里
// ============================================================

// API 提供商类型
export type ApiProvider = 'google' | 'openai' | 'openrouter' | 'custom'

// 用户配置类型（对应数据库 profiles 表）
export interface UserAIProfile {
  preferred_model?: string
  openai_api_key?: string | null
  api_provider?: ApiProvider
  api_base_url?: string | null
}

// 模型列表条目类型
export interface ModelEntry {
  id: string
  name: string
  description: string
}

// 默认免费模型 ID
export const DEFAULT_FREE_MODEL_ID = 'liquid/lfm-2.5-1.2b-instruct:free'

// 各提供商默认 Base URL
export const DEFAULT_BASE_URLS: Record<ApiProvider, string> = {
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: '',
}

// 各提供商默认模型
export const DEFAULT_MODELS: Record<ApiProvider, string> = {
  google: 'gemini-2.0-flash-lite',
  openai: 'gpt-4o-mini',
  openrouter: DEFAULT_FREE_MODEL_ID,
  custom: 'gpt-4',
}

// ============================================================
// 免费模型列表（唯一来源，供 Settings 页面和 /api/models 共用）
// ============================================================
export const FREE_MODELS: ModelEntry[] = [
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
