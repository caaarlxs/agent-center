// Messages sent from here that the session has not received yet. Kept in
// this browser per session (the classic board's "pending" key), so they still
// show after a reload; the transcript clears them once it has them. What the
// server still holds (sent from another window) joins them.
import { useMemo } from "react"
import type { Bridge } from "@/lib/api-types"
import { createStore, persistedStore } from "@/lib/store"

export type Pending = { id: string; text: string; at: number }
export const TTL = 24 * 60 * 60_000

const store = persistedStore<Record<string, Pending[]>>("pending", {})
const fresh = (list: Pending[] | undefined, now = Date.now()) => (list ?? []).filter(p => now - p.at < TTL)

export function usePending(id: string) {
  const all = store.use()
  return useMemo(() => fresh(all[id]), [all, id])
}
const save = (id: string, list: Pending[]) => {
  const { [id]: _, ...rest } = store.get()
  store.set(list.length ? { ...rest, [id]: list } : rest)
}
export const addPending = (id: string, p: Pending) => save(id, [...fresh(store.get()[id]), p])
export const dropPending = (id: string, ids: string[]) => save(id, fresh(store.get()[id]).filter(p => !ids.includes(p.id)))

// Taken back: gone at once, before the server's next answer drops it too.
export const takenBack = createStore<string[]>([])

// Mine first, then what the server holds that is not mine (its id starts with
// the time it was sent); none that was taken back.
export function waitingOf(mine: Pending[], queued: Bridge["queued"], gone: string[] = []): Pending[] {
  const held = queued.filter(q => !mine.some(p => p.id === q.id)).map(q => ({ ...q, at: Number(q.id.split("-")[0]) || 0 }))
  return [...mine, ...held].filter(p => !gone.includes(p.id))
}

// The pending messages the transcript now has, by their text.
export function deliveredOf(pending: Pending[], newUserTexts: string[]): string[] {
  const texts = new Set(newUserTexts.map(t => t.trim()))
  return pending.filter(p => texts.has(p.text.trim())).map(p => p.id)
}

// What a pending message is doing, and whether only Claude desktop can help.
export type Stamp = { text: string; isBad: boolean }
export function stampOf(p: Pending, bridge: Bridge | null, isWorking: boolean): Stamp {
  const refused = bridge?.failed.find(f => f.id === p.id)
  if (refused) return { text: `Could not deliver: ${refused.reason}`, isBad: true }
  if (bridge?.wake?.untrusted) return { text: "Claude does not trust this session's folder: open it in Claude and accept", isBad: true }
  if (bridge?.stuck.includes(p.id)) return { text: "The session did not wake: open it in Claude", isBad: true }
  if (isWorking) return { text: "Queued: delivered when the turn ends", isBad: false }
  return { text: bridge?.isOpen ? "Sending…" : "Waking the session in the background…", isBad: false }
}
