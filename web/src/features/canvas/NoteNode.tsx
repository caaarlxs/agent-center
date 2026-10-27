// A sticky note on the canvas (canvas-notes.js Note): drag it by its top
// strip (next to a card it attaches and moves with it), size it from its
// corner, change its colour with the dot, add a box, delete it with ×.
// Click its text to write; "- [ ] …" lines show as boxes to tick, and Enter
// on one starts the next.
import { type Node, type NodeProps, NodeResizeControl, useStore } from "@xyflow/react"
import { Link, ListChecks, X } from "lucide-react"
import { type CSSProperties, useRef, useState } from "react"
import type { Note } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { GRID } from "./geometry"
import { NOTE_COLORS, continueList, linesOf, tally, toggleItem, withItem } from "./notes"
import { useFocusWhenShown } from "./useFocusWhenShown"

export type NoteNodeData = {
  note: Note
  cardTitle: string | null // the card it is attached to, if any
  isNew: boolean
  onText: (note: Note, text: string) => void
  onChange: (note: Note) => void
  onRemove: (note: Note) => void
}

const HUE: Record<string, string> = { yellow: "#eab308", pink: "#ec4899", blue: "#3b82f6", green: "#22c55e" }
const mix = (pct: number, base = "transparent") => `color-mix(in srgb, var(--note) ${pct}%, ${base})`
const noteBtn = "nodrag inline-flex size-[18px] flex-none items-center justify-center rounded-[5px] text-text-muted opacity-0 transition-[opacity,background-color] duration-120 group-hover/note:opacity-100 group-focus-within/note:opacity-100 hover:bg-press hover:text-text [&_svg]:size-3"

export function NoteNode({ data, selected, dragging }: NodeProps<Node<NoteNodeData>>) {
  const { note } = data
  const unscale = useStore(s => 1 / s.transform[2])
  const [isEditing, setEditing] = useState(data.isNew)
  const area = useRef<HTMLTextAreaElement>(null)
  useFocusWhenShown(area, isEditing)
  const nextColor = NOTE_COLORS[(NOTE_COLORS.indexOf(note.color as (typeof NOTE_COLORS)[number]) + 1) % NOTE_COLORS.length]
  const count = tally(note.text)
  const style = {
    "--note": HUE[note.color] ?? HUE.yellow,
    background: mix(16, "var(--surface)"),
    borderColor: mix(45, "var(--line)"),
    boxShadow: dragging ? "var(--shadow-pop)" : selected ? `0 0 0 3px var(--brand-soft), 0 0 0 1.5px var(--brand)` : "0 1px 2px rgb(0 0 0 / 0.08)",
    ...(dragging ? { transform: "rotate(-1deg)" } : {}),
  } as CSSProperties
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") return void (e.stopPropagation(), e.currentTarget.blur())
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return
    const ta = e.currentTarget
    const next = continueList(ta.value, ta.selectionStart)
    if (!next) return
    e.preventDefault()
    ta.value = next.text
    ta.setSelectionRange(next.caret, next.caret)
    data.onText(note, next.text)
  }
  return (
    <div style={style}
      className="group/note flex size-full flex-col rounded-[10px] border transition-shadow duration-120 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--note)_55%,transparent)]">
      <header className={cn("note-drag flex h-[22px] flex-none items-center gap-1.5 rounded-t-[9px] pr-1 pl-2", dragging ? "cursor-grabbing" : "cursor-grab")}
        style={{ background: mix(data.cardTitle ? 40 : 28) }}
        title={data.cardTitle ? `Attached to “${data.cardTitle}”: it moves with the card. Drag it away to detach it` : "Drag to move the note; drop it next to a card to attach it"}>
        <button className="nodrag size-[11px] flex-none rounded-full border-0 p-0" style={{ background: "var(--note)" }} title="Change the colour" onClick={() => data.onChange({ ...note, color: nextColor })} />
        {data.cardTitle && <span className="inline-flex" style={{ color: mix(70, "var(--text)") }}><Link className="size-[11px]" /></span>}
        {count && <span className="text-[11px] font-[650] text-text-muted tabular-nums">{count}</span>}
        <span className="flex-1" />
        <button className={noteBtn} title="Add a checkbox" onClick={() => (data.onText(note, withItem(note.text)), setEditing(true))}><ListChecks /></button>
        <button className={noteBtn} title="Delete the note" onClick={() => data.onRemove(note)}><X /></button>
      </header>
      {isEditing ? (
        <textarea ref={area} defaultValue={note.text} placeholder="Write a note… (- [ ] for a checkbox)" spellCheck={false}
          className="nodrag nowheel min-h-0 flex-1 resize-none border-0 bg-transparent px-2.5 pt-[7px] pb-3 text-[13px] leading-[1.45] text-text outline-none placeholder:text-faint"
          onChange={e => data.onText(note, e.target.value)} onBlur={() => setEditing(false)} onKeyDown={onKeyDown} />
      ) : (
        <div className="nodrag nowheel min-h-0 flex-1 cursor-text overflow-auto px-2.5 pt-[7px] pb-3 text-[13px] leading-[1.45] [overflow-wrap:anywhere]" onClick={() => setEditing(true)}>
          {!note.text.trim() ? <span className="text-faint">Write a note… (- [ ] for a checkbox)</span> : linesOf(note.text).map((l, i) =>
            l.kind === "item" ? (
              <label key={i} className="flex items-start gap-[7px] py-px" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={l.done} className="mt-[3px] flex-none cursor-pointer" style={{ accentColor: mix(80, "var(--text)") }}
                  onChange={() => data.onText(note, toggleItem(note.text, i))} />
                <span className={cn(l.done && "text-faint line-through")}>{l.text}</span>
              </label>
            ) : <div key={i} className="whitespace-pre-wrap">{l.text || " "}</div>,
          )}
        </div>
      )}
      {/* The corner: the same size on screen at any zoom; 144 × 96 to 800 × 800, on the grid. */}
      <NodeResizeControl autoScale={false} position="bottom-right" minWidth={144} minHeight={96} maxWidth={800} maxHeight={800}
        onResizeEnd={(_, p) => data.onChange({ ...note, w: Math.max(144, Math.floor(p.width / GRID) * GRID), h: Math.max(96, Math.floor(p.height / GRID) * GRID) })}
        style={{
          left: "auto", top: "auto", right: 2, bottom: 2, transform: "none", width: 16 * unscale, height: 16 * unscale, border: 0, borderRadius: "0 0 8px 0",
          background: `linear-gradient(135deg, transparent 50%, ${mix(60)} 50%)`, cursor: "nwse-resize",
        }}>
        <span title="Resize" className="block size-full" />
      </NodeResizeControl>
    </div>
  )
}
