'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Paper } from '@/types/database'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TagInput } from '@/components/ui/tag-input'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface EditPaperDialogProps {
  paper: Paper
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditPaperDialog({ paper, open, onOpenChange }: EditPaperDialogProps) {
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [abstract, setAbstract] = useState('')
  const [keywords, setKeywords] = useState('')
  const [publishedDate, setPublishedDate] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const router = useRouter()

  // 加载预设标签
  const [presetTags, setPresetTags] = useState<string[]>([])
  
  useEffect(() => {
    const saved = localStorage.getItem('myscispace-preset-tags')
    if (saved) {
      try {
        setPresetTags(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse preset tags')
      }
    }
  }, [])

  // 当 paper 或 open 改变时，重置表单
  useEffect(() => {
    if (open && paper) {
      setTitle(paper.title || '')
      setAuthors(paper.authors || '')
      setAbstract(paper.abstract || '')
      setKeywords(paper.keywords || '')
      setPublishedDate(paper.published_date || '')
      setTags(paper.tags || [])
    }
  }, [open, paper])

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('请输入论文标题')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/papers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: paper.id,
          title: title.trim(),
          authors: authors.trim() || null,
          abstract: abstract.trim() || null,
          keywords: keywords.trim() || null,
          published_date: publishedDate || null,
          tags,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '保存失败')
      }

      toast.success('论文信息已更新')
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const addPresetTag = (tag: string) => {
    if (!tags.includes(tag) && tags.length < 5) {
      setTags([...tags, tag])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-zinc-900 border-zinc-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">编辑论文信息</DialogTitle>
          <DialogDescription className="text-zinc-500">
            修改论文的元数据信息
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-zinc-300">
              论文标题 <span className="text-red-400">*</span>
            </Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入论文标题"
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          {/* Authors */}
          <div className="space-y-2">
            <Label htmlFor="edit-authors" className="text-zinc-300">
              作者
            </Label>
            <Input
              id="edit-authors"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="例如：John Doe, Jane Smith (通讯作者)"
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          {/* Abstract */}
          <div className="space-y-2">
            <Label htmlFor="edit-abstract" className="text-zinc-300">
              摘要
            </Label>
            <Textarea
              id="edit-abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="论文摘要..."
              rows={3}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label htmlFor="edit-keywords" className="text-zinc-300">
              关键词
            </Label>
            <Input
              id="edit-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例如：deep learning, 深度学习, attention"
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          {/* Published Date */}
          <div className="space-y-2">
            <Label htmlFor="edit-publishedDate" className="text-zinc-300">
              发表日期
            </Label>
            <Input
              id="edit-publishedDate"
              type="date"
              value={publishedDate}
              onChange={(e) => setPublishedDate(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 focus:border-emerald-500"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-zinc-300">标签</Label>
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder="输入标签后按 Enter"
              maxTags={5}
            />
            {presetTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-zinc-500">快速添加:</span>
                {presetTags.filter(t => !tags.includes(t)).slice(0, 6).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addPresetTag(tag)}
                    className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
