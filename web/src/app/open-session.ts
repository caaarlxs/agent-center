// Which session the panel shows, if any, and which of its views: one value
// for the whole page, set by a click on a card, cleared by Esc or the close
// button. Changes, Code and Files are workspaces: they take the whole width.
// file: a file to show in Files or Changes (a link in the conversation).
import { useSyncExternalStore } from "react"
import { focusComposer } from "@/features/conversation/send"
import { createStore } from "@/lib/store"

export type Tab = "chat" | "changes" | "commits" | "code" | "files" | "prs" | "ticket" | "tasks" | "trace"
export const WORKSPACES: ReadonlySet<Tab> = new Set(["changes", "commits", "code", "files"])
export type Open = { id: string; tab: Tab; file?: string } | null

let open: Open = null
const listeners = new Set<() => void>()
const set = (next: Open) => {
  if (!next || next.id !== beside.get()?.id || WORKSPACES.has(next.tab)) beside.set(null)
  open = next
  listeners.forEach(l => l())
}

// A file open beside the panel, over the board, while the conversation stays
// where it is; it closes when the panel changes session, closes, or shows a
// workspace (which takes the whole width).
export const beside = createStore<{ id: string; path: string } | null>(null)
const ROOM_MIN = 420 // the board's width a file needs beside the panel
export const opensBeside = (tab: Tab, room: number) => !WORKSPACES.has(tab) && room >= ROOM_MIN
// The board's width to the left of the panel (the panel may sit over it).
export function roomBeside() {
  const panel = document.querySelector("[data-panel]")?.getBoundingClientRect()
  const board = document.querySelector("main")?.getBoundingClientRect()
  return panel && board ? Math.max(0, panel.left - board.left) : 0
}

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
// A file from the conversation: beside the panel when the board has room, else in Files.
export function openFile(file: string) {
  if (!open) return
  if (opensBeside(open.tab, roomBeside())) beside.set({ id: open.id, path: file })
  else showFile(file)
}
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
