// What the Pipeline did that you have not looked at: the agents at work, and
// those that ended (ready or failed) after you last opened them there. A
// question waiting for you is told apart (the sidebar's amber count). Kept in
// this browser; what had ended before this began counts as read.
import type { PipelineState } from "@server/pipeline"
import { persistedStore } from "@/lib/store"

export type Seen = { epoch: number; read: Record<string, number> }
const seen = persistedStore<Seen | null>("pipelineSeen", null)
if (!seen.get()) seen.set({ epoch: Date.now(), read: {} }) // the first look starts the clock

export function pipelineCounts(items: Pick<PipelineState, "key" | "status" | "endedAt">[], s: Seen) {
  const toRead = items.filter(i => (i.status === "ready" || i.status === "failed") && (i.endedAt ?? 0) > (s.read[i.key] ?? s.epoch)).length
  return { working: items.filter(i => i.status === "running").length, toRead }
}

// The counts for the sidebar.
export function usePipelineCounts(items: Pick<PipelineState, "key" | "status" | "endedAt">[]) {
  return pipelineCounts(items, seen.use() ?? { epoch: Date.now(), read: {} })
}

// Opened in the Pipeline: read until it ends again.
export function markRead(key: string) {
  const s = seen.get() ?? { epoch: Date.now(), read: {} }
  seen.set({ ...s, read: { ...s.read, [key]: Date.now() } })
}
