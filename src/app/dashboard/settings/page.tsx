'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectScrollDownButton,
  SelectScrollUpButton,
} from '@/components/ui/select'
import { Key, Loader2, Check, Sparkles, Globe, Tags, Plus, X, Server, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// API 提供商配置 - 包含系统默认选项
const API_PROVIDERS = [
  { 
    id: 'system', 
    name: '🎁 系统默认（免费）', 
    description: '使用 OpenRouter 免费模型，无需配置',
    icon: '🎁',
    requiresKey: false,
  },
  { 
    id: 'google', 
    name: 'Google AI Studio', 
    description: '使用自己的 Google API Key',
    icon: '🔮',
    keyPlaceholder: 'AIzaSy...',
    helpUrl: 'https://aistudio.google.com/apikey',
    requiresKey: true,
  },
  { 
    id: 'openai', 
    name: 'OpenAI', 
    description: '官方 GPT 系列',
    icon: '🧠',
    keyPlaceholder: 'sk-...',
    helpUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
  },
  { 
    id: 'openrouter', 
    name: 'OpenRouter', 
    description: '200+ 模型聚合',
    icon: '🔀',
    keyPlaceholder: 'sk-or-...',
    helpUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
  },
  { 
    id: 'custom', 
    name: '自定义 API', 
    description: 'Cursor/本地/其他兼容 API',
    icon: '⚙️',
    keyPlaceholder: '你的 API Key',
    helpUrl: 'https://docs.anthropic.com/claude-code',
    requiresKey: true,
  },
] as const

type ProviderId = typeof API_PROVIDERS[number]['id']

// 测试通过的免费模型列表（按测试结果排序）
const SYSTEM_FREE_MODELS = [
  // 第一梯队：快速稳定
  { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 2.5 1.2B', description: '快速稳定首选', priority: 1 },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', description: '推理强', priority: 2 },
  
  // 第二梯队：备用选择
  { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM Thinking', description: '深度思考', priority: 3 },
  { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T', description: 'TNG优化版', priority: 4 },
  { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2', description: 'TNG优化版2', priority: 5 },
  
  // 第三梯队：较大模型
  { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B', description: 'NVIDIA快速', priority: 6 },
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron VL 12B', description: 'NVIDIA视觉', priority: 7 },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 30B', description: 'NVIDIA强力', priority: 8 },
  { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini', description: '轻量', priority: 9 },
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large', description: 'Arcee大模型', priority: 10 },
  
  // 第四梯队：其他优质模型
  { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash', description: 'StepFun闪速', priority: 11 },
  { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3', description: 'Upstage专业', priority: 12 },
  { id: 'allenai/molmo-2-8b:free', name: 'Molmo 2 8B', description: 'AllenAI视觉', priority: 13 },
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', description: '智谱AI', priority: 14 },
  { id: 'openrouter/free', name: 'Auto Router', description: '自动选择', priority: 15 },
]

// 各提供商推荐模型
const PROVIDER_MODELS: Record<string, Array<{ id: string; name: string; description: string }>> = {
  google: [
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: '快速' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', description: '实验版' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '稳定快速' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '稳定旗舰' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '快速实惠' },
    { id: 'gpt-4o', name: 'GPT-4o', description: '多模态' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '高性能' },
    { id: 'o1-mini', name: 'o1-mini', description: '推理轻量' },
  ],
  openrouter: [
    { id: 'anthropic/claude-3.5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: '推理强' },
    { id: 'anthropic/claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: '快速' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI Mini' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: '性价比' },
  ],
}

const LANGUAGES = [
  { id: 'zh', name: '中文', nativeName: '简体中文', flag: '🇨🇳' },
  { id: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
] as const

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // API 配置
  const [provider, setProvider] = useState<ProviderId>('system')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [selectedModel, setSelectedModel] = useState('liquid/lfm-2.5-1.2b-instruct:free')
  const [customModel, setCustomModel] = useState('')
  
  // 原始值
  const [originalConfig, setOriginalConfig] = useState({
    provider: 'system' as ProviderId,
    apiKey: '',
    model: 'liquid/lfm-2.5-1.2b-instruct:free',
  })
  
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [presetTags, setPresetTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    fetchProfile()
    const savedLang = localStorage.getItem('myscispace-language') as 'zh' | 'en' | null
    if (savedLang) setLanguage(savedLang)
    const savedTags = localStorage.getItem('myscispace-preset-tags')
    if (savedTags) {
      try {
        setPresetTags(JSON.parse(savedTags))
      } catch (e) {
        console.error('Failed to parse preset tags')
      }
    }
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile')
      if (res.ok) {
        const { profile } = await res.json()
        if (profile) {
          // 检查是否有自定义 API key
          const hasCustomKey = profile.openai_api_key && !profile.openai_api_key.includes('****')
          
          // 如果没有自定义 key，默认使用系统免费模型
          const savedProvider = hasCustomKey ? (profile.api_provider || 'openrouter') : 'system'
          const savedModel = hasCustomKey 
            ? (profile.preferred_model || 'liquid/lfm-2.5-1.2b-instruct:free')
            : (profile.preferred_model || 'liquid/lfm-2.5-1.2b-instruct:free')
          
          setProvider(savedProvider as ProviderId)
          setApiKey(profile.openai_api_key || '')
          setBaseUrl(profile.api_base_url || '')
          setSelectedModel(savedModel)
          
          setOriginalConfig({
            provider: savedProvider as ProviderId,
            apiKey: profile.openai_api_key || '',
            model: savedModel,
          })
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    // 如果选择了需要 key 的提供商但没有填写
    if (provider !== 'system' && provider !== 'custom' && !apiKey) {
      toast.error('请输入 API Key')
      return
    }

    setSaving(true)
    try {
      const finalModel = customModel || selectedModel
      
      // system 提供商映射到 openrouter（使用系统默认 OpenRouter API）
      const saveProvider = provider === 'system' ? 'openrouter' : provider
      // system 不保存 key（使用系统环境变量）
      const saveKey = provider === 'system' ? '' : apiKey

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openai_api_key: saveKey,
          preferred_model: finalModel,
          api_provider: saveProvider,
          api_base_url: baseUrl || '',
        }),
      })

      if (!res.ok) throw new Error('保存失败')

      setOriginalConfig({
        provider,
        apiKey: saveKey,
        model: finalModel,
      })
      toast.success('设置已保存')
    } catch {
      toast.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleProviderChange = (newProvider: ProviderId) => {
    setProvider(newProvider)
    // 切换到系统默认时，选择默认快速模型
    if (newProvider === 'system') {
      setSelectedModel('liquid/lfm-2.5-1.2b-instruct:free')
      setApiKey('')
    }
  }

  const hasChanges = 
    provider !== originalConfig.provider ||
    apiKey !== originalConfig.apiKey ||
    selectedModel !== originalConfig.model ||
    customModel

  const handleLanguageChange = (lang: 'zh' | 'en') => {
    setLanguage(lang)
    localStorage.setItem('myscispace-language', lang)
    toast.success(lang === 'zh' ? '语言已切换为中文' : 'Language changed to English')
  }

  const addPresetTag = () => {
    const tag = newTag.trim()
    if (!tag) return
    if (presetTags.includes(tag)) {
      toast.error('标签已存在')
      return
    }
    if (presetTags.length >= 20) {
      toast.error('最多添加 20 个预设标签')
      return
    }
    const updated = [...presetTags, tag]
    setPresetTags(updated)
    localStorage.setItem('myscispace-preset-tags', JSON.stringify(updated))
    setNewTag('')
    toast.success('标签已添加')
  }

  const removePresetTag = (tag: string) => {
    const updated = presetTags.filter(t => t !== tag)
    setPresetTags(updated)
    localStorage.setItem('myscispace-preset-tags', JSON.stringify(updated))
  }

  const currentProvider = API_PROVIDERS.find(p => p.id === provider)
  const availableModels = provider === 'system' 
    ? SYSTEM_FREE_MODELS 
    : PROVIDER_MODELS[provider] || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">设置</h1>
        <p className="text-zinc-500 mt-1">配置 AI 模型和个人偏好</p>
      </div>

      <div className="space-y-6">
        {/* API 提供商选择 */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30 flex items-center justify-center">
                <Server className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-zinc-100">API 提供商</CardTitle>
                <CardDescription className="text-zinc-500">
                  选择 AI 服务来源，系统默认无需配置
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {API_PROVIDERS.map((p) => {
              const isSelected = provider === p.id
              const isSystem = p.id === 'system'
              
              return (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left',
                    isSelected 
                      ? isSystem
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-violet-500/50 bg-violet-500/5' 
                      : 'border-zinc-800 hover:border-zinc-700 bg-zinc-800/30'
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0',
                    isSelected 
                      ? isSystem ? 'border-emerald-500 bg-emerald-500' : 'border-violet-500 bg-violet-500'
                      : 'border-zinc-600'
                  )}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-xl">{p.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'font-medium',
                        isSelected ? 'text-zinc-100' : 'text-zinc-300'
                      )}>
                        {p.name}
                      </span>
                      {isSystem && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                          推荐
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{p.description}</div>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        {/* API Key 输入（仅非系统默认时显示） */}
        {provider !== 'system' && currentProvider?.requiresKey && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
                  <Key className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-zinc-100">API Key</CardTitle>
                  <CardDescription className="text-zinc-500">
                    输入你的 {currentProvider?.name} API 密钥
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={currentProvider?.keyPlaceholder || 'API Key'}
                  className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                />
                {currentProvider?.helpUrl && (
                  <p className="text-xs text-zinc-500">
                    <a 
                      href={currentProvider.helpUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300"
                    >
                      获取 {currentProvider.name} API Key →
                    </a>
                  </p>
                )}
              </div>

              {/* 自定义 Base URL */}
              {provider === 'custom' && (
                <div className="space-y-2">
                  <Label className="text-zinc-300">Base URL</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 模型选择 */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-zinc-100">AI 模型</CardTitle>
                <CardDescription className="text-zinc-500">
                  {provider === 'system' ? '选择免费模型' : `选择 ${currentProvider?.name} 模型`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 模型下拉选择 */}
            <div className="space-y-2">
              <Label className="text-zinc-300">选择模型</Label>
              <Select
                value={selectedModel}
                onValueChange={(value) => {
                  setSelectedModel(value)
                  setCustomModel('')
                }}
              >
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 hover:border-zinc-600">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent className="max-h-80 overflow-y-auto bg-zinc-900 border-zinc-800">
                  <SelectScrollUpButton className="flex justify-center py-1" />
                  {availableModels.map((model) => (
                    <SelectItem
                      key={model.id}
                      value={model.id}
                      className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-200">{model.name}</span>
                        <span className="text-xs text-zinc-500">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectScrollDownButton className="flex justify-center py-1" />
                </SelectContent>
              </Select>
            </div>

            {/* 自定义模型输入 */}
            {provider !== 'system' && (
              <div className="pt-2 border-t border-zinc-800">
                <Label className="text-zinc-400 text-xs">或输入自定义模型名称</Label>
                <Input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="例如: gpt-4-turbo, claude-3-opus"
                  className="mt-2 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 语言设置 */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-zinc-100">语言</CardTitle>
                <CardDescription className="text-zinc-500">界面显示语言</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                onClick={() => handleLanguageChange(lang.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all',
                  language === lang.id 
                    ? 'border-blue-500/50 bg-blue-500/5' 
                    : 'border-zinc-800 hover:border-zinc-700 bg-zinc-800/30'
                )}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className={language === lang.id ? 'text-zinc-100' : 'text-zinc-400'}>
                  {lang.name}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* 预设标签 */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-500/30 flex items-center justify-center">
                <Tags className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <CardTitle className="text-zinc-100">预设标签</CardTitle>
                <CardDescription className="text-zinc-500">上传论文时快速选择的标签</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="输入新标签..."
                className="flex-1 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPresetTag())}
              />
              <Button
                onClick={addPresetTag}
                disabled={!newTag.trim()}
                className="bg-pink-600 hover:bg-pink-500 text-white"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {presetTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {presetTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-sm border border-zinc-700"
                  >
                    {tag}
                    <button
                      onClick={() => removePresetTag(tag)}
                      className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-2">
                添加常用标签，上传时可快速选择
              </p>
            )}
          </CardContent>
        </Card>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                保存设置
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
