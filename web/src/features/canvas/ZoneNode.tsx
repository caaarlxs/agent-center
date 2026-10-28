// A named zone that groups cards (canvas.js Zone): drag it (its cards and
// free notes come with it), double-click the name to rename it, size it from
// its corner, fold it into a folder (its cards fly in, their places kept), or
// remove it (the cards stay). A folder says what of its sessions waits for
// you; a click unfolds it, a card dropped on it goes in.
import { type Node, type NodeProps, NodeResizeControl, useStore } from "@xyflow/react"
import { Expand, Folder, Minimize2 } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import type { Card, Zone } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { StateIcon } from "@/features/session/StateIcon"
import { hueOf } from "@/features/session/state"
import { CARD_W, GRID, type Point } from "./geometry"
import { quietly } from "@/features/board/flip"
import { useFocusWhenShown } from "./useFocusWhenShown"
import { Anim } from "@/components/icons/animated"

export type ZoneNodeData = {
  zone: Zone
  members: Card[]
  places: Record<string, Point> // where each member sits, for the fold
  notes: { id: string; at: Point }[] // the notes that fold with it (on its cards, or free in it): node id, place
  isNew: boolean
  isDropTarget: boolean
  onChange: (zone: Zone) => void
  onRemove: (zone: Zone) => void
}

// Folding moves only transform, opacity and the clip, with the board's ease.
export const FOLD_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
export const FOLDER_H = 96 // about a folder tile's height
export const isCalm = () => matchMedia("(prefers-reduced-motion: reduce)").matches
const folderClip = (z: Zone) => `inset(0 ${Math.max(0, z.w - CARD_W)}px ${Math.max(0, z.h - FOLDER_H)}px 0 round 14px)`
export const cardEl = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"] article`)
const noteEl = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.firstElementChild as HTMLElement | null

// The way from a card to the middle of its zone's folder, in canvas units.
export function towardFolder(el: HTMLElement, at: Point, zone: Point) {
  return { dx: zone.x - at.x, dy: zone.y + FOLDER_H / 2 - (at.y + el.offsetHeight / 2) }
}

// A folded zone's summary: what of its sessions waits for you, works, is new.
function summary(cards: Card[]) {
  const n = (test: (c: Card) => boolean) => cards.filter(test).length
  return (
    [
      [n(c => c.column === "asking" && c.state !== "permission"), "asks you", "bg-ask"],
      [n(c => c.column === "asking" && c.state === "permission"), "approval", "bg-bad"],
      [n(c => c.column === "working"), "working", "bg-work"],
      [n(c => c.isUnread && c.column !== "asking"), "new", "bg-review"],
    ] as [number, string, string][]
  ).filter(([count]) => count > 0)
}

const ZoneButton = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
  <button title={title} onClick={e => (e.stopPropagation(), onClick())}
    className="nodrag inline-flex size-[22px] flex-none items-center justify-center rounded-md text-text-muted opacity-0 transition-[opacity,background-color,transform] duration-120 group-hover/zone:opacity-100 hover:bg-press hover:text-text active:scale-[0.92] [&_svg]:size-[13px]">
    {children}
  </button>
)

