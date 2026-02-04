'use client'

import { useState, useMemo } from 'react'
import { Paper } from '@/types/database'
import { PaperList } from './paper-list'
import { TagFilter } from './tag-filter'
import { Search, FileText, Sparkles } from 'lucide-react'
import { UploadButton } from './upload-button'

interface PapersViewProps {
  papers: Paper[]
}

export function PapersView({ papers }: PapersViewProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // 筛选论文
  const filteredPapers = useMemo(() => {
    let result = papers

    // 按标签筛选
    if (selectedTags.length > 0) {
      result = result.filter((paper) =>
        selectedTags.some((tag) => paper.tags?.includes(tag))
      )
    }

    // 按搜索词筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (paper) =>
          paper.title.toLowerCase().includes(query) ||
          paper.authors?.toLowerCase().includes(query) ||
          paper.tags?.some((tag) => tag.toLowerCase().includes(query))
      )
    }

    return result
  }, [papers, selectedTags, searchQuery])

  // 检查是否有任何标签
  const hasTags = papers.some((paper) => paper.tags && paper.tags.length > 0)

  return (
    <div>
      {/* Tag Filter */}
      {hasTags && (
        <TagFilter
          papers={papers}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
        />
      )}

      {/* Results info */}
      {(selectedTags.length > 0 || searchQuery) && (
        <div className="mb-4 text-sm text-zinc-500">
          找到 {filteredPapers.length} 篇论文
          {selectedTags.length > 0 && ` · 标签: ${selectedTags.join(', ')}`}
          {searchQuery && ` · 搜索: "${searchQuery}"`}
        </div>
      )}

      {/* Paper List - contains its own search bar */}
      {filteredPapers.length > 0 ? (
        <PaperList papers={filteredPapers} />
      ) : papers.length > 0 ? (
        <NoResults onClear={() => { setSelectedTags([]); setSearchQuery('') }} />
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
        <Search className="w-8 h-8 text-zinc-600" />
      </div>
      <h3 className="text-lg font-medium text-zinc-300 mb-2">
        没有找到匹配的论文
      </h3>
      <p className="text-zinc-500 text-center max-w-sm mb-4">
        尝试使用不同的搜索词或清除筛选条件
      </p>
      <button
        onClick={onClear}
        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        清除所有筛选
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-6">
          <FileText className="w-10 h-10 text-zinc-600" />
        </div>
        <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">
        开始你的研究之旅
      </h3>
      <p className="text-zinc-500 text-center max-w-sm mb-6">
        上传你的第一篇论文，AI 将自动为你生成结构化笔记，并支持交互式问答
      </p>
      <UploadButton variant="large" />
    </div>
  )
}
