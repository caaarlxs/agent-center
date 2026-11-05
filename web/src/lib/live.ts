// The board's live state: the server sends a snapshot of every session when
// the page connects, then only the cards that changed (/api/stream,
// server-sent events; live-patch.ts), so a card that did not change stays
// the same object and does not redraw. It lives
// here, in one place; a component reads the part it needs with useLive, and
// redraws only when that part changes.
import { useSyncExternalStore } from "react"
import type { Snapshot } from "./api-types"
import { applyPatch, type Patch } from "./live-patch"

type Live = { snapshot: Snapshot | null; isConnected: boolean; lostAt: number | null }

let state: Live = { snapshot: null, isConnected: false, lostAt: null }
const listeners = new Set<() => void>()
let source: EventSource | null = null

function set(next: Partial<Live>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

// One connection for the page, opened by the first reader. EventSource
// reconnects by itself; while it is down, lostAt says since when.
function connect() {
  if (source) return
  source = new EventSource("/api/stream")
  source.onopen = () => set({ isConnected: true, lostAt: null })
  source.onerror = () => set({ isConnected: false, lostAt: state.lostAt ?? Date.now() })
  source.onmessage = e => set({ snapshot: JSON.parse(e.data) as Snapshot, isConnected: true, lostAt: null })
  source.addEventListener("patch", e => state.snapshot && set({ snapshot: applyPatch(state.snapshot, JSON.parse((e as MessageEvent<string>).data) as Patch), isConnected: true, lostAt: null }))
}

function subscribe(listener: () => void) {
  connect()
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

// The live state now, outside React (a handler that needs the newest).
export const live = () => state

// A slice of the live state. The selector must return the same value (or a
// value from the snapshot itself) while nothing changed, or React redraws.
export function useLive<T>(select: (live: Live) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}
