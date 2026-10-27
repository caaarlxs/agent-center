// Which session the panel shows, if any, and which of its views: one value
// for the whole page, set by a click on a card, cleared by Esc or the close
// button. Changes, Code and Files are workspaces: they take the whole width.
import { useSyncExternalStore } from "react"

export type Tab = "chat" | "changes" | "code" | "files" | "prs" | "tasks"
export const WORKSPACES: ReadonlySet<Tab> = new Set(["changes", "code", "files"])
export type Open = { id: string; tab: Tab } | null

let open: Open = null
const listeners = new Set<() => void>()
const set = (next: Open) => ((open = next), listeners.forEach(l => l()))

export const openSession = (id: string | null, tab: Tab = "chat") => set(id ? { id, tab } : null)
export const showTab = (tab: Tab) => open && set({ ...open, tab })

export function useOpenSession(): Open {
  return useSyncExternalStore(
    l => (listeners.add(l), () => void listeners.delete(l)),
    () => open,
  )
}
