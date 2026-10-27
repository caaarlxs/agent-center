// The canvas (canvas.js): sessions as cards you place anywhere on a 24 px
// grid, named zones that group them, sticky notes, an "Incoming" corner where
// new ones land, and "Done" as the band at the foot. Built on React Flow; it
// behaves as the classic canvas: a drag on the empty canvas picks with a box,
// Space (or the middle button) pans, ⌘/⇧-click picks without opening, Esc
// lets go. A card dropped on "Done" is done, on a folder goes in; a zone
// carries its cards and free notes; a note follows the card it is attached
// to. What a card shows follows the zoom (SessionCard's level).
import {
  type Node, type NodeChange, type NodeProps, type OnNodeDrag, type ReactFlowInstance, Panel, SelectionMode, applyNodeChanges, useReactFlow, useStore,
} from "@xyflow/react"
import { Plus } from "lucide-react"
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Canvas as FlowCanvas } from "@/components/ai-elements/canvas"
import type { Card, Note, Zone } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { isTyping } from "@/lib/keys"
import { cn } from "@/lib/utils"
import { openSession, useOpenSession } from "@/app/open-session"
import { focusRequest, repoFilter } from "@/app/view-state"
import { boardAct } from "@/features/board/act"
import { drawingZone, selected as selectedCard, useBoardCards } from "@/features/board/state"
import { moveTo } from "@/features/session/actions"
import { type Level, SessionCard } from "@/features/session/SessionCard"
import { hueOf } from "@/features/session/state"
import { DoneBand, isOverDone } from "./DoneBand"
import { CARD_W, GRID, type Point, entryBox, entrySlots, isInZone, newZone, onCanvas, placeCards, placeIn, snap } from "./geometry"
import { NoteNode, type NoteNodeData } from "./NoteNode"
import { attachTo, cardKey, newNote, noteAt, placeNote } from "./notes"
import { useSyncedList } from "./useSyncedList"
import { DONE_H, ZoomControl, savedZoom, useCanvasZoom, useSavedZoomOnce } from "./ZoomControl"
import { FOLD_EASE, IncomingNode, ZoneNode, type ZoneNodeData, cardEl, isCalm, towardFolder } from "./ZoneNode"
import { ZOOM, minZoomOf } from "./zoom"

type SessionNodeData = { card: Card; now: number; isNoteTarget: boolean }

const levelOf = (zoom: number): Level => (zoom < 0.62 ? "far" : zoom < 0.85 ? "mid" : "near")
const CARD_H_GUESS = 120 // a card's height before it is measured
const heightOf = (id: string) => cardEl(id)?.offsetHeight ?? CARD_H_GUESS

function SessionNode({ id, data, selected, dragging }: NodeProps<Node<SessionNodeData>>) {
  const zoom = useStore(s => s.transform[2])
  const isOpen = useOpenSession()?.id === id
  const isPointed = selectedCard.use() === id
  // Far, the title is drawn larger the smaller the canvas is drawn, so it
  // keeps a readable size on screen.
  return <SessionCard card={data.card} now={data.now} level={levelOf(zoom)} unscale={1 / zoom} isSelected={selected || isPointed} isReading={isOpen} isDragging={dragging} isNoteTarget={data.isNoteTarget} />
}

const nodeTypes = { session: SessionNode, zone: ZoneNode, note: NoteNode, incoming: IncomingNode }

// The folder under the pointer, if any (a card let go there goes in).
const folderAt = (e: { clientX: number; clientY: number }) =>
  (document.elementsFromPoint(e.clientX, e.clientY).find(el => el instanceof HTMLElement && el.dataset.folder) as HTMLElement | undefined)?.dataset.folder ?? null
const pointOf = (e: MouseEvent | TouchEvent) => ("clientX" in e ? e : e.changedTouches[0])

