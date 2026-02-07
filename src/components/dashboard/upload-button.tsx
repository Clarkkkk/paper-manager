'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagInput } from '@/components/ui/tag-input'
import { Upload, FileUp, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { sanitizeStorageObjectName } from '@/lib/storage/sanitize-object-name'
import { useResumableUpload } from '@/lib/supabase/use-resumable-upload'

interface UploadButtonProps {
  variant?: 'default' | 'large'
  presetTags?: string[]
}

function formatPercent(p: number) {
  const v = Math.max(0, Math.min(100, Math.round(p)))
  return `${v}%`
}

export function UploadButton({ variant = 'default', presetTags = [] }: UploadButtonProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'extracting' | 'processing' | 'done'>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [keywords, setKeywords] = useState('')
  const [journal, setJournal] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const { state: uploadState, uploadPdf } = useResumableUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const [savedPresetTags, setSavedPresetTags] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('myscispace-preset-tags')
    if (saved) {
      try {
        setSavedPresetTags(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse preset tags')
      }
    }
  }, [open])

  const allPresetTags = [...new Set([...presetTags, ...savedPresetTags])]

  const isBusy =
    isExtracting ||
    uploading ||
    uploadProgress === 'uploading' ||
    uploadProgress === 'extracting' ||
    uploadProgress === 'processing'

  const processFile = useCallback(async (selectedFile: File) => {
    if (isBusy) {
      toast.message('正在处理中，请稍候…')
      return
    }
    if (selectedFile.type !== 'application/pdf') {
      toast.error('请上传 PDF 文件')
      return
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('文件大小不能超过 50MB')
      return
    }

    setFile(selectedFile)
    setUploadedFileUrl(null)

    const nameWithoutExt = selectedFile.name.replace(/\.pdf$/i, '')
    setTitle(nameWithoutExt)

    setIsExtracting(true)
    setUploadProgress('uploading')
    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('请先登录后再上传')
      }

      const timestamp = Date.now()
      const { sanitized } = sanitizeStorageObjectName(selectedFile.name)
      const filePath = `${user.id}/${timestamp}-${sanitized}`

      // 1) 直传 Supabase Storage（绕开 Vercel 请求体大小限制）
      await uploadPdf({
        file: selectedFile,
        bucketName: 'papers',
        objectName: filePath,
        contentType: 'application/pdf',
        metadata: { originalName: selectedFile.name },
      })
      const storedPath = filePath
      setUploadedFileUrl(storedPath)

      // 2) 上传后立刻调用后端提取论文元数据（请求体很小）
      setUploadProgress('extracting')
      const metaRes = await fetch('/api/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: storedPath,
          file_name: selectedFile.name,
        }),
      })

      if (metaRes.ok) {
        const meta = await metaRes.json()
        if (meta?.title) setTitle(meta.title)
        if (meta?.authors) setAuthors(meta.authors)
        if (meta?.keywords) setKeywords(meta.keywords)
        if (meta?.journal) setJournal(meta.journal)
        toast.success(`已自动识别论文信息 (${meta?._debug?.source || 'unknown'})`)
      } else {
        // 元数据失败不阻断上传结果
        console.error('Metadata extraction failed:', await metaRes.text())
        toast.warning('上传成功，但论文信息识别失败（可稍后在详情页重试）')
      }

      setUploadProgress('idle')
    } catch (error) {
      console.error('Process error:', error)
      toast.error(error instanceof Error ? error.message : '处理文件失败')
      setUploadProgress('idle')
    } finally {
      setIsExtracting(false)
    }
  }, [isBusy, uploadPdf])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isBusy) return
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      processFile(selectedFile)
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isBusy) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [isBusy])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (isBusy) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      processFile(droppedFile)
    }
  }, [isBusy, processFile])

  const handleUpload = async () => {
    if (isBusy) return
    if (!file || !uploadedFileUrl) {
      toast.error('请先选择并上传文件')
      return
    }

    if (!title.trim()) {
      toast.error('请输入论文标题')
      return
    }

    setUploading(true)
    setUploadProgress('processing')

    try {
      const paperRes = await fetch('/api/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          authors: authors.trim() || null,
          file_url: uploadedFileUrl,
          file_name: file.name,
          file_size: file.size,
          tags: tags,
          keywords: keywords.trim() || null,
          journal: journal.trim() || null,
        }),
      })

      if (!paperRes.ok) {
        const error = await paperRes.json()
        throw new Error(error.error || '创建论文记录失败')
      }

      // 3) 异步预热解析缓存：不阻塞上传流程
      // 解析结果会持久化到 Storage，下次打开/刷新详情页可直接命中缓存，避免重复解析。
      try {
        const created = await paperRes.json()
        const createdPaperId = created?.paper?.id as string | undefined
        if (createdPaperId) {
          // 预热 RAG 索引（分块 + embedding 入库），不阻塞上传流程
          void fetch('/api/papers/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paperId: createdPaperId }),
          }).catch(() => {})

          void fetch('/api/parse-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paperId: createdPaperId, warm_cache: true }),
          }).catch(() => {})
        }
      } catch {
        // ignore
      }

      setUploadProgress('done')

      setTimeout(() => {
        toast.success('论文上传成功！')
        setOpen(false)
        resetForm()
        router.refresh()
      }, 500)

    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败')
      setUploadProgress('idle')
    } finally {
      setUploading(false)
    }
  }

  const resetForm = () => {
    setFile(null)
    setUploadedFileUrl(null)
    setTitle('')
    setAuthors('')
    setTags([])
    setKeywords('')
    setJournal('')
    setUploadProgress('idle')
    setIsExtracting(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const addPresetTag = (tag: string) => {
    if (!tags.includes(tag) && tags.length < 5) {
      setTags([...tags, tag])
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && isBusy) return
      setOpen(isOpen)
      if (!isOpen) resetForm()
    }}>
      <DialogTrigger asChild>
        {variant === 'large' ? (
          <Button
            size="lg"
            className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20"
          >
            <Upload className="w-4 h-4" />
            上传论文
          </Button>
        ) : (
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Upload className="w-4 h-4" />
            上传
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="sm:w-lg bg-zinc-900 border-zinc-800 max-h-[90vh] overflow-y-auto flex flex-col"
        showCloseButton={!isBusy}
        onEscapeKeyDown={(e) => {
          if (isBusy) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (isBusy) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (isBusy) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-zinc-100">上传论文</DialogTitle>
          <DialogDescription className="text-zinc-500">
            支持 PDF 格式，最大 50MB，可拖拽上传
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4 w-full">
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer w-full',
              isBusy && 'cursor-not-allowed opacity-60',
              isDragging
                ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]'
                : file
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
            )}
            onClick={() => {
              if (isBusy) return
              fileInputRef.current?.click()
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              disabled={isBusy}
              className="hidden"
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  {isExtracting ? (
                    <Sparkles className="w-6 h-6 text-emerald-500 animate-pulse" />
                  ) : (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  )}
                </div>
                <p className="text-sm font-medium text-zinc-200 truncate w-full overflow-hidden text-ellipsis">
                  {file.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                  {uploadProgress === 'uploading' && (uploadState.percent === null ? ' · 上传中...' : ` · 上传中 ${formatPercent(uploadState.percent)}`)}
                  {uploadProgress === 'extracting' && ' · 正在识别论文信息...'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                  isDragging ? 'bg-emerald-500/20' : 'bg-zinc-800'
                )}>
                  <FileUp className={cn(
                    'w-6 h-6 transition-colors',
                    isDragging ? 'text-emerald-400' : 'text-zinc-500'
                  )} />
                </div>
                <p className={cn(
                  'text-sm transition-colors',
                  isDragging ? 'text-emerald-400' : 'text-zinc-400'
                )}>
                  {isDragging ? '释放文件以上传' : '点击或拖拽文件到此处'}
                </p>
                <p className="text-xs text-zinc-600">
                  仅支持 PDF 格式
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="text-zinc-300 flex items-center gap-2">
              论文标题 <span className="text-red-400">*</span>
              {isExtracting && (
                <span className="text-xs text-emerald-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  识别中...
                </span>
              )}
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入论文标题"
              disabled={isBusy}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authors" className="text-zinc-300">
              作者（可选）
            </Label>
            <Input
              id="authors"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="例如：John Doe, Jane Smith"
              disabled={isBusy}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords" className="text-zinc-300">
              中文关键词（可选，AI自动生成或手动填写）
            </Label>
            <Input
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例如：深度学习, 注意力机制, 图神经网络"
              disabled={isBusy}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
            <p className="text-xs text-zinc-600">
              AI 会根据标题和摘要自动总结 3-5 个中文关键词
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="journal" className="text-zinc-300">
              期刊/会议（可选）
            </Label>
            <Input
              id="journal"
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
              placeholder="例如：Nature, CVPR 2024, Cell"
              disabled={isBusy}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">
              标签（可选）
            </Label>
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder="输入标签后按 Enter 添加"
              maxTags={5}
              disabled={isBusy}
            />
            {allPresetTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-zinc-500">快速添加:</span>
                {allPresetTags.filter(t => !tags.includes(t)).slice(0, 6).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addPresetTag(tag)}
                    disabled={isBusy}
                    className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || uploading || isExtracting || uploadProgress === 'uploading' || uploadProgress === 'extracting'}
            className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {uploadProgress === 'uploading' && '上传并识别中...'}
                {uploadProgress === 'processing' && '保存中...'}
                {uploadProgress === 'done' && '完成!'}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                上传论文
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
