import { create } from 'zustand'
import type { RetrievalAttempt } from '@/lib/rag/types'

export type RagDebugData = {
  traceId: string
  paperId: string
  userQuestion: string
  contextMode?: 'rag' | 'full'
  fullContext?: {
    totalChunks: number
    includedChunks: number
    maxChars: number
    maxChunks: number
    charCount: number
    truncated: boolean
    firstChunkIndex?: number
    lastChunkIndex?: number
  } | null
  precheck?: {
    isPaperRelated: boolean
    canAnswerDirectly: boolean
    reason?: string
  } | null
  attempts: RetrievalAttempt[]
  usedAttempt: number
  usedChunkIds: string[]
  createdAt: number
}

type RagDebugState = {
  byMessageId: Record<string, RagDebugData>
  setForMessage: (messageId: string, data: RagDebugData) => void
  clearForMessage: (messageId: string) => void
  clearAll: () => void
}

export const useRagDebugStore = create<RagDebugState>((set) => ({
  byMessageId: {},
  setForMessage: (messageId, data) =>
    set((s) => ({
      byMessageId: { ...s.byMessageId, [messageId]: data },
    })),
  clearForMessage: (messageId) =>
    set((s) => {
      const next = { ...s.byMessageId }
      delete next[messageId]
      return { byMessageId: next }
    }),
  clearAll: () => set({ byMessageId: {} }),
}))