// The canvas's own keys: + − 0 zoom, Esc lets go of what is picked, and the
// zoom kept in this browser comes back once the cards are measured.
function CanvasKeys() {
  const rf = useReactFlow()
  const { scale, zoomTo } = useCanvasZoom()
  useSavedZoomOnce()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(document.activeElement) || document.querySelector("[role=dialog]")) return
      if (e.key === "Escape") return void rf.setNodes(ns => (ns.some(n => n.selected) ? ns.map(n => (n.selected ? { ...n, selected: false } : n)) : ns))
      if (e.key === "+" || e.key === "=") zoomTo(scale * ZOOM.step)
      else if (e.key === "-") zoomTo(scale / ZOOM.step)
      else if (e.key === "0") zoomTo(null)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rf, scale, zoomTo])
  return null
}

// The Zone button's mode: the next drag on the canvas draws a zone (a click
// gives one of the usual size); Esc or the button again cancels.
function ZoneDraw({ onDrawn }: { onDrawn: (r: { x0: number; y0: number; x1: number; y1: number }) => void }) {
  const rf = useReactFlow()
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), drawingZone.set(false))
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [])
  const box = useRef<HTMLDivElement>(null)
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const r = box.current!.getBoundingClientRect()
    const from = { x: e.clientX, y: e.clientY }
    const at = (ev: { clientX: number; clientY: number }) => ({ x0: from.x - r.left, y0: from.y - r.top, x1: ev.clientX - r.left, y1: ev.clientY - r.top })
    const move = (ev: PointerEvent) => setDraft(at(ev))
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      setDraft(null)
      const a = rf.screenToFlowPosition({ x: from.x, y: from.y })
      const b = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      onDrawn({ x0: a.x, y0: a.y, x1: b.x, y1: b.y })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const hue = hueOf("New zone")
  return (
    <div ref={box} className="absolute inset-x-0 top-0 z-[45] cursor-crosshair" style={{ bottom: DONE_H }} onPointerDown={start}>
      {draft ? (
        <div className="pointer-events-none absolute rounded-[14px]" style={{
          left: Math.min(draft.x0, draft.x1), top: Math.min(draft.y0, draft.y1), width: Math.abs(draft.x1 - draft.x0), height: Math.abs(draft.y1 - draft.y0),
          background: `hsl(${hue} 55% 50% / 0.035)`, boxShadow: `inset 0 0 0 1px hsl(${hue} 55% 50% / 0.28)`,
        }} />
      ) : (
        <div className="pointer-events-none absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-surface px-3 py-1.5 text-xs text-text-muted shadow-pop">Drag to draw the zone · Esc to cancel</div>
      )}
    </div>
  )
}

const btn = "pointer-events-auto inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,transform] duration-120 ease-(--ease-out) active:scale-[0.97]"

