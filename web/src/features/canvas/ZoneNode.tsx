// A named zone that groups cards: drag it by its name (its cards come with
// it), double-click the name to rename it, size it from its corner, fold it
// into a folder (its cards hide, their places kept), or remove it (the cards
// stay). A folder says what of its sessions waits for you; a click unfolds it.
import { type Node, type NodeProps, NodeResizer, useStore } from "@xyflow/react"
import { Folder, Minimize2, X } from "lucide-react"
import { useRef, useState } from "react"
import type { Card, Zone } from "@/lib/api-types"
import { StateIcon } from "@/features/session/StateIcon"
import { hueOf } from "@/features/session/state"
import { useFocusWhenShown } from "./useFocusWhenShown"

export type ZoneNodeData = {
  zone: Zone
  members: Card[]
  isNew: boolean
  onChange: (zone: Zone) => void
  onRemove: (zone: Zone) => void
}

function summary(cards: Card[]) {
  const n = (test: (c: Card) => boolean) => cards.filter(test).length
  return [
    [n(c => c.column === "asking" && c.state !== "permission"), "ask you", "text-amber-400"],
    [n(c => c.column === "asking" && c.state === "permission"), "approval", "text-rose-400"],
    [n(c => c.column === "working"), "working", "text-emerald-400"],
    [n(c => c.isUnread && c.column !== "asking"), "new", "text-orange-400"],
  ].filter(([count]) => (count as number) > 0) as [number, string, string][]
}

export function ZoneNode({ data, selected }: NodeProps<Node<ZoneNodeData>>) {
  const { zone, members } = data
  const scale = useStore(s => Math.min(1 / s.transform[2], 2.2))
  const [isNaming, setNaming] = useState(data.isNew)
  const nameField = useRef<HTMLInputElement>(null)
  useFocusWhenShown(nameField, isNaming)
  const hue = hueOf(zone.name)
  const color = `oklch(0.8 0.12 ${hue})`
  const rename = (name: string) => {
    setNaming(false)
    if (name.trim() && name.trim() !== zone.name) data.onChange({ ...zone, name: name.trim() })
  }
  if (zone.collapsed)
    return (
      <div className="w-72 cursor-grab space-y-2 rounded-xl border bg-card p-3 shadow-sm" onClick={() => data.onChange({ ...zone, collapsed: false })} title="Click to unfold">
        <div className="flex items-center gap-2 font-semibold" style={{ color }}><Folder className="size-4" style={{ fill: `oklch(0.8 0.12 ${hue} / 0.25)` }} />{zone.name}<span className="ml-auto text-xs text-muted-foreground">{members.length}</span></div>
        <div className="flex flex-wrap gap-x-3 text-xs">{summary(members).map(([n, label, tone]) => <span key={label} className={tone}>{n} {label}</span>)}{!members.length && <span className="text-muted-foreground">Empty</span>}</div>
        {members.length > 0 && <div className="flex flex-wrap gap-1">{members.slice(0, 10).map(c => <StateIcon key={c.id} card={c} size={20} />)}{members.length > 10 && <span className="text-xs text-muted-foreground">+{members.length - 10}</span>}</div>}
      </div>
    )
  return (
    <div className="size-full rounded-2xl" style={{ background: `oklch(0.7 0.12 ${hue} / 0.04)`, boxShadow: `inset 0 0 0 1px oklch(0.7 0.12 ${hue} / 0.3)` }}>
      <NodeResizer isVisible={selected} minWidth={240} minHeight={160} lineClassName="!border-transparent" handleClassName="!size-2.5 !rounded-sm !border-0"
        onResizeEnd={(_, p) => data.onChange({ ...zone, w: Math.round(p.width / 24) * 24, h: Math.round(p.height / 24) * 24 })} />
      <header className="group/zone flex items-center gap-1 px-3 pt-2" onDoubleClick={() => setNaming(true)}>
        {isNaming ? (
          <input ref={nameField} defaultValue={zone.name} maxLength={60} className="nodrag min-w-0 flex-1 rounded bg-black/30 px-1.5 font-semibold outline-none" style={{ color, fontSize: 13 * scale }}
            onBlur={e => rename(e.target.value)} onKeyDown={e => {
              if (e.key === "Enter") rename(e.currentTarget.value)
              if (e.key === "Escape") (e.stopPropagation(), setNaming(false))
            }} />
        ) : <span className="truncate font-semibold" style={{ color, fontSize: 13 * scale }} title="Double-click to rename">{zone.name}</span>}
        <span className="ml-auto flex opacity-0 transition-opacity group-hover/zone:opacity-100">
          <button className="nodrag grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent" title="Fold into a folder" onClick={() => data.onChange({ ...zone, collapsed: true })}><Minimize2 className="size-3.5" /></button>
          <button className="nodrag grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent" title="Remove the zone (the cards stay)" onClick={() => data.onRemove(zone)}><X className="size-3.5" /></button>
        </span>
      </header>
    </div>
  )
}
