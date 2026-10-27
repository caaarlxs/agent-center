// The canvas: sessions as cards you place anywhere, named zones that group
// them, and sticky notes, on React Flow (pan, zoom, selection, minimap). A
// card dragged lands on the grid and its place is saved; dropped on "Done" it
// is done; a zone dragged carries its cards and free notes; a note attached to
// a card moves with it. What a card shows follows the zoom (SessionCard's
// level). A double click on the empty canvas leaves a note there.
import {
  type Node, type NodeChange, type NodeProps, type OnNodeDrag, type ReactFlowInstance, MiniMap, Panel, applyNodeChanges, useStore,
} from "@xyflow/react"
import { Plus, StickyNote } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Canvas as FlowCanvas } from "@/components/ai-elements/canvas"
import { Controls } from "@/components/ai-elements/controls"
import { Button } from "@/components/ui/button"
import type { Card, Note, Zone } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { openSession, useOpenSession } from "@/app/open-session"
import { focusRequest, repoFilter } from "@/app/view-state"
import { act, moveTo } from "@/features/session/actions"
import { type Level, SessionCard } from "@/features/session/SessionCard"
import { DONE_DOCK, DoneDock } from "./DoneDock"
import { CARD_W, GRID, type Point, isInZone, onCanvas, placeCards, snap } from "./geometry"
import { NoteNode, type NoteNodeData } from "./NoteNode"
import { attachTo, cardKey, newNote, noteAt, placeNote } from "./notes"
import { useSyncedList } from "./useSyncedList"
import { ZoneNode, type ZoneNodeData } from "./ZoneNode"

type SessionNodeData = { card: Card; now: number }

const levelOf = (zoom: number): Level => (zoom < 0.62 ? "far" : zoom < 0.9 ? "mid" : "near")
const CARD_H_GUESS = 120 // a card's height before it is measured

function SessionNode({ id, data, selected }: NodeProps<Node<SessionNodeData>>) {
  const zoom = useStore(s => s.transform[2])
  const isOpen = useOpenSession()?.id === id
  // Far, the title is drawn larger the smaller the canvas is drawn, so it
  // keeps a readable size on screen.
  return <SessionCard card={data.card} now={data.now} level={levelOf(zoom)} textScale={Math.min(1 / zoom, 2)} isSelected={selected || isOpen} />
}

const nodeTypes = { session: SessionNode, zone: ZoneNode, note: NoteNode }

const isOverDock = (e: MouseEvent | TouchEvent) => {
  const dock = document.getElementById(DONE_DOCK)?.getBoundingClientRect()
  const p = "clientX" in e ? e : e.changedTouches[0]
  return !!dock && p.clientX >= dock.left && p.clientX <= dock.right && p.clientY >= dock.top && p.clientY <= dock.bottom
}