export function Canvas() {
  const hasData = useLive(l => !!l.snapshot)
  const cards = useBoardCards()
  const serverZones = useLive(l => l.snapshot?.zones)
  const serverNotes = useLive(l => l.snapshot?.notes)
  const now = useNow()
  const repo = repoFilter.use()
  const isDrawing = drawingZone.use()
  const [zones, saveZones] = useSyncedList<Zone>(serverZones, "/api/canvas/zones", "zones")
  const [notes, saveNotes] = useSyncedList<Note>(serverNotes, "/api/canvas/notes", "notes")
  const [fresh, setFresh] = useState<string | null>(null) // a zone or note just made: it asks for its text

  // The places count every card, so filtering by repo moves none of them.
  const all = useMemo(() => onCanvas(cards), [cards])
  const done = useMemo(() => cards.filter(c => c.column === "done" && (!repo || c.repoRoot === repo)), [cards, repo])
  // Places moved here and not saved yet: the server's copy is older until it
  // reports the same place back.
  const [moved, setMoved] = useState<Record<string, Point>>({})
  useEffect(() => {
    setMoved(m => {
      const next = { ...m }
      for (const c of all) if (next[c.id] && c.pos && c.pos.x === next[c.id].x && c.pos.y === next[c.id].y) delete next[c.id]
      return next
    })
  }, [all])
  const at = useMemo(() => placeCards(all, moved), [all, moved])
  const entry = useMemo(() => entryBox(entrySlots(all, moved)), [all, moved])
  // A folded zone hides its cards; the repo filter hides the others.
  const folded = useMemo(() => zones.filter(z => z.collapsed), [zones])
  const hidden = useMemo(() => new Set(all.filter(c => folded.some(z => isInZone(z, at[c.id]))).map(c => c.id)), [all, folded, at])
  const shownCards = useMemo(() => all.filter(c => !hidden.has(c.id) && (!repo || c.repoRoot === repo)), [all, hidden, repo])
  const byKey = useMemo(() => new Map(shownCards.map(c => [cardKey(c), c])), [shownCards])
  const cardAt = useCallback((key: string) => {
    const c = byKey.get(key)
    return c ? at[c.id] : null
  }, [byKey, at])

  const changeZone = useCallback((z: Zone) => saveZones(zones.map(x => (x.id === z.id ? z : x))), [zones, saveZones])
  const removeZone = useCallback((z: Zone) => saveZones(zones.filter(x => x.id !== z.id)), [zones, saveZones])
  const changeNote = useCallback((n: Note) => saveNotes(notes.map(x => (x.id === n.id ? n : x))), [notes, saveNotes])
  const textNote = useCallback((n: Note, text: string) => saveNotes(notes.map(x => (x.id === n.id ? { ...x, text } : x)), true), [notes, saveNotes])
  const removeNote = useCallback((n: Note) => {
    const before = notes
    saveNotes(notes.filter(x => x.id !== n.id))
    if (n.text.trim()) toast("Note deleted", { action: { label: "Undo", onClick: () => saveNotes(before) } })
  }, [notes, saveNotes])

  // While something is dragged: the card a note would attach to, the folder
  // a card would go into, whether it is over "Done".
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [folderOver, setFolderOver] = useState<string | null>(null)
  const [isOverDoneNow, setOverDone] = useState(false)

  // The nodes React Flow draws: rebuilt from the live state, keeping what the
  // person is doing (a drag under way, the selection).
  const [nodes, setNodes] = useState<Node[]>([])
  useEffect(() => {
    setNodes(prev => {
      const before = new Map(prev.map(n => [n.id, n]))
      const keep = (n: Node): Node => {
        const was = before.get(n.id)
        // Its measured size too: without it React Flow hides the node until it measures it again.
        return was ? { ...n, measured: was.measured, selected: was.selected, ...(was.dragging ? { position: was.position, dragging: true } : {}) } : n
      }
      const incoming: Node = { id: "incoming", type: "incoming", position: { x: entry.x, y: entry.y }, draggable: false, selectable: false, focusable: false, zIndex: -2, style: { width: entry.w, height: entry.h }, data: {} }
      const zoneNodes = zones.map(z => {
        const members = all.filter(c => isInZone(z, at[c.id]))
        return keep({
          id: `zone:${z.id}`, type: "zone", position: { x: z.x, y: z.y }, zIndex: z.collapsed ? 0 : -1,
          data: { zone: z, members, places: at, isNew: fresh === z.id, isDropTarget: folderOver === z.id, onChange: changeZone, onRemove: removeZone } satisfies ZoneNodeData,
          ...(z.collapsed ? {} : { style: { width: z.w, height: z.h } }),
        })
      })
      const noteNodes = notes.flatMap(n => {
        const p = noteAt(n, cardAt)
        if (!p || (!n.cardId && folded.some(z => isInZone(z, p)))) return []
        return [keep({
          id: `note:${n.id}`, type: "note", position: p, dragHandle: ".note-drag", zIndex: 2, style: { width: n.w, height: n.h },
          data: { note: n, isNew: fresh === n.id, onText: textNote, onChange: changeNote, onRemove: removeNote } satisfies NoteNodeData,
        })]
      })
      const cardNodes = shownCards.map(c => keep({ id: c.id, type: "session", position: at[c.id], zIndex: 1, data: { card: c, now, isNoteTarget: noteTarget === c.id } satisfies SessionNodeData }))
      return [incoming, ...zoneNodes, ...cardNodes, ...noteNodes]
    })
  }, [zones, notes, shownCards, all, at, now, fresh, folded, cardAt, changeZone, removeZone, changeNote, textNote, removeNote, entry, noteTarget, folderOver])
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(ns => applyNodeChanges(changes, ns)), [])

  // A zone carries the cards and free notes inside it when the drag starts.
  const carried = useRef<{ zone: string; start: Point; cards: { id: string; from: Point }[]; notes: { id: string; from: Point }[] } | null>(null)
  const onNodeDragStart: OnNodeDrag = (_, node) => {
    if (node.type !== "zone") return
    const zone = (node.data as ZoneNodeData).zone
    carried.current = {
      zone: node.id, start: node.position,
      cards: all.filter(c => isInZone(zone, at[c.id])).map(c => ({ id: c.id, from: at[c.id] })),
      notes: notes.filter(n => !n.cardId && isInZone(zone, n)).map(n => ({ id: `note:${n.id}`, from: { x: n.x, y: n.y } })),
    }
  }
  const onNodeDrag: OnNodeDrag = (e, node, dragged) => {
    const p = pointOf(e as unknown as MouseEvent)
    if (node.type === "session") {
      setOverDone(isOverDone(p))
      setFolderOver(folderAt(p))
      // The notes attached to the dragged cards ride along.
      const riding = new Map(dragged.filter(d => d.type === "session").map(d => [cardKey((d.data as SessionNodeData).card), d.position]))
      setNodes(ns => ns.map(n => {
        const note = n.type === "note" ? (n.data as NoteNodeData).note : null
        const c = note?.cardId ? riding.get(note.cardId) : undefined
        return note && c ? { ...n, dragging: true, position: { x: c.x + note.x, y: c.y + note.y } } : n
      }))
    }
    if (node.type === "note") {
      const note = (node.data as NoteNodeData).note
      const key = attachTo({ ...node.position, w: note.w, h: note.h }, shownCards.map(c => ({ key: c.id, at: at[c.id], h: heightOf(c.id) })))
      setNoteTarget(key)
    }
    const c = carried.current
    if (!c || c.zone !== node.id) return
    const dx = node.position.x - c.start.x
    const dy = node.position.y - c.start.y
    const from = new Map([...c.cards, ...c.notes].map(k => [k.id, k.from]))
    setNodes(ns => ns.map(n => (from.has(n.id) ? { ...n, dragging: true, position: { x: from.get(n.id)!.x + dx, y: from.get(n.id)!.y + dy } } : n)))
  }
  const save = (id: string, p: Point) => {
    const to = { x: snap(p.x), y: snap(p.y) }
    setMoved(m => ({ ...m, [id]: to }))
    moveTo(id, to).catch((err: Error) => toast.error(err.message))
  }
  // Into a folder: each card shrinks into it (the folder gives a little bump
  // as it lands), then takes a free place inside the zone for when it unfolds.
  const dropInFolder = (zone: Zone, moving: Node[]) => {
    const putIn = () => {
      const taken = all.filter(c => isInZone(zone, at[c.id]) && !moving.some(m => m.id === c.id)).map(c => ({ ...at[c.id], w: CARD_W, h: heightOf(c.id) }))
      let z = zone
      for (const m of moving) {
        const spot = placeIn(z, taken, heightOf(m.id))
        z = spot.zone
        taken.push({ ...spot.at, w: CARD_W, h: heightOf(m.id) })
        save(m.id, spot.at)
      }
      if (z !== zone) changeZone(z)
    }
    toast(`${moving.length === 1 ? "Added" : `${moving.length} added`} to ${zone.name}`)
    if (isCalm()) return putIn()
    const flights = moving.flatMap(m => {
      const el = cardEl(m.id)
      if (!el) return []
      const { dx, dy } = towardFolder(el, m.position, zone)
      return [el.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 }], { duration: 200, easing: FOLD_EASE, fill: "forwards" })]
    })
    document.querySelector<HTMLElement>(`[data-folder="${CSS.escape(zone.id)}"]`)
      ?.animate([{ transform: "none" }, { transform: "scale(1.05)", offset: 0.6 }, { transform: "none" }], { duration: 300, delay: 120, easing: FOLD_EASE })
    Promise.all(flights.map(f => f.finished)).catch(() => {}).finally(() => (putIn(), flights.forEach(f => f.cancel())))
  }
  const onNodeDragStop: OnNodeDrag = (e, node, dragged) => {
    const p = pointOf(e as unknown as MouseEvent)
    setOverDone(false)
    setFolderOver(null)
    setNoteTarget(null)
    setNodes(ns => (ns.some(n => n.dragging) ? ns.map(n => (n.dragging ? { ...n, dragging: false } : n)) : ns))
    const sessions = dragged.filter(n => n.type === "session")
    const folder = zones.find(z => z.id === folderAt(p))
    if (sessions.length && isOverDone(p)) {
      for (const n of sessions) void boardAct((n.data as SessionNodeData).card, "done")
    } else if (sessions.length && folder?.collapsed) dropInFolder(folder, sessions)
    else for (const n of sessions) save(n.id, n.position)

    for (const n of dragged.filter(d => d.type === "note")) {
      const note = (n.data as NoteNodeData).note
      const targets = shownCards.map(c => ({ key: cardKey(c), at: at[c.id], h: heightOf(c.id) }))
      const key = attachTo({ ...n.position, w: note.w, h: note.h }, targets)
      changeNote(placeNote(note, n.position, key, cardAt))
    }

    const c = carried.current
    if (node.type === "zone" && c) {
      const dx = snap(node.position.x) - c.start.x
      const dy = snap(node.position.y) - c.start.y
      for (const k of c.cards) save(k.id, { x: k.from.x + dx, y: k.from.y + dy })
      const movedNotes = new Set(c.notes.map(k => k.id.slice("note:".length)))
      if (movedNotes.size) saveNotes(notes.map(n => (movedNotes.has(n.id) ? { ...n, x: snap(n.x + dx), y: snap(n.y + dy) } : n)))
      const id = node.id.slice("zone:".length)
      saveZones(zones.map(z => (z.id === id ? { ...z, x: snap(node.position.x), y: snap(node.position.y) } : z)))
    }
    carried.current = null
  }

  // New notes go right of "Incoming" (nudged so they do not stack), or where
  // you double-click.
  const flow = useRef<ReactFlowInstance | null>(null)
  const addNote = (p?: Point) => {
    const spot = p ? { x: p.x - 24, y: p.y - 12 } : { x: entry.x + entry.w + GRID + (notes.length % 5) * GRID, y: entry.y + (notes.length % 5) * GRID }
    const note = newNote(spot)
    setFresh(note.id)
    saveNotes([...notes, note])
  }
  const addZone = (r: { x0: number; y0: number; x1: number; y1: number }) => {
    const zone = newZone(r)
    drawingZone.set(false)
    setFresh(zone.id)
    saveZones([...zones, zone])
  }
  // A card lifted out of "Done": reopened where it was let go.
  const lift = (card: Card, rect: DOMRect) => {
    const rf = flow.current
    if (!rf) return
    const p = rf.screenToFlowPosition({ x: rect.left, y: rect.top })
    save(card.id, p)
    void boardAct(card, "undone")
  }

  // "Next up" and the search ask the canvas to go to a card: it zooms in to at
  // least the card's real size, centres it in the room the panel leaves, and
  // the card flashes once.
  const focus = focusRequest.use()
  const [flashId, setFlashId] = useState<string | null>(null)
  useEffect(() => {
    const p = focus && at[focus.id]
    const rf = flow.current
    if (!focus || !p || !rf) return
    const zoom = Math.min(ZOOM.max, Math.max(rf.getZoom(), 1))
    if (zoom !== rf.getZoom()) savedZoom.set(zoom)
    const panel = document.querySelector("aside[aria-label=Session]")?.getBoundingClientRect().width ?? 0
    rf.setCenter(p.x + CARD_W / 2 + panel / 2 / zoom, p.y + heightOf(focus.id) / 2, { zoom, duration: isCalm() ? 0 : 500 })
    setFlashId(focus.id)
    const timer = setTimeout(() => setFlashId(null), 1600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])
  const shown = useMemo(() => (flashId ? nodes.map(n => (n.id === flashId ? { ...n, className: "flash" } : n)) : nodes), [nodes, flashId])
  const [fit, setFit] = useState(1)
  const fitRef = useRef(1)
  fitRef.current = fit

  if (!hasData) return <div className="grid h-full place-items-center text-sm text-text-muted">Connecting…</div>
  return (
    <div className="relative size-full" onDoubleClick={e => {
      if (!(e.target as HTMLElement).classList.contains("react-flow__pane") || !flow.current) return
      addNote(flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    }}>
      <FlowCanvas
        nodes={shown} edges={[]} onInit={rf => (flow.current = rf)} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
        onNodeClick={(e, node) => {
          if (node.type !== "session" || e.metaKey || e.shiftKey) return // ⌘/⇧: picked, not opened
          selectedCard.set(node.id)
          openSession(node.id)
        }}
        onPaneClick={() => (openSession(null), selectedCard.set(null))}
        onMoveEnd={(e, v) => {
          if (!e) return // a move made here (fit, a zoom step, "Next up"), saved already
          const saved = savedZoom.get()
          if (saved === null ? Math.abs(v.zoom - fitRef.current) > 0.01 : Math.abs(v.zoom - saved) > 0.001) savedZoom.set(Math.abs(v.zoom - fitRef.current) < 0.01 ? null : v.zoom)
        }}
        panOnDrag={[1]} selectionOnDrag selectionMode={SelectionMode.Partial} panActivationKeyCode="Space" multiSelectionKeyCode={["Meta", "Shift"]} selectionKeyCode={null}
        minZoom={minZoomOf(fit)} maxZoom={ZOOM.max} snapToGrid snapGrid={[GRID, GRID]} fitView={false} proOptions={{ hideAttribution: true }}
        className={cn(isOverDoneNow && "[&_.react-flow__node.dragging]:opacity-90")}
        style={{ "--xy-selection-background-color": "color-mix(in srgb, var(--brand) 12%, transparent)", "--xy-selection-border": "1.5px solid var(--brand)" } as CSSProperties}
      >
        <CanvasKeys />
        <FitTracker onFit={setFit} />
        <Panel position="top-center" className="!mt-3 flex gap-1.5">
          <button className={cn(btn, isDrawing ? "border-text bg-text text-bg" : "hover:bg-hover")} aria-pressed={isDrawing}
            title="Draw a named zone on the canvas to group cards (Esc cancels)" onClick={() => drawingZone.set(!isDrawing)}><Plus className="size-3.5" />Zone</button>
          <button className={cn(btn, "hover:bg-hover")} title="Add a note (or double-click the empty canvas)" onClick={() => addNote()}><Plus className="size-3.5" />Note</button>
        </Panel>
        <Panel position="top-right" className="!mt-14 !mr-3.5"><ZoomControl /></Panel>
        {isDrawing && <ZoneDraw onDrawn={addZone} />}
      </FlowCanvas>
      <DoneBand cards={done} isTarget={isOverDoneNow} onLift={lift} />
    </div>
  )
}

// Keeps the fit zoom at hand for the pinch's save (onMoveEnd).
function FitTracker({ onFit }: { onFit: (z: number) => void }) {
  const { fitOf } = useCanvasZoom()
  const nodes = useStore(s => s.nodes.length)
  useEffect(() => onFit(fitOf().zoom), [fitOf, nodes, onFit])
  return null
}
