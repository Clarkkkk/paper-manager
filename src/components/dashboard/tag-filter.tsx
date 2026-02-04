'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Paper } from '@/types/database'

interface TagFilterProps {
  papers: Paper[]
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
}

export function TagFilter({ papers, selectedTags, onTagsChange }: TagFilterProps) {
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([])

  // 从论文中提取所有唯一标签
  useEffect(() => {
    const tagCounts = new Map<string, number>()
    papers.forEach((paper) => {
      paper.tags?.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      })
    })
    
    const sorted = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
    
    setAllTags(sorted)
  }, [papers])

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag))
    } else {
      onTagsChange([...selectedTags, tag])
    }
  }

  const clearAll = () => {
    onTagsChange([])
  }

  if (allTags.length === 0) return null

  // 预设标签颜色
  const getTagColor = (index: number, isSelected: boolean) => {
    const colors = [
      isSelected ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      isSelected ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      isSelected ? 'bg-violet-500/20 text-violet-300 border-violet-500/50' : 'bg-violet-500/10 text-violet-400 border-violet-500/30',
      isSelected ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      isSelected ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      isSelected ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    ]
    return colors[index % colors.length]
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-zinc-500" />
        <span className="text-sm text-zinc-400">标签筛选</span>
        {selectedTags.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-3 h-3 mr-1" />
            清除筛选
          </Button>
        )}
      </div>
      
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          {allTags.map(({ tag, count }, index) => {
            const isSelected = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all',
                  'hover:scale-105 active:scale-95',
                  getTagColor(index, isSelected),
                  isSelected && 'ring-1 ring-offset-1 ring-offset-zinc-950'
                )}
              >
                <span>{tag}</span>
                <span className="text-xs opacity-60">({count})</span>
              </button>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
