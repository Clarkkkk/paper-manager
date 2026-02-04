'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

// 可用的免费模型列表（已验证可用）
const AVAILABLE_MODELS = [
  { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 2.5 1.2B', desc: '默认快速' },
  { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T', desc: '推理优化' },
  { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2', desc: 'R1T2' },
  { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron 9B', desc: 'NVIDIA' },
  { id: 'nvidia/nemotron-30b-a3b:free', name: 'Nemotron 30B', desc: 'NVIDIA 强力' },
  { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini', desc: '轻量' },
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large', desc: '大模型' },
  { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash', desc: '快速' },
  { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3', desc: '专业' },
  { id: 'allenai/molmo-2-8b:free', name: 'Molmo 2 8B', desc: '视觉' },
  { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM Thinking', desc: '思考' },
  { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1', desc: '推理(笔记)' },
  { id: 'openrouter/free', name: 'Auto', desc: '自动' },
]

const STORAGE_KEY = 'myscispace-quick-model'
const DB_PREFERRED_MODEL_KEY = 'myscispace-preferred-model' // 用于与数据库同步

interface ModelSelectorProps {
  onModelChange?: (modelId: string) => void
}

export function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState('liquid/lfm-2.5-1.2b-instruct:free')
  const [isLoading, setIsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // 加载模型选择 - 优先从数据库获取，再从 localStorage，最后默认值
  useEffect(() => {
    const loadModel = async () => {
      try {
        // 先尝试从 API 获取用户设置
        const res = await fetch('/api/profile')
        if (res.ok) {
          const { profile } = await res.json()
          if (profile?.preferred_model) {
            // 检查数据库中的模型是否在可用列表中
            const dbModel = AVAILABLE_MODELS.find(m => m.id === profile.preferred_model)
            if (dbModel) {
              setSelectedModel(profile.preferred_model)
              localStorage.setItem(STORAGE_KEY, profile.preferred_model)
              onModelChange?.(profile.preferred_model)
              setIsLoading(false)
              return
            }
          }
        }
      } catch {
        // API 失败，继续使用 localStorage
      }
      
      // 回退到 localStorage
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setSelectedModel(saved)
        onModelChange?.(saved)
      }
      setIsLoading(false)
    }

    loadModel()
  }, [onModelChange])

  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId)
    localStorage.setItem(STORAGE_KEY, modelId)
    onModelChange?.(modelId)
    
    // 同步到数据库
    setSyncing(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_model: modelId }),
      })
    } catch {
      // 静默失败，本地选择仍有效
    }
    setSyncing(false)
    
    const model = AVAILABLE_MODELS.find(m => m.id === modelId)
    toast.success(`已切换模型: ${model?.name || modelId}`, {
      description: '设置已同步到账户',
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        加载中...
      </div>
    )
  }

  const currentModel = AVAILABLE_MODELS.find(m => m.id === selectedModel)

  return (
    <div className="flex items-center gap-2">
      {syncing && <RefreshCw className="w-3 h-3 animate-spin text-zinc-500" />}
      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
      <Select value={selectedModel} onValueChange={handleModelChange}>
        <SelectTrigger className="h-7 px-2 text-xs bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 w-[160px]">
          <SelectValue placeholder="选择模型">
            {currentModel?.name || '选择模型'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-800 max-h-[300px]">
          {AVAILABLE_MODELS.map((model) => (
            <SelectItem 
              key={model.id} 
              value={model.id}
              className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800"
            >
              <div className="flex flex-col py-0.5">
                <span className="text-zinc-200 text-xs">{model.name}</span>
                <span className="text-zinc-500 text-[10px]">{model.desc}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// Hook 用于获取当前选择的模型
export function useQuickModel() {
  const [model, setModel] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || 'liquid/lfm-2.5-1.2b-instruct:free'
    }
    return 'liquid/lfm-2.5-1.2b-instruct:free'
  })

  return model
}
