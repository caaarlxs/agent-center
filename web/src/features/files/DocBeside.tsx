// A file from the conversation, open beside the session panel over the board
// (app/open-session.ts beside), so you read it and write in the conversation
// at once. It comes out from behind the panel's edge (SideFlyout), as wide as
// you dragged its left edge (a double-click: the default), within the board;
// Files opens it in the Files tab, and Esc or the cross closes it.
import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { persistedStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { beside, roomBeside, showFile } from "@/app/open-session"
import { SideFlyout } from "@/features/session/SideFlyout"
import { useViewportWidth } from "@/features/session/panel-width"
import { nameOf } from "@/features/conversation/text"
import { Viewer } from "./Files"
import { MIN_W, docWidth } from "./beside"

const savedWidth = persistedStore<number | null>("docW", null)

// The left edge: drag it to change the width.
function Edge({ width, room, onWidth }: { width: number; room: number; onWidth: (w: number | null) => void }) {
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const from = { x: e.clientX, width }
    document.documentElement.classList.add("resizing")
    const move = (ev: PointerEvent) => onWidth(docWidth(from.width + from.x - ev.clientX, room))
    const up = () => (document.documentElement.classList.remove("resizing"), removeEventListener("pointermove", move), removeEventListener("pointerup", up))
    addEventListener("pointermove", move)
    addEventListener("pointerup", up)
  }
  return <div onPointerDown={start} onDoubleClick={() => onWidth(null)} title="Drag to change the width · double-click: default width"
    className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-brand after:opacity-0 after:transition-opacity hover:after:opacity-100" />
}

export function DocBeside({ id }: { id: string }) {
  const doc = beside.use()
  const isOpen = doc?.id === id
  // The last file stays drawn while it folds away.
  const last = useRef(doc)
  if (isOpen) last.current = doc
  const shown = last.current
  useViewportWidth() // a new window width, a new room
  const room = Math.max(MIN_W, roomBeside())
  const saved = savedWidth.use()
  const [dragged, setDragged] = useState<number | null>(null) // while the edge moves
  const width = docWidth(dragged ?? saved, room)
  const onWidth = (w: number | null) => (w === null ? (savedWidth.set(null), setDragged(null)) : setDragged(w))
  useEffect(() => {
    const keep = () => setDragged(w => (w !== null && savedWidth.set(w), null))
    addEventListener("pointerup", keep)
    return () => removeEventListener("pointerup", keep)
  }, [])
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
    <SideFlyout label="File" isOpen={isOpen} width={width} className="relative bg-surface">
      {shown && <Edge width={width} room={room} onWidth={onWidth} />}
      {shown && (
        <Viewer key={shown.path} id={id} isCompact file={{ path: shown.path, name: nameOf(shown.path), size: 0, modifiedAt: 0, source: "written" }}
          actions={<>
            <Button variant="ghost" onClick={() => showFile(shown.path)} title="Open it in the Files tab">Files</Button>
            <button className="inline-grid size-7 place-items-center rounded-[7px] text-text-muted hover:bg-press hover:text-text active:scale-[0.92]" onClick={() => beside.set(null)} title="Close (Esc)"><X className="size-4" /></button>
          </>} />
      )}
    </SideFlyout>
  )
}
