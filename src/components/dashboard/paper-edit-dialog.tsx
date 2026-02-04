'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagInput } from '@/components/ui/tag-input'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Paper } from '@/types/database'

interface PaperEditDialogProps {
  paper: Paper | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PaperEditDialog({ paper, open, onOpenChange }: PaperEditDialogProps) {
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [journal, setJournal] = useState('')
  const [keywords, setKeywords] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const router = useRouter()

  // 预设标签
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

  // 当 paper 或 dialog 打开时更新表单
  useEffect(() => {
    if (paper && open) {
      setTitle(paper.title || '')
      setAuthors(paper.authors || '')
      setJournal(paper.journal || '')
      setKeywords(paper.keywords || '')
      setTags(paper.tags || [])
    }
  }, [paper, open])

  const handleSave = async () => {
    if (!paper) return
    
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
          journal: journal.trim() || null,
          keywords: keywords.trim() || null,
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
      
      // 延迟清除本地状态，确保下次打开获取最新数据
      setTimeout(() => {
        setTitle('')
        setAuthors('')
        setJournal('')
        setKeywords('')
        setTags([])
      }, 300)
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
            修改论文的基本信息和分类标签
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
              作者（通讯作者用 * 标注）
            </Label>
            <Input
              id="edit-authors"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="例如：John Doe*, Jane Smith"
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          {/* Journal */}
          <div className="space-y-2">
            <Label htmlFor="edit-journal" className="text-zinc-300">
              期刊/会议
            </Label>
            <Input
              id="edit-journal"
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
              placeholder="例如：Nature, Science, CVPR 2024"
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label htmlFor="edit-keywords" className="text-zinc-300">
              中文关键词
            </Label>
            <Input
              id="edit-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例如：深度学习, 图像分类, 注意力机制"
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-zinc-300">分类标签</Label>
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder="输入标签后按 Enter 添加"
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
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
              className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
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
