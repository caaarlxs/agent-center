// Which session the panel shows, if any: one value for the whole page, set by
// a click on a card and cleared by Esc or the close button.
import { useSyncExternalStore } from "react"

let openId: string | null = null
const listeners = new Set<() => void>()

export function openSession(id: string | null) {
  if (id === openId) return
  openId = id
  listeners.forEach(l => l())
}

export function useOpenSession(): string | null {
  return useSyncExternalStore(
    l => (listeners.add(l), () => void listeners.delete(l)),
    () => openId,
  )
}