export function Canvas() {
  const cards = useLive(l => l.snapshot?.cards)
  const serverZones = useLive(l => l.snapshot?.zones)
  const serverNotes = useLive(l => l.snapshot?.notes)
  const now = useNow()
  const repo = repoFilter.use()
  const [zones, saveZones] = useSyncedList<Zone>(serverZones, "/api/canvas/zones", "zones")
  const [notes, saveNotes] = useSyncedList<Note>(serverNotes, "/api/canvas/notes", "notes")
  const [fresh, setFresh] = useState<string | null>(null) // a zone or note just made: it asks for its text

  // The places count every card, so filtering by repo moves none of them.
  const all = useMemo(() => onCanvas(cards ?? []), [cards])
  const done = useMemo(() => (cards ?? []).filter(c => c.column === "done"), [cards])
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
      const zoneNodes = zones.map(z => keep({
        id: `zone:${z.id}`, type: "zone", position: { x: z.x, y: z.y }, zIndex: z.collapsed ? 0 : -1,
        data: { zone: z, members: all.filter(c => isInZone(z, at[c.id])), isNew: fresh === z.id, onChange: changeZone, onRemove: removeZone } satisfies ZoneNodeData,
        ...(z.collapsed ? {} : { style: { width: z.w, height: z.h } }),
      }))
      const noteNodes = notes.flatMap(n => {
        const p = noteAt(n, cardAt)
        if (!p || (!n.cardId && folded.some(z => isInZone(z, p)))) return []
        return [keep({
          id: `note:${n.id}`, type: "note", position: p, dragHandle: ".note-drag", zIndex: 2, style: { width: n.w, height: n.h },
          data: { note: n, isNew: fresh === n.id, onText: textNote, onChange: changeNote, onRemove: removeNote } satisfies NoteNodeData,
        })]
      })
      return [...zoneNodes, ...shownCards.map(c => keep({ id: c.id, type: "session", position: at[c.id], zIndex: 1, data: { card: c, now } })), ...noteNodes]
    })
  }, [zones, notes, shownCards, all, at, now, fresh, folded, cardAt, changeZone, removeZone, changeNote, textNote, removeNote])
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(ns => applyNodeChanges(changes, ns)), [])

  // A zone carries the cards and free notes inside it when the drag starts.
  const carried = useRef<{ zone: string; start: Point; cards: { id: string; from: Point }[]; notes: { id: string; from: Point }[] } | null>(null)
  const [isOverDone, setOverDone] = useState(false)
  const onNodeDragStart: OnNodeDrag = (_, node) => {
    if (node.type !== "zone") return
    const zone = (node.data as ZoneNodeData).zone
    carried.current = {
      zone: node.id, start: node.position,
      cards: all.filter(c => isInZone(zone, at[c.id])).map(c => ({ id: c.id, from: at[c.id] })),
      notes: notes.filter(n => !n.cardId && isInZone(zone, n)).map(n => ({ id: `note:${n.id}`, from: { x: n.x, y: n.y } })),
    }
  }
  const onNodeDrag: OnNodeDrag = (e, node) => {
    if (node.type === "session") setOverDone(isOverDock(e as unknown as MouseEvent))
    const c = carried.current
    if (!c || c.zone !== node.id) return
    const dx = node.position.x - c.start.x
    const dy = node.position.y - c.start.y
    const from = new Map([...c.cards, ...c.notes].map(k => [k.id, k.from]))
    setNodes(ns => ns.map(n => (from.has(n.id) ? { ...n, position: { x: from.get(n.id)!.x + dx, y: from.get(n.id)!.y + dy } } : n)))
  }
  const onNodeDragStop: OnNodeDrag = (e, node, dragged) => {
    setOverDone(false)
    const save = (id: string, p: Point) => {
      const to = { x: snap(p.x), y: snap(p.y) }
      setMoved(m => ({ ...m, [id]: to }))
      moveTo(id, to).catch((err: Error) => toast.error(err.message))
    }
    const sessions = dragged.filter(n => n.type === "session")
    if (sessions.length && isOverDock(e as unknown as MouseEvent)) {
      for (const n of sessions) act(n.id, "done").then(() => toast("Done"), (err: Error) => toast.error(err.message))
    } else for (const n of sessions) save(n.id, n.position)

    for (const n of dragged.filter(d => d.type === "note")) {
      const note = (n.data as NoteNodeData).note
      const targets = shownCards.map(c => ({ key: cardKey(c), at: at[c.id], h: CARD_H_GUESS }))
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

  // New zones and notes go where you look (the middle of the view), or where
  // you double-click.
  const flow = useRef<ReactFlowInstance | null>(null)
  const middle = (): Point => {
    const box = document.querySelector(".react-flow")?.getBoundingClientRect()
    return flow.current && box ? flow.current.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }) : { x: GRID, y: GRID }
  }
  const addZone = () => {
    const p = middle()
    const zone: Zone = { id: crypto.randomUUID(), name: "New zone", x: snap(p.x - 312), y: snap(p.y - 168), w: CARD_W * 2 + GRID * 3, h: 336 }
    setFresh(zone.id)
    saveZones([...zones, zone])
  }
  const addNote = (p = middle()) => {
    const note = newNote({ x: p.x - 108, y: p.y - 72 }, notes.length)
    setFresh(note.id)
    saveNotes([...notes, note])
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
    const zoom = Math.max(rf.getZoom(), 1)
    const panel = document.querySelector("aside[aria-label=Session]")?.getBoundingClientRect().width ?? 0
    rf.setCenter(p.x + CARD_W / 2 + panel / 2 / zoom, p.y + 70, { zoom, duration: 500 })
    setFlashId(focus.id)
    const timer = setTimeout(() => setFlashId(null), 1600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])
  const shown = useMemo(() => (flashId ? nodes.map(n => (n.id === flashId ? { ...n, className: "flash" } : n)) : nodes), [nodes, flashId])

  if (!cards) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Connecting…</div>
  return (
    <div className="size-full" onDoubleClick={e => {
      if (!(e.target as HTMLElement).classList.contains("react-flow__pane") || !flow.current) return
      addNote(flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    }}>
      <FlowCanvas
        nodes={shown} edges={[]} onInit={rf => (flow.current = rf)} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, node) => node.type === "session" && openSession(node.id)}
        panOnDrag minZoom={0.3} maxZoom={1.6} snapToGrid snapGrid={[GRID, GRID]} proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-center" className="!mt-3 flex gap-1.5">
          <Button size="sm" variant="outline" className="bg-background/80 backdrop-blur" onClick={addZone}><Plus />Zone</Button>
          <Button size="sm" variant="outline" className="bg-background/80 backdrop-blur" onClick={() => addNote()}><StickyNote />Note</Button>
        </Panel>
        <Panel position="bottom-center" className="!mb-3 w-[min(900px,calc(100%-380px))]"><DoneDock cards={done} isTarget={isOverDone} /></Panel>
        <Controls />
        <MiniMap pannable zoomable className="!bg-card" maskColor="rgb(0 0 0 / 0.5)"
          nodeColor={n => (n.type === "zone" ? "rgb(255 255 255 / 0.05)" : n.type === "note" ? "rgb(251 191 36 / 0.5)" : "rgb(255 255 255 / 0.3)")} />
      </FlowCanvas>
    </div>
  )
}
