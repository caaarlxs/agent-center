// Which session the panel shows, if any, and which of its views: one value
// for the whole page, set by a click on a card, cleared by Esc or the close
// button. Changes, Code and Files are workspaces: they take the whole width.
// file: a file to show in Files or Changes (a link in the conversation).
import { useSyncExternalStore } from "react"
import { focusComposer } from "@/features/conversation/send"

export type Tab = "chat" | "changes" | "commits" | "code" | "files" | "prs" | "tasks"
export const WORKSPACES: ReadonlySet<Tab> = new Set(["changes", "commits", "code", "files"])
export type Open = { id: string; tab: Tab; file?: string } | null

let open: Open = null
const listeners = new Set<() => void>()
const set = (next: Open) => ((open = next), listeners.forEach(l => l()))

// Opened with a click (a card, a row): the cursor waits in the reply box,
// ready to type. Not from the keyboard (the shortcuts would stop working) nor
// in a narrow window (the keyboard would cover the conversation).
let lastPointer = 0
if (typeof window !== "undefined") addEventListener("pointerdown", () => (lastPointer = Date.now()), true)

export function openSession(id: string | null, tab: Tab = "chat") {
  set(id ? { id, tab } : null)
  if (id && tab === "chat" && Date.now() - lastPointer < 1000 && !matchMedia("(max-width: 860px)").matches) setTimeout(() => focusComposer(id), 120)
}
export const openNow = () => open
export const showTab = (tab: Tab) => open && set({ id: open.id, tab })
// One of the open session's files, in its Files tab.
export const showFile = (file: string) => open && set({ id: open.id, tab: "files", file })
// Claude's own notes (memory, task lists) and temporary files: Changes leaves
// them out (lib/session-changes.ts NOT_WORK), so they open in Files.
export const isNotes = (path: string) => /^(?:\/private)?\/tmp\/|\/\.claude\//.test(path)
// One of its changed files, in Changes; that tab sends it on to Files when the diff lacks it.
export const showChange = (file: string) => (isNotes(file) ? showFile(file) : open && set({ id: open.id, tab: "changes", file }))
// The file was shown: the next click on the same one shows it again.
export const doneWithFile = () => open?.file && set({ id: open.id, tab: open.tab })

export function useOpenSession(): Open {
  return useSyncExternalStore(
    l => (listeners.add(l), () => void listeners.delete(l)),
    () => open,
  )
}
