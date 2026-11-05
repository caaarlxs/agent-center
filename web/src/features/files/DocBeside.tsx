// A file from the conversation, open beside the session panel over the board
// (app/open-session.ts beside), so you read it and write in the conversation
// at once. It comes out from behind the panel's edge (SideFlyout), as wide as
// the board allows up to a page; Files opens it in the Files tab, and Esc or
// the cross closes it.
import { X } from "lucide-react"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { beside, roomBeside, showFile } from "@/app/open-session"
import { SideFlyout } from "@/features/session/SideFlyout"
import { useViewportWidth } from "@/features/session/panel-width"
import { nameOf } from "@/features/conversation/text"
import { Viewer } from "./Files"

const MAX_W = 880

export function DocBeside({ id }: { id: string }) {
  const doc = beside.use()
  const isOpen = doc?.id === id
  // The last file stays drawn while it folds away.
  const last = useRef(doc)
  if (isOpen) last.current = doc
  const shown = last.current
  useViewportWidth() // a new window width, a new room
  const room = roomBeside() || MAX_W
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
    <SideFlyout label="File" isOpen={isOpen} width={Math.min(MAX_W, room)} className="bg-surface">
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