export function ZoneNode({ data, dragging }: NodeProps<Node<ZoneNodeData>>) {
  const { zone, members } = data
  const unscale = useStore(s => 1 / s.transform[2])
  const [isNaming, setNaming] = useState(data.isNew)
  const nameField = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLElement>(null)
  const down = useRef<Point | null>(null) // where a press began: a click unfolds, a drag does not
  useFocusWhenShown(nameField, isNaming)
  const hue = hueOf(zone.name)
  const tone = (a: number) => `hsl(${hue} 55% 50% / ${a})`
  // Enter keeps the name and Esc drops it; both end in a blur, which must
  // neither save twice nor save what Esc dropped.
  const settled = useRef(false)
  const finish = (isSaving: boolean) => {
    if (settled.current) return
    settled.current = true
    const name = nameField.current?.value.trim() || zone.name
    if (isSaving && name !== zone.name) data.onChange({ ...zone, name })
    setNaming(false)
  }
  const startNaming = () => ((settled.current = false), setNaming(true))

  // Folding: the cards, and their notes, fly into the folder one after
  // another and the zone closes up to its size; saved once they are in.
  // Unfolding plays it back.
  const closing = useRef<Animation | null>(null)
  const riders = () => [
    ...members.map(c => ({ el: cardEl(c.id), at: data.places[c.id] })),
    ...data.notes.map(n => ({ el: noteEl(n.id), at: n.at })),
  ].flatMap(({ el, at }) => (el && at ? [{ el, at }] : []))
  const fold = () => {
    quietly(members.map(c => c.id))
    if (isCalm() || !box.current) return data.onChange({ ...zone, collapsed: true })
    const flights = riders().map(({ el, at }, i) => {
      const { dx, dy } = towardFolder(el, at, zone)
      return el.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 }], { duration: 240, delay: i * 18, easing: FOLD_EASE, fill: "forwards" })
    })
    closing.current = box.current.animate([{ clipPath: "inset(0 round 14px)" }, { clipPath: folderClip(zone) }], { duration: 260, easing: FOLD_EASE, fill: "forwards" })
    Promise.all([closing.current, ...flights].map(a => a.finished)).catch(() => {}).finally(() => data.onChange({ ...zone, collapsed: true }))
  }
  const unfold = () => (quietly(members.map(c => c.id)), data.onChange({ ...zone, collapsed: false }))
  const wasFolded = useRef(!!zone.collapsed)
  useLayoutEffect(() => {
    const was = wasFolded.current
    wasFolded.current = !!zone.collapsed
    closing.current?.cancel()
    closing.current = null
    if (was === !!zone.collapsed || isCalm() || !box.current) return
    if (zone.collapsed) return void box.current.animate([{ transform: "scale(0.96)" }, { transform: "none" }], { duration: 220, easing: FOLD_EASE })
    box.current.animate([{ clipPath: folderClip(zone) }, { clipPath: "inset(0 round 14px)" }], { duration: 300, easing: FOLD_EASE })
    riders().forEach(({ el, at }, i) => {
      const { dx, dy } = towardFolder(el, at, zone)
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, delay: 40 + i * 22, easing: FOLD_EASE, fill: "backwards" })
    })
    // Only on a fold or an unfold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.collapsed])

  const nameSize = 13 * Math.min(unscale, 2.2) // readable when zoomed out
  if (zone.collapsed)
    return (
      <section ref={box} data-folder={zone.id} title="Click to unfold · drag to move it · drop a card on it to add it"
        onPointerDown={e => (down.current = { x: e.clientX, y: e.clientY })}
        onClick={e => {
          const d = down.current
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) unfold()
        }}
        className={cn("flex min-h-24 w-72 origin-top-left flex-col gap-1.5 rounded-[14px] pb-2.5", dragging ? "cursor-grabbing" : "cursor-grab")}
        style={{
          background: `color-mix(in srgb, hsl(${hue} 55% 50%) 12%, var(--surface))`,
          boxShadow: data.isDropTarget ? "inset 0 0 0 2px var(--brand), 0 0 0 4px var(--brand-soft)" : `inset 0 0 0 1.5px ${tone(0.5)}, 0 1px 2px rgb(0 0 0 / 0.08)`,
        }}>
        <header className="group/zone flex h-[34px] items-center gap-1.5 pr-1.5 pl-3.5 font-bold" style={{ color: `hsl(${hue} 55% var(--repo-l))`, fontSize: nameSize }}>
          <Folder className="size-[15px] flex-none" />
          <span className="min-w-0 flex-1 truncate">{zone.name}</span>
          <span className="inline-flex h-[18px] min-w-5 flex-none items-center justify-center rounded-[9px] px-1.5 text-[11px] tabular-nums" style={{ background: tone(0.18) }}>{members.length}</span>
          <button title="Unfold" onClick={e => (e.stopPropagation(), unfold())}
            className="nodrag inline-flex size-[22px] items-center justify-center rounded-md text-text-muted hover:bg-press hover:text-text"><Expand className="size-[13px]" /></button>
        </header>
        <div className="flex flex-wrap gap-1 px-3 text-[11.5px]">
          {summary(members).map(([n, label, bg]) => <span key={label} className={cn("inline-flex h-[19px] items-center rounded-[5px] px-[7px] font-semibold text-surface", bg)}>{n} {label}</span>)}
          {!members.length && <span className="text-text-muted">Empty</span>}
        </div>
        {members.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-2.5">
            {members.slice(0, 9).map(c => (
              <button key={c.id} title={c.title} onClick={e => (e.stopPropagation(), openSession(c.id))} className="nodrag inline-flex rounded-full hover:shadow-[0_0_0_2px_var(--brand-soft)]">
                <StateIcon card={c} size={22} />
              </button>
            ))}
            {members.length > 9 && <span className="pl-0.5 text-[11.5px] text-text-muted">+{members.length - 9}</span>}
          </div>
        )}
      </section>
    )
  return (
    <section ref={box} className={cn("group/zone relative size-full rounded-[14px]", dragging ? "cursor-grabbing" : "cursor-grab")}
      title="Drag to move the zone with its cards and notes"
      style={{ background: `hsl(${hue} 55% 50% / 0.035)`, boxShadow: dragging ? `inset 0 0 0 2px ${tone(0.6)}, var(--shadow-pop)` : `inset 0 0 0 1px ${tone(0.28)}` }}>
      <header className="flex h-[34px] items-center gap-1 pr-1.5 pl-3.5 font-bold" onDoubleClick={startNaming} title="Drag to move the zone · double-click to rename"
        style={{ color: `hsl(${hue} 55% var(--repo-l))`, fontSize: nameSize }}>
        {isNaming ? (
          <input ref={nameField} defaultValue={zone.name} maxLength={60} onBlur={() => finish(true)}
            className="nodrag min-w-0 flex-1 rounded-md border border-brand bg-surface px-1.5 py-0.5 text-inherit outline-none"
            onKeyDown={e => {
              if (e.key === "Enter") finish(true)
              if (e.key === "Escape") (e.stopPropagation(), finish(false))
            }} />
        ) : <span className="min-w-0 flex-1 truncate">{zone.name}</span>}
        <ZoneButton title="Fold into a folder (its cards stay where they are)" onClick={fold}><Minimize2 /></ZoneButton>
        <ZoneButton title="Remove the zone (the cards stay)" onClick={() => data.onRemove(zone)}><Anim.X /></ZoneButton>
      </header>
      {/* The corner: the same size on screen at any zoom. */}
      <NodeResizeControl autoScale={false} position="bottom-right" minWidth={160} minHeight={120}
        onResizeEnd={(_, p) => data.onChange({ ...zone, w: Math.max(160, Math.floor(p.width / GRID) * GRID), h: Math.max(120, Math.floor(p.height / GRID) * GRID) })}
        style={{
          left: "auto", top: "auto", right: 2, bottom: 2, transform: "none", width: 20 * unscale, height: 20 * unscale, border: 0, borderRadius: "0 0 12px 0",
          background: `linear-gradient(135deg, transparent 50%, ${tone(0.5)} 50%)`, cursor: "nwse-resize",
        }}>
        <span title="Resize" className="block size-full" />
      </NodeResizeControl>
    </section>
  )
}

// "Incoming": where new sessions land until you place them.
export function IncomingNode() {
  return (
    <div className="pointer-events-none relative size-full rounded-[14px] border-[1.5px] border-dashed border-line-strong">
      <span className="absolute -top-2.5 left-3.5 bg-bg px-2 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Incoming</span>
    </div>
  )
}
