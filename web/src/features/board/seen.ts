// What you open counts as seen, and so does what arrives while it is open
// (main.js:440-447, 493-496): shown at once, told to the server at most every
// 3 s. "Mark to review" keeps it unread until you open it again.
import { useEffect } from "react"
import { post } from "@/lib/api"
import { useOpenSession } from "@/app/open-session"
import { overrides, useBoardCards } from "./state"

const SEEN_MS = 3000
const posted = new Map<string, number>()
const keptUnread = new Set<string>()

export const keepUnread = (id: string) => keptUnread.add(id)

function markSeen(id: string) {
  overrides.set({ ...overrides.get(), [id]: { ...overrides.get()[id], isUnread: false, at: Date.now() } })
  if (Date.now() - (posted.get(id) ?? 0) < SEEN_MS) return
  posted.set(id, Date.now())
  void post(`/api/sessions/${encodeURIComponent(id)}/seen`).catch(() => {})
}

export function useMarkSeen() {
  const open = useOpenSession()
  const cards = useBoardCards()
  const id = open?.id ?? null
  // Opening it again ends a "Mark to review".
  useEffect(() => void (id && keptUnread.delete(id)), [id])
  const isUnread = !!id && cards.some(c => c.id === id && c.isUnread)
  useEffect(() => {
    if (id && isUnread && !keptUnread.has(id)) markSeen(id)
  }, [id, isUnread])
}
