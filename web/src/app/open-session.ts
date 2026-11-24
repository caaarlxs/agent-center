// Which session the panel shows, if any, and which of its views: one value
// for the whole page, set by a click on a card, cleared by Esc or the close
// button. Changes, Code and Files are workspaces: they take the whole width.
// file: a file to show in Files or Changes (a link in the conversation).
import { useSyncExternalStore } from "react"
import { focusComposer } from "@/features/conversation/send"
import { createStore, persistedStore } from "@/lib/store"

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
// workspace (which takes the whole width). Two more things open there in its
// place (kind): "page", where `path` is the address of a page this machine
// serves (features/preview; empty until one is typed), and "simulator", an
// iOS simulator running here (features/simulator).
export const beside = createStore<{ id: string; path: string; kind?: "page" | "simulator" } | null>(null)
const ROOM_MIN = 420 // the board's width a file needs beside the panel
export const opensBeside = (tab: Tab, room: number) => !WORKSPACES.has(tab) && room >= ROOM_MIN
// The board's width to the left of the panel (the panel may sit over it).
export function roomBeside() {
  const panel = document.querySelector("[data-panel]")?.getBoundingClientRect()
  const board = document.querySelector("main")?.getBoundingClientRect()
  return panel && board ? Math.max(0, panel.left - board.left) : 0
}

// A page or a simulator may also lie over the sidebar: all the window to the
// left of the panel is its room, and a phone's width is enough.
const PANE_MIN = 320
export const roomLeft = () => Math.max(0, document.querySelector("[data-panel]")?.getBoundingClientRect().left ?? 0)
const opensPane = (tab: Tab) => !WORKSPACES.has(tab) && roomLeft() >= PANE_MIN

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
// A file or folder of the open session's repository, in its Code tab: the
// file opens in the editor (at its line), a folder unfolds in the tree. `at`
// tells two clicks on the same place apart.
export type CodeTarget = { id: string; path: string; line?: number; isDir: boolean; at: number }
export const codeTarget = createStore<CodeTarget | null>(null)
export function showInCode(place: { path: string; line?: number; isDir: boolean }) {
  if (!open) return
  codeTarget.set({ id: open.id, ...place, at: Date.now() })
  set({ id: open.id, tab: "code" })
}
// One of the open session's files, in its Files tab.
export const showFile = (file: string) => open && set({ id: open.id, tab: "files", file })
// A file from the conversation: beside the panel when the board has room, else in Files.
export function openFile(file: string) {
  if (!open) return
  if (opensBeside(open.tab, roomBeside())) beside.set({ id: open.id, path: file })
  else showFile(file)
}
// A page this machine serves (a link in the conversation, the panel's
// Preview button): beside the panel when the board has room, else in a new
// window. The last one of each session is kept for that button.
export const previews = persistedStore<Record<string, string>>("previews", {})
const PREVIEWS_KEPT = 50
export function openPreview(url: string) {
  if (!open) return
  if (url) previews.set(Object.fromEntries([...Object.entries(previews.get()).filter(([id]) => id !== open!.id).slice(1 - PREVIEWS_KEPT), [open.id, url]]))
  if (opensPane(open.tab)) beside.set({ id: open.id, path: url, kind: "page" })
  else if (url) window.open(url, "_blank", "noreferrer")
}
// The simulator running on this machine, beside the panel (the panel's button; again: closed).
export function toggleSimulator() {
  if (!open) return
  const isOut = beside.get()?.id === open.id && beside.get()?.kind === "simulator"
  beside.set(isOut || !opensPane(open.tab) ? null : { id: open.id, path: "", kind: "simulator" })
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
