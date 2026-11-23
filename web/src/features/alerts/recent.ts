// The sessions that just told you something (finished, asked, need your
// approval), newest first: L opens the newest, and the canvas points at the
// ones off screen until you open them. Kept half an hour, ten at most.
import { toast } from "@/lib/notify"
import { openSession } from "@/app/open-session"
import { focusCard } from "@/app/view-state"
import { createStore } from "@/lib/store"
import { WHAT, type AlertEvent } from "./events"
import { sessionToasts } from "./session-toasts"

export type RecentEnd = { id: string; at: number }
const KEEP_MS = 30 * 60_000
const KEEP = 10

export const recentEnds = createStore<RecentEnd[]>([])

export function withEnds(list: RecentEnd[], ids: string[], now: number): RecentEnd[] {
  const fresh = ids.map(id => ({ id, at: now }))
  return [...fresh, ...list.filter(e => !ids.includes(e.id) && now - e.at < KEEP_MS)].slice(0, KEEP)
}

// Where the arrow toward a card off screen sits (on the view's edge, `margin`
// in) and its angle toward the card, in degrees; null when the card shows.
export function edgeOf(point: { x: number; y: number }, view: { width: number; height: number }, margin = 28) {
  if (point.x >= 0 && point.x <= view.width && point.y >= 0 && point.y <= view.height) return null
  const x = Math.min(view.width - margin, Math.max(margin, point.x))
  const y = Math.min(view.height - margin, Math.max(margin, point.y))
  return { x, y, angle: Math.round((Math.atan2(point.y - y, point.x - x) * 180) / Math.PI) }
}

// A session's card, wherever it shows (canvas, Inbox, Board), flashes once.
export function flashCard(id: string) {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)) {
    el.classList.remove("flash-once")
    void el.offsetWidth // restart the animation
    el.classList.add("flash-once")
    setTimeout(() => el.classList.remove("flash-once"), 1600)
  }
}

// L: the newest session that told you something, opened (and, on the
// canvas, gone to).
export function openLast() {
  const last = recentEnds.get()[0]
  if (!last) return void toast("No session has finished or asked anything yet")
  openSession(last.id)
  focusCard(last.id)
}

// Writing: the focus in a box you type in. A session that only finished
// does not interrupt it with a toast (its card still flashes, L opens it).
type Focused = { tagName: string; type?: string; isContentEditable?: boolean }
export const isWriting = (el: Focused | null) =>
  !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(el.type ?? "")) || !!el.isContentEditable)

// Which one told you: its name with Open (not the session you are reading
// now, nor one that only finished while you write, nor any with them off in
// Setup), its card flashing, and first for L.
export function tellWhich(events: AlertEvent[], reading: string | undefined) {
  recentEnds.set(withEnds(recentEnds.get(), events.map(e => e.card.id), Date.now()))
  for (const { card, kind } of events) {
    flashCard(card.id)
    if (sessionToasts.get() === "off" || (reading === card.id && document.hasFocus())) continue
    if (kind === "done" && document.hasFocus() && isWriting(document.activeElement as HTMLElement | null)) continue
    toast(`“${card.title}” ${WHAT[kind]}`, { duration: 8000, action: { label: "Open", onClick: () => openSession(card.id) } })
  }
}
