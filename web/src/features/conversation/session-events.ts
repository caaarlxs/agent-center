// What changes in an open session, told by the server as it happens
// (/api/sessions/<id>/events, lib/session-events.ts): "messages" when its
// transcript grows, "bridge" when its mod writes for it. One connection per
// session, shared by whoever listens. A reader asks again on its own only
// now and then (`every`), or often while the connection is down.
import { useEffect, useRef } from "react"

type Kind = "messages" | "bridge"
type Entry = { source: EventSource; listeners: Set<(kind: Kind) => void>; isUp: boolean }
const entries = new Map<string, Entry>()

function join(id: string, listener: (kind: Kind) => void) {
  let entry = entries.get(id)
  if (!entry) {
    const source = new EventSource(`/api/sessions/${encodeURIComponent(id)}/events`)
    const made: Entry = { source, listeners: new Set(), isUp: false }
    source.onopen = () => (made.isUp = true)
    source.onerror = () => (made.isUp = false) // EventSource reconnects by itself
    for (const kind of ["messages", "bridge"] as const) source.addEventListener(kind, () => made.listeners.forEach(l => l(kind)))
    entries.set(id, (entry = made))
  }
  entry.listeners.add(listener)
  const joined = entry
  return {
    isUp: () => joined.isUp,
    leave: () => {
      joined.listeners.delete(listener)
      if (joined.listeners.size) return
      joined.source.close()
      entries.delete(id)
    },
  }
}

// Calls `read` when the session tells `kind`, and on its own every
// `every.connected` ms (every `every.lost` while the connection is down).
export function useSessionEvents(id: string, kind: Kind, read: () => void, every: { connected: number; lost: number }) {
  const latest = useRef(read)
  latest.current = read
  useEffect(() => {
    let last = Date.now()
    const run = () => ((last = Date.now()), latest.current())
    const link = join(id, k => k === kind && run())
    const tick = setInterval(() => Date.now() - last >= (link.isUp() ? every.connected : every.lost) && run(), every.lost)
    return () => (clearInterval(tick), link.leave())
  }, [id, kind, every.connected, every.lost])
}
