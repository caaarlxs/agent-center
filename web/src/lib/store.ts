// A value the whole page shares (which repo the canvas shows, the card to go
// to): set from anywhere, read with its hook, which redraws on a change.
import { useSyncExternalStore } from "react"

export function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach(l => l())
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  }
}
