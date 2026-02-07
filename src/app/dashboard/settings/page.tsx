'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Key, Loader2, Check, Sparkles, Globe, Tags, Plus, X, Server, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { DEFAULT_FREE_MODEL_ID } from '@/lib/ai/config'

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

const LANGUAGES = [
  { id: 'zh', name: '中文', nativeName: '简体中文', flag: '🇨🇳' },
  { id: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
] as const

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasCustomKey, setHasCustomKey] = useState(false)

  // API 配置
  const [provider, setProvider] = useState<ProviderId>('system')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_FREE_MODEL_ID)
  const [customModel, setCustomModel] = useState('')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; description?: string }>>([])
  const [availableModelsProvider, setAvailableModelsProvider] = useState<ProviderId>('system')
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [modelVendor, setModelVendor] = useState<string>('all')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelSearchRef = useRef<HTMLInputElement>(null)

  // 原始值
  const [originalConfig, setOriginalConfig] = useState({
    provider: 'system' as ProviderId,
    apiKey: '',
    model: DEFAULT_FREE_MODEL_ID,
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
      } catch {
        console.error('Failed to parse preset tags')
      }
    }
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile')
      if (res.ok) {
        const { profile, hasCustomKey } = await res.json()
        if (profile) {
          // 注意：profile.openai_api_key 在 GET 中始终是 masked，不可用于推断。
          setHasCustomKey(!!hasCustomKey)

          // 如果没有自定义 key，默认使用系统免费模型
          const savedProvider = hasCustomKey ? (profile.api_provider || 'openrouter') : 'system'
          const savedModel = profile.preferred_model || DEFAULT_FREE_MODEL_ID

          setProvider(savedProvider as ProviderId)
          // 不把 masked key 填回输入框，避免用户“保存”时覆写真实 key
          setApiKey('')
          setBaseUrl(profile.api_base_url || '')
          setSelectedModel(savedModel)

          setOriginalConfig({
            provider: savedProvider as ProviderId,
            apiKey: '',
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
    const providerCfg = API_PROVIDERS.find((p) => p.id === provider)
    const requiresKey = !!providerCfg?.requiresKey
    const hasExistingKeyForSameProvider = hasCustomKey && provider === originalConfig.provider
    const hasNewKey = !!apiKey

    // 如果需要 key，但既没有新 key，也不能复用已有 key（比如切换 provider）
    if (provider !== 'system' && requiresKey && !hasNewKey && !hasExistingKeyForSameProvider) {
      toast.error('请输入 API Key')
      return
    }

    setSaving(true)
    try {
      const finalModel = customModel || selectedModel

      // system 提供商映射到 openrouter（使用系统默认 OpenRouter API）
      const saveProvider = provider === 'system' ? 'openrouter' : provider
      const body: Record<string, unknown> = {
        preferred_model: finalModel,
        api_provider: saveProvider,
        api_base_url: baseUrl || '',
      }
      // system：明确清除 key；其他情况：只有用户输入了新 key 才更新 key（避免回写 masked）
      if (provider === 'system') {
        body.openai_api_key = ''
      } else if (apiKey) {
        body.openai_api_key = apiKey
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('保存失败')

      setOriginalConfig({
        provider,
        apiKey: '',
        model: finalModel,
      })
      // 保存成功后，如果用户输入过 key，认为已有自定义 key
      if (provider !== 'system' && apiKey) setHasCustomKey(true)
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
      setSelectedModel(DEFAULT_FREE_MODEL_ID)
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
  const showKeySavedHint = provider !== 'system' && hasCustomKey && !apiKey
  const selectedModelObj = availableModels.find((m) => m.id === selectedModel)
  const selectedModelLabel = selectedModelObj?.name || selectedModel

  useEffect(() => {
    if (!modelMenuOpen) return
    const t = setTimeout(() => modelSearchRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [modelMenuOpen])

  const vendors = (() => {
    const set = new Set<string>()
    for (const m of availableModels) {
      const id = String(m.id || '')
      const v = id.includes('/') ? id.split('/')[0] : 'other'
      if (v) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })()

  const filteredAllModels = (() => {
    const q = modelQuery.trim().toLowerCase()
    return availableModels.filter((m) => {
      const id = String(m.id || '')
      const v = id.includes('/') ? id.split('/')[0] : 'other'
      if (modelVendor !== 'all' && v !== modelVendor) return false
      if (!q) return true
      const hay = `${m.id} ${m.name} ${m.description || ''}`.toLowerCase()
      return hay.includes(q)
    })
  })()

  // Only render a small window for UX/perf, but filtering must apply to the full list.
  const filteredModels = filteredAllModels.slice(0, 100)

  useEffect(() => {
    let cancelled = false
    const loadModels = async () => {
      if (provider === 'custom') {
        setAvailableModels([])
        setAvailableModelsProvider(provider)
        return
      }

      // provider/apiKey/baseUrl 变化时先清空旧列表，避免用“旧 provider 的模型列表”触发 fallback
      setAvailableModels([])
      setAvailableModelsProvider(provider)
      setModelsLoading(true)
      try {
        console.log('[settings][models] request', { provider, hasApiKey: !!apiKey, hasBaseUrl: !!baseUrl, includeModelId: selectedModel })
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            apiKey,
            baseUrl,
            includeModelId: selectedModel,
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to fetch models')
        }

        const data = await res.json()
        const models = Array.isArray(data.models) ? data.models : []
        console.log('[settings][models] response', {
          provider,
          count: models.length,
          hasSelected: models.some((m: { id: string }) => m.id === selectedModel),
          head: models.slice(0, 5).map((m: { id: string }) => m.id),
        })
        if (!cancelled) {
          setAvailableModelsProvider(provider)
          setAvailableModels(models)
        }
      } catch (error) {
        console.error('Failed to load models:', error)
        if (!cancelled) setAvailableModels([])
        toast.error('获取模型列表失败')
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }

    loadModels()
    return () => {
      cancelled = true
    }
  }, [provider, apiKey, baseUrl, selectedModel])

  useEffect(() => {
    if (customModel) return
    if (modelsLoading) return
    if (availableModels.length === 0) return
    // 防止“provider 已切换，但 availableModels 还是旧 provider 的列表”时误触发回退
    if (availableModelsProvider !== provider) return
    if (availableModels.some((m) => m.id === selectedModel)) return
    console.log('[settings][models] selectedModel missing, fallback', {
      selectedModel,
      fallback: availableModels[0]?.id,
      availableCount: availableModels.length,
    })
    setSelectedModel(availableModels[0].id)
  }, [availableModels, selectedModel, customModel, modelsLoading, provider, availableModelsProvider])

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
                {showKeySavedHint && (
                  <div className="text-xs text-zinc-500">
                    已保存 API Key（为安全不显示）。留空表示继续使用已保存的 Key。
                  </div>
                )}
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
            {/* 模型下拉选择（下拉内可搜索，类似 antd showSearch） */}
            <div className="space-y-2">
              <Label className="text-zinc-300">选择模型</Label>
              <DropdownMenu open={modelMenuOpen} onOpenChange={setModelMenuOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 hover:border-zinc-600"
                  >
                    <span className="truncate">{selectedModelLabel}</span>
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  sideOffset={6}
                  className="w-[min(520px,calc(100vw-2rem))] bg-zinc-900 border-zinc-800 p-2"
                  onCloseAutoFocus={(e: Event) => {
                    // Keep focus where it was (avoid jumping).
                    e.preventDefault()
                  }}
                >
                  <div className="flex flex-col sm:flex-row gap-2 p-1">
                    <select
                      value={modelVendor}
                      onChange={(e) => setModelVendor(e.target.value)}
                      className="h-9 rounded-md border border-zinc-700 bg-zinc-950/40 px-2 text-sm text-zinc-200 outline-none focus:border-zinc-600 sm:w-[170px]"
                    >
                      <option value="all">全部厂商</option>
                      {vendors.map((v) => (
                        <option key={v} value={v}>
                          {v === 'other' ? '其他/无前缀' : v}
                        </option>
                      ))}
                    </select>
                    <Input
                      ref={modelSearchRef}
                      value={modelQuery}
                      onChange={(e) => setModelQuery(e.target.value)}
                      onKeyDown={(e) => {
                        // Stop menu typeahead from stealing focus on each keystroke.
                        e.stopPropagation()
                      }}
                      placeholder="在下拉中输入搜索（name / id / 描述）"
                      className="h-9 bg-zinc-950/40 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                    />
                  </div>

                  <div className="px-2 pb-2 text-xs text-zinc-500">
                    {modelsLoading
                      ? '正在加载模型…'
                      : `显示 ${filteredModels.length} / ${filteredAllModels.length}（总 ${availableModels.length}）`}
                  </div>

                  <DropdownMenuSeparator className="bg-zinc-800" />

                  {modelsLoading ? (
                    <div className="px-3 py-2 text-sm text-zinc-500">正在加载模型...</div>
                  ) : filteredModels.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-zinc-500">无匹配模型</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {filteredModels.map((model) => {
                        const isSelected = model.id === selectedModel
                        return (
                          <DropdownMenuItem
                            key={model.id}
                            onSelect={() => {
                              setSelectedModel(model.id)
                              setCustomModel('')
                            }}
                            className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800"
                          >
                            <div className="flex items-start gap-2 w-full">
                              <div className="w-4 pt-0.5 shrink-0">
                                {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-zinc-200 truncate">{model.name}</span>
                                  {model.description && (
                                    <span className="text-xs text-zinc-500 shrink-0">{model.description}</span>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-500 truncate">{model.id}</div>
                              </div>
                            </div>
                          </DropdownMenuItem>
                        )
                      })}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
