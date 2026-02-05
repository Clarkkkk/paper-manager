'use client'

import { useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  className?: string
  disabled?: boolean
}

export function TagInput({
  value = [],
  onChange,
  placeholder = '输入标签后按 Enter',
  maxTags = 10,
  className,
  disabled = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // 删除最后一个标签
      onChange(value.slice(0, -1))
    }
  }

  const addTag = () => {
    if (disabled) return
    const tag = inputValue.trim()
    if (!tag) return
    if (value.includes(tag)) {
      setInputValue('')
      return
    }
    if (value.length >= maxTags) {
      return
    }
    onChange([...value, tag])
    setInputValue('')
  }

  const removeTag = (tagToRemove: string) => {
    if (disabled) return
    onChange(value.filter(tag => tag !== tagToRemove))
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/30"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      {value.length < maxTags && !disabled && (
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={placeholder}
          className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
        />
      )}
      {value.length >= maxTags && (
        <p className="text-xs text-zinc-500">已达到最大标签数量 ({maxTags})</p>
      )}
    </div>
  )
}
