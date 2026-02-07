import { create } from 'zustand'
import type { RagProgressEvent, RagProgressStage } from '@/lib/rag/progress'

export type RagProgressStateForMessage = {
  stage: RagProgressStage
  attempt?: number
  chunkCount?: number
  hasSufficientChunk?: boolean
  message?: string
  updatedAt: number
}

type RagProgressState = {
  byMessageId: Record<string, RagProgressStateForMessage>
  setForMessage: (messageId: string, ev: RagProgressEvent) => void
  clearForMessage: (messageId: string) => void
  clearAll: () => void
}

export const useRagProgressStore = create<RagProgressState>((set) => ({
  byMessageId: {},
  setForMessage: (messageId, ev) =>
    set((s) => ({
      byMessageId: {
        ...s.byMessageId,
        [messageId]: {
          stage: ev.stage,
          attempt: ev.attempt,
          chunkCount: ev.chunkCount,
          hasSufficientChunk: ev.hasSufficientChunk,
          message: ev.message,
          updatedAt: ev.ts || Date.now(),
        },
      },
    })),
  clearForMessage: (messageId) =>
    set((s) => {
      const next = { ...s.byMessageId }
      delete next[messageId]
      return { byMessageId: next }
    }),
  clearAll: () => set({ byMessageId: {} }),
}))

