// A sticky note on the canvas: drag it by its top strip, size it from its
// corner, change its colour with the dot, delete it with ×. Click its text to
// write; "- [ ] …" lines show as boxes to tick.
import { type Node, type NodeProps, NodeResizer } from "@xyflow/react"
import { X } from "lucide-react"
import { useRef, useState } from "react"
import type { Note } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { NOTE_COLORS, linesOf, toggleItem } from "./notes"
import { useFocusWhenShown } from "./useFocusWhenShown"

export type NoteNodeData = {
  note: Note
  isNew: boolean
  onText: (note: Note, text: string) => void
  onChange: (note: Note) => void
  onRemove: (note: Note) => void
}

const TONE: Record<string, string> = {
  yellow: "bg-amber-200/90 text-amber-950", pink: "bg-pink-200/90 text-pink-950", blue: "bg-sky-200/90 text-sky-950", green: "bg-emerald-200/90 text-emerald-950",
}

export function NoteNode({ data, selected }: NodeProps<Node<NoteNodeData>>) {
  const { note } = data
  const [isEditing, setEditing] = useState(data.isNew)
  const area = useRef<HTMLTextAreaElement>(null)
  useFocusWhenShown(area, isEditing)
  const nextColor = NOTE_COLORS[(NOTE_COLORS.indexOf(note.color as (typeof NOTE_COLORS)[number]) + 1) % NOTE_COLORS.length]
  return (
    <div className={cn("flex size-full flex-col overflow-hidden rounded-md shadow-lg", TONE[note.color] ?? TONE.yellow, note.cardId && "ring-1 ring-black/10")}>
      <NodeResizer isVisible={selected} minWidth={140} minHeight={80} lineClassName="!border-transparent" handleClassName="!size-2 !rounded-sm !border-0 !bg-black/30"
        onResizeEnd={(_, p) => data.onChange({ ...note, w: Math.round(p.width), h: Math.round(p.height) })} />
      <header className="note-drag flex h-5 shrink-0 cursor-grab items-center justify-end gap-1 px-1.5 active:cursor-grabbing">
        <button className="nodrag size-3 rounded-full border border-black/20" style={{ background: "currentColor", opacity: 0.25 }} title={`Colour: ${nextColor}`}
          onClick={() => data.onChange({ ...note, color: nextColor })} />
        <button className="nodrag grid size-4 place-items-center rounded opacity-50 hover:bg-black/10 hover:opacity-100" title="Delete the note" onClick={() => data.onRemove(note)}><X className="size-3" /></button>
      </header>
      {isEditing ? (
        <textarea ref={area} defaultValue={note.text} placeholder="Write a note…" className="nodrag nowheel min-h-0 flex-1 resize-none bg-transparent px-2.5 pb-2 text-[13px] leading-snug outline-none placeholder:text-black/40"
          onChange={e => data.onText(note, e.target.value)} onBlur={() => setEditing(false)} onKeyDown={e => e.key === "Escape" && (e.stopPropagation(), setEditing(false))} />
      ) : (
        <div className="nodrag nowheel min-h-0 flex-1 cursor-text overflow-auto px-2.5 pb-2 text-[13px] leading-snug" onClick={() => setEditing(true)}>
          {!note.text.trim() ? <span className="text-black/40">Write a note…</span> : linesOf(note.text).map((l, i) =>
            l.kind === "item" ? (
              <label key={i} className={cn("flex items-start gap-1.5", l.done && "line-through opacity-60")} onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={l.done} className="mt-0.5" onChange={() => data.onText(note, toggleItem(note.text, i))} />{l.text}
              </label>
            ) : <div key={i}>{l.text || " "}</div>,
          )}
        </div>
      )}
    </div>
  )
}
