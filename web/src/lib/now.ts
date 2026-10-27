// The time the page shows ages against ("5 min", "waiting 2 h"): one clock for
// the whole page, a tick every 30 seconds, so cards do not redraw each second.
import { useSyncExternalStore } from "react"

const TICK_MS = 30_000
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  timer ??= setInterval(() => ((now = Date.now()), listeners.forEach(l => l())), TICK_MS)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer) (clearInterval(timer), (timer = null))
  }
}

export const useNow = () => useSyncExternalStore(subscribe, () => now)
