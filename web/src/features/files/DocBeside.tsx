// A file from the conversation (or a local page: features/preview, or a
// simulator: features/simulator), open
// beside the session panel over the board
// (app/open-session.ts beside), so you read it and write in the conversation
// at once. It comes out from behind the panel's edge (SideFlyout), as wide as
// you dragged its left edge (a double-click: the default), within the board;
// Files opens it in the Files tab, and Esc or the cross closes it.
import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { persistedStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { beside, openPreview, roomBeside, roomLeft, showFile } from "@/app/open-session"
import { SideFlyout } from "@/features/session/SideFlyout"
import { useViewportWidth } from "@/features/session/panel-width"
import { nameOf } from "@/features/conversation/text"
import { Preview } from "@/features/preview/Preview"
import { Simulator } from "@/features/simulator/Simulator"
import { Viewer } from "./Files"
import { MIN_W, PANE_MIN_W, docWidth } from "./beside"

const savedWidth = persistedStore<number | null>("docW", null) // a file's
const savedPaneWidth = persistedStore<number | null>("paneW", null) // a page's or a simulator's: narrower, kept apart

// The left edge, inside the side (where the side fills the window to its
// left edge, it is still there to take): drag it to change the width.
// The pointer is held by the edge while it moves, so a page or a picture
// under it (an iframe would keep the moves to itself) never takes the drag.
function Edge({ width, room, min, onWidth }: { width: number; room: number; min: number; onWidth: (w: number | null) => void }) {
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const edge = e.currentTarget
    edge.setPointerCapture(e.pointerId)
    const from = { x: e.clientX, width }
    document.documentElement.classList.add("resizing")
    const move = (ev: PointerEvent) => onWidth(docWidth(from.width + from.x - ev.clientX, room, min))
    const up = () => {
      document.documentElement.classList.remove("resizing")
      edge.removeEventListener("pointermove", move)
      edge.removeEventListener("pointerup", up)
      edge.removeEventListener("lostpointercapture", up)
    }
    edge.addEventListener("pointermove", move)
    edge.addEventListener("pointerup", up)
    edge.addEventListener("lostpointercapture", up)
  }
  return <div onPointerDown={start} onDoubleClick={() => onWidth(null)} title="Drag to change the width · double-click: default width"
    className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-brand after:opacity-0 after:transition-opacity hover:after:opacity-100" />
}

// Where the panel's left edge is, kept as the panel changes width.
function usePanelLeft() {
  const [left, setLeft] = useState(roomLeft)
  useEffect(() => {
    const panel = document.querySelector("[data-panel]")
    if (!panel) return
    const watch = new ResizeObserver(() => setLeft(roomLeft()))
    watch.observe(panel)
    return () => watch.disconnect()
  }, [])
  return left
}

export function DocBeside({ id }: { id: string }) {
  const doc = beside.use()
  const isOpen = doc?.id === id
  // The last file stays drawn while it folds away.
  const last = useRef(doc)
  if (isOpen) last.current = doc
  const shown = last.current
  useViewportWidth() // a new window width, a new room
  usePanelLeft() // a panel made wider or narrower, a new room too
  const min = shown?.kind ? PANE_MIN_W : MIN_W
  const room = shown?.kind ? roomLeft() : Math.max(MIN_W, roomBeside()) // a page or a simulator may lie over the sidebar too
  const widths = shown?.kind ? savedPaneWidth : savedWidth
  const saved = widths.use()
  const [dragged, setDragged] = useState<number | null>(null) // while the edge moves
  const width = docWidth(dragged ?? saved, room, min)
  const onWidth = (w: number | null) => (w === null ? (widths.set(null), setDragged(null)) : setDragged(w))
  useEffect(() => {
    const keep = () => setDragged(w => (w !== null && widths.set(w), null))
    addEventListener("pointerup", keep, true) // capture: the edge holds the pointer, its pointerup reaches the window first here
    return () => removeEventListener("pointerup", keep, true)
  }, [widths])
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog], [role=menu]")) return
      if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable=true], .monaco-editor")) return
      e.preventDefault()
      e.stopImmediatePropagation()
      beside.set(null)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [isOpen])
  return (
    <SideFlyout label={shown?.kind === "page" ? "Preview" : shown?.kind === "simulator" ? "Simulator" : "File"} isOpen={isOpen} width={width} className="relative bg-surface">
      {shown && <Edge width={width} room={room} min={min} onWidth={onWidth} />}
      {shown?.kind === "page" && <Preview url={shown.path} onUrl={openPreview} onClose={() => beside.set(null)} />}
      {shown?.kind === "simulator" && <Simulator onClose={() => beside.set(null)} />}
      {shown && !shown.kind && (
        <Viewer key={shown.path} id={id} isCompact file={{ path: shown.path, name: nameOf(shown.path), size: 0, modifiedAt: 0, source: "written" }}
          actions={<>
            <Button variant="ghost" onClick={() => showFile(shown.path)} title="Open it in the Files tab">Files</Button>
            <button className="inline-grid size-7 place-items-center rounded-[7px] text-text-muted hover:bg-press hover:text-text active:scale-[0.92]" onClick={() => beside.set(null)} title="Close (Esc)"><X className="size-4" /></button>
          </>} />
      )}
    </SideFlyout>
  )
}
