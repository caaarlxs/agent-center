// What changes in an open session, told by the server as it happens
// (/api/sessions/<id>/events, lib/session-events.ts): "messages" when its
// transcript grows, "bridge" when its mod writes for it, "stream" with the
// answer the model is writing. One connection per session, shared by
// whoever listens. A reader asks again on its own only now and then
// (`every`), or often while the connection is down.
import { useEffect, useRef, useState } from "react"

type Kind = "messages" | "bridge" | "stream"
type Entry = { source: EventSource; listeners: Set<(kind: Kind, data: string) => void>; isUp: boolean }
const entries = new Map<string, Entry>()

function join(id: string, listener: (kind: Kind, data: string) => void) {
  let entry = entries.get(id)
  if (!entry) {
    const source = new EventSource(`/api/sessions/${encodeURIComponent(id)}/events`)
    const made: Entry = { source, listeners: new Set(), isUp: false }
    source.onopen = () => (made.isUp = true)
    source.onerror = () => (made.isUp = false) // EventSource reconnects by itself
    for (const kind of ["messages", "bridge", "stream"] as const)
      source.addEventListener(kind, e => made.listeners.forEach(l => l(kind, (e as MessageEvent<string>).data)))
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

// The answer the model is writing in this session (mod v10), while it does:
// its text so far. Once the step ends it stays until the transcript has it
// (`itemCount` grows) or for a moment; a stream that stopped long ago (its
// session closed mid-answer) is not shown.
export type Live = { turnId: string; step: number; text: string; done: boolean; at: number }
const KEEP_DONE_MS = 2500
const STALE_MS = 60_000

// The text to show: none for a stream long stopped, nor once the transcript
// grew past where it stood when the step ended.
export function shownLive(live: Live | null, itemCount: number, countAtDone: number | null, now: number) {
  if (!live?.text || now - live.at > STALE_MS) return null
  if (live.done && countAtDone !== null && itemCount > countAtDone) return null
  return live.text
}

export function useLiveAnswer(id: string, itemCount: number) {
  const [live, setLive] = useState<Live | null>(null)
  const countAtDone = useRef<number | null>(null)
  const count = useRef(itemCount)
  count.current = itemCount
  useEffect(() => {
    setLive(null)
    const link = join(id, (kind, data) => {
      if (kind !== "stream") return
      const next = (() => {
        try {
          return JSON.parse(data) as Live | null
        } catch {
          return null
        }
      })()
      countAtDone.current = next?.done ? count.current : null
      setLive(next)
    })
    return () => link.leave()
  }, [id])
  useEffect(() => {
    if (!live?.done) return
    const timer = setTimeout(() => setLive(null), KEEP_DONE_MS)
    return () => clearTimeout(timer)
  }, [live])
  return shownLive(live, itemCount, countAtDone.current, Date.now())
}
