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

// A store kept in this browser, under the key the classic board uses too
// ("ac.<key>", JSON): a choice made in one board holds in the other.
export function persistedStore<T>(key: string, fallback: T) {
  let initial = fallback
  try {
    const raw = localStorage.getItem(`ac.${key}`)
    if (raw !== null) initial = JSON.parse(raw) as T
  } catch {}
  const store = createStore(initial)
  return {
    ...store,
    set(next: T) {
      store.set(next)
      try {
        localStorage.setItem(`ac.${key}`, JSON.stringify(next))
      } catch {}
    },
  }
}
