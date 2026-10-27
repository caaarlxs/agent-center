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

// A value kept in this browser as the classic board keeps it ("ac.<key>",
// JSON), so a choice made in one board holds in the other.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`ac.${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}
export function keep(key: string, value: unknown) {
  try {
    localStorage.setItem(`ac.${key}`, JSON.stringify(value))
  } catch {}
}

// A store kept in this browser, under the key the classic board uses too
// ("ac.<key>", JSON): a choice made in one board holds in the other.
export function persistedStore<T>(key: string, fallback: T) {
  const store = createStore(load(key, fallback))
  return { ...store, set: (next: T) => (store.set(next), keep(key, next)) }
}
