// Tells you what your sessions did, on every update of the board: the Dock
// badge counts who asks; then the chime, the Mac's voice, the notification in
// another window, and the once-only notice of the sessions with the bell.
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { post } from "@/lib/api"
import { useLive } from "@/lib/live"
import { openNow } from "@/app/open-session"
import { chime } from "./chime"
import { WHAT, eventsOf, seenOf, type Seen } from "./events"
import { canNotify, showNotice, sound, speech, watched } from "./prefs"

const upper = (s: string) => s[0].toUpperCase() + s.slice(1)
// What a notification says when the session's question is not known.
const NOTICE = { done: "Finished", ask: "Asking you something", permission: "Needs approval to continue" }

export function useAlerts() {
  const cards = useLive(l => l.snapshot?.cards)
  const seen = useRef<Seen | null>(null)
  useEffect(() => {
    if (!cards) return
    const asking = cards.filter(c => c.column === "asking")
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    void (asking.length ? nav.setAppBadge?.(asking.length) : nav.clearAppBadge?.())?.catch(() => {})
    const events = eventsOf(seen.current, cards)
    seen.current = seenOf(cards)
    if (!events.length) return

    const isAsk = events.some(e => e.kind !== "done")
    if (sound.get() === "on") chime(isAsk ? "ask" : "done")

    // The Mac reads the recap aloud; not the session you are reading now.
    const voice = speech.get()
    const bell = new Set(watched.get())
    const reading = openNow()?.id
    if (voice.mode !== "off")
      for (const { card, kind } of events)
        if ((voice.mode === "all" || bell.has(card.id)) && !(reading === card.id && document.hasFocus()))
          void post(`/api/sessions/${card.id}/speak`, { kind, voice: voice.voice, rate: voice.rate }).catch(() => {})

    // The bell: told once, even with the sound off, then let go.
    const told = events.filter(e => bell.has(e.card.id))
    if (told.length) {
      if (sound.get() !== "on") chime(told.some(e => e.kind !== "done") ? "ask" : "done")
      for (const { card, kind } of told) {
        toast(`“${card.title}” ${WHAT[kind]}`)
        if (canNotify() && !document.hasFocus()) void showNotice(card.title, upper(WHAT[kind]), card.id)
      }
      watched.set(watched.get().filter(id => !told.some(e => e.card.id === id)))
    }

    if (!canNotify() || document.hasFocus()) return
    for (const { card, kind } of events)
      if (kind !== "done" && !bell.has(card.id)) void showNotice(card.title, card.ask || NOTICE[kind], card.id)
  }, [cards])
}
