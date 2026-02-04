'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Paper } from '@/types/database'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  FileText, 
  MoreVertical, 
  Trash2, 
  ExternalLink, 
  Clock, 
  Edit,
  ChevronLeft,
  ChevronRight,
  SortAsc,
  SortDesc,
  Filter,
  X,
  Search,
  BookOpen,
  Tag,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PaperEditDialog } from './paper-edit-dialog'
import { cn } from '@/lib/utils'

interface PaperListProps {
  papers: Paper[]
  viewMode?: 'list' | 'compact'
}

type SortKey = 'created_at' | 'title' | 'journal'
type SortOrder = 'asc' | 'desc'

interface Filters {
  search: string
  journal: string
  tag: string
  keyword: string
}

const ITEMS_PER_PAGE = 20

export function PaperList({ papers, viewMode = 'list' }: PaperListProps) {
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    journal: '',
    tag: '',
    keyword: '',
  })

  // 提取所有可用的期刊、标签和关键词用于筛选
  const filterOptions = useMemo(() => {
    const journals = new Set<string>()
    const tags = new Set<string>()
    const keywords = new Set<string>()

    papers.forEach(paper => {
      if (paper.journal) journals.add(paper.journal)
      paper.tags?.forEach(tag => tags.add(tag))
      if (paper.keywords) {
        paper.keywords.split(/[,，]/).forEach(k => {
          const trimmed = k.trim()
          if (trimmed) keywords.add(trimmed)
        })
      }
    })

    return {
      journals: Array.from(journals).sort(),
      tags: Array.from(tags).sort(),
      keywords: Array.from(keywords).sort(),
    }
  }, [papers])

  // 筛选论文
  const filteredPapers = useMemo(() => {
    return papers.filter(paper => {
      // 搜索过滤（标题、作者、关键词）
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const matchTitle = paper.title.toLowerCase().includes(searchLower)
        const matchAuthors = paper.authors?.toLowerCase().includes(searchLower)
        const matchKeywords = paper.keywords?.toLowerCase().includes(searchLower)
        if (!matchTitle && !matchAuthors && !matchKeywords) return false
      }

      // 期刊过滤
      if (filters.journal && paper.journal !== filters.journal) {
        return false
      }

      // 标签过滤
      if (filters.tag && !paper.tags?.includes(filters.tag)) {
        return false
      }

      // 关键词过滤
      if (filters.keyword && !paper.keywords?.toLowerCase().includes(filters.keyword.toLowerCase())) {
        return false
      }

      return true
    })
  }, [papers, filters])

  // 排序论文
  const sortedPapers = useMemo(() => {
    return [...filteredPapers].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''
      
      if (sortKey === 'created_at') {
        aVal = new Date(a.created_at).getTime()
        bVal = new Date(b.created_at).getTime()
      } else if (sortKey === 'title') {
        aVal = a.title.toLowerCase()
        bVal = b.title.toLowerCase()
      } else if (sortKey === 'journal') {
        aVal = a.journal || ''
        bVal = b.journal || ''
      }
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
      }
    })
  }, [filteredPapers, sortKey, sortOrder])

  // 分页
  const totalPages = Math.ceil(sortedPapers.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedPapers = sortedPapers.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }

  const handleEdit = (paper: Paper) => {
    setEditingPaper(paper)
    setEditDialogOpen(true)
  }

  const handleEditDialogClose = (open: boolean) => {
    setEditDialogOpen(open)
    if (!open) {
      // 对话框关闭时清除本地状态，下次打开获取最新数据
      setEditingPaper(null)
    }
  }

  const clearFilters = () => {
    setFilters({ search: '', journal: '', tag: '', keyword: '' })
    setCurrentPage(1)
  }

  const hasActiveFilters = filters.search || filters.journal || filters.tag || filters.keyword
  const activeFilterCount = [filters.journal, filters.tag, filters.keyword].filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* 搜索和筛选栏 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {/* 搜索框 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={filters.search}
              onChange={(e) => {
                setFilters(f => ({ ...f, search: e.target.value }))
                setCurrentPage(1)
              }}
              placeholder="搜索标题、作者、关键词..."
              className="pl-9 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
            {filters.search && (
              <button
                onClick={() => setFilters(f => ({ ...f, search: '' }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 筛选按钮 */}
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'gap-2 border-zinc-700 text-zinc-400',
              showFilters && 'border-emerald-500/50 text-emerald-400'
            )}
          >
            <Filter className="w-4 h-4" />
            筛选
            {activeFilterCount > 0 && (
              <Badge className="bg-emerald-500 text-white text-xs px-1.5 py-0 ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* 筛选面板 */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
            {/* 期刊筛选 */}
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-zinc-500" />
              <Select
                value={filters.journal || 'all'}
                onValueChange={(v) => {
                  setFilters(f => ({ ...f, journal: v === 'all' ? '' : v }))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-40 h-8 bg-zinc-800 border-zinc-700 text-zinc-300 text-sm">
                  <SelectValue placeholder="期刊" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="all" className="text-zinc-400">全部期刊</SelectItem>
                  {filterOptions.journals.map(j => (
                    <SelectItem key={j} value={j} className="text-zinc-300">{j}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 标签筛选 */}
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-zinc-500" />
              <Select
                value={filters.tag || 'all'}
                onValueChange={(v) => {
                  setFilters(f => ({ ...f, tag: v === 'all' ? '' : v }))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-32 h-8 bg-zinc-800 border-zinc-700 text-zinc-300 text-sm">
                  <SelectValue placeholder="标签" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="all" className="text-zinc-400">全部标签</SelectItem>
                  {filterOptions.tags.map(t => (
                    <SelectItem key={t} value={t} className="text-zinc-300">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 关键词筛选 */}
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-zinc-500" />
              <Select
                value={filters.keyword || 'all'}
                onValueChange={(v) => {
                  setFilters(f => ({ ...f, keyword: v === 'all' ? '' : v }))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-36 h-8 bg-zinc-800 border-zinc-700 text-zinc-300 text-sm">
                  <SelectValue placeholder="关键词" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 max-h-60 overflow-y-auto">
                  <SelectItem value="all" className="text-zinc-400">全部关键词</SelectItem>
                  {filterOptions.keywords.map(k => (
                    <SelectItem key={k} value={k} className="text-zinc-300">{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 清除筛选 */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs text-zinc-500 hover:text-red-400"
              >
                <X className="w-3 h-3 mr-1" />
                清除筛选
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 排序控制和统计 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">排序:</span>
          <div className="flex gap-1">
            {[
              { key: 'created_at' as const, label: '导入时间' },
              { key: 'journal' as const, label: '期刊' },
              { key: 'title' as const, label: '标题' },
            ].map(({ key, label }) => (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                onClick={() => handleSort(key)}
                className={cn(
                  'h-7 text-xs gap-1',
                  sortKey === key ? 'text-emerald-400' : 'text-zinc-400'
                )}
              >
                {label}
                {sortKey === key && (
                  sortOrder === 'desc' ? <SortDesc className="w-3 h-3" /> : <SortAsc className="w-3 h-3" />
                )}
              </Button>
            ))}
          </div>
        </div>
        <span className="text-xs text-zinc-500">
          {hasActiveFilters && `筛选后 ${filteredPapers.length} / `}
          共 {papers.length} 篇论文
        </span>
      </div>

      {/* 论文列表 */}
      {paginatedPapers.length > 0 ? (
        <div className="space-y-3">
          {paginatedPapers.map((paper, index) => (
            <PaperCard 
              key={paper.id} 
              paper={paper}
              onEdit={handleEdit}
              viewMode={viewMode}
              style={{ 
                animationDelay: `${index * 30}ms` 
              }} 
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          {hasActiveFilters ? (
            <>
              <p>没有符合筛选条件的论文</p>
              <Button
                variant="link"
                onClick={clearFilters}
                className="text-emerald-400 mt-2"
              >
                清除筛选条件
              </Button>
            </>
          ) : (
            <p>还没有论文，点击"上传"添加第一篇吧</p>
          )}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-zinc-400 px-4">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* 编辑对话框 */}
      <PaperEditDialog
        paper={editingPaper}
        open={editDialogOpen}
        onOpenChange={handleEditDialogClose}
      />
    </div>
  )
}

interface PaperCardProps {
  paper: Paper
  onEdit: (paper: Paper) => void
  viewMode?: 'list' | 'compact'
  style?: React.CSSProperties
}

function PaperCard({ paper, onEdit, viewMode = 'list', style }: PaperCardProps) {
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('确定要删除这篇论文吗？相关的笔记和对话记录也会被删除。')) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/papers?id=${paper.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('删除失败')
      }

      toast.success('论文已删除')
      router.refresh()
    } catch {
      toast.error('删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  const importedDate = formatDistanceToNow(new Date(paper.created_at), {
    addSuffix: true,
    locale: zhCN,
  })

  return (
    <Card 
      className="group relative bg-zinc-900/50 border-zinc-800/50 hover:border-zinc-700/50 hover:bg-zinc-900/80 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
      style={style}
    >
      <Link href={`/dashboard/paper/${paper.id}`} className="block p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:from-emerald-500/20 group-hover:to-teal-500/20 transition-colors">
            <FileText className="w-5 h-5 text-emerald-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-zinc-100 line-clamp-2 group-hover:text-emerald-400 transition-colors">
              {paper.title}
            </h3>
            
            {paper.authors && (
              <p className="text-sm text-zinc-500 truncate mt-0.5">
                {paper.authors}
              </p>
            )}
            
            {/* 期刊和时间 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {/* 期刊 */}
              {paper.journal && (
                <div className="flex items-center gap-1.5">
                  <Badge 
                    variant="secondary" 
                    className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs"
                  >
                    <BookOpen className="w-3 h-3 mr-1" />
                    {paper.journal}
                  </Badge>
                </div>
              )}
              
              {/* 导入时间 */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock className="w-3.5 h-3.5" />
                导入 {importedDate}
              </div>
            </div>
            
            {/* 标签和关键词 */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* 标签 */}
              {paper.tags && paper.tags.length > 0 && (
                <div className="flex gap-1.5">
                  {paper.tags.slice(0, 3).map((tag) => (
                    <Badge 
                      key={tag} 
                      variant="secondary" 
                      className="bg-zinc-800 text-zinc-400 border-zinc-700 text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {paper.tags.length > 3 && (
                    <Badge 
                      variant="secondary" 
                      className="bg-zinc-800 text-zinc-500 border-zinc-700 text-xs"
                    >
                      +{paper.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
              
              {/* 关键词 */}
              {paper.keywords && (
                <span className="text-xs text-zinc-600">
                  | {paper.keywords}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Actions Menu */}
      <div className="absolute top-4 right-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
            <DropdownMenuItem asChild>
              <Link 
                href={`/dashboard/paper/${paper.id}`}
                className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                打开
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onEdit(paper)}
              className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
            >
              <Edit className="mr-2 h-4 w-4" />
              编辑信息
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem 
              onClick={handleDelete}
              disabled={deleting}
              className="cursor-pointer text-red-400 focus:bg-zinc-800 focus:text-red-400"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? '删除中...' : '删除'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}
