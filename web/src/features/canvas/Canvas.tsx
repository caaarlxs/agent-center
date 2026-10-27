// The canvas: sessions as cards you place anywhere, and named zones that group
// them, on React Flow (pan, zoom, selection, minimap). A card dragged lands on
// the grid and its place is saved; a zone dragged carries the cards inside it.
// What a card shows follows the zoom (SessionCard's level).
import {
  type Node, type NodeChange, type NodeProps, type OnNodeDrag, MiniMap, applyNodeChanges, useStore,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Canvas as FlowCanvas } from "@/components/ai-elements/canvas"
import { Controls } from "@/components/ai-elements/controls"
import { post } from "@/lib/api"
import type { Card, Zone } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { moveTo } from "@/features/session/actions"
import { type Level, SessionCard } from "@/features/session/SessionCard"
import { hueOf } from "@/features/session/state"
import { type Point, isInZone, onCanvas, placeCards, snap } from "./geometry"

type SessionNodeData = { card: Card; now: number }
type ZoneNodeData = { zone: Zone }

const levelOf = (zoom: number): Level => (zoom < 0.62 ? "far" : zoom < 0.9 ? "mid" : "near")

function SessionNode({ data, selected }: NodeProps<Node<SessionNodeData>>) {
  const zoom = useStore(s => s.transform[2])
  // Far, the title is drawn larger the smaller the canvas is drawn, so it
  // keeps a readable size on screen.
  return <SessionCard card={data.card} now={data.now} level={levelOf(zoom)} textScale={Math.min(1 / zoom, 2)} isSelected={selected} />
}

function ZoneNode({ data }: NodeProps<Node<ZoneNodeData>>) {
  const scale = useStore(s => Math.min(1 / s.transform[2], 2.2))
  const hue = hueOf(data.zone.name)
  return (
    <div className="size-full rounded-2xl" style={{ background: `oklch(0.7 0.12 ${hue} / 0.04)`, boxShadow: `inset 0 0 0 1px oklch(0.7 0.12 ${hue} / 0.3)` }}>
      <div className="truncate px-4 pt-2.5 font-semibold" style={{ color: `oklch(0.8 0.12 ${hue})`, fontSize: 13 * scale }}>{data.zone.name}</div>
    </div>
  )
}

const nodeTypes = { session: SessionNode, zone: ZoneNode }

const zoneNode = (z: Zone): Node<ZoneNodeData> => ({
  id: `zone:${z.id}`, type: "zone", position: { x: z.x, y: z.y }, data: { zone: z },
  style: { width: z.w, height: z.h }, zIndex: -1, dragHandle: undefined,
})

export function Canvas() {
  const cards = useLive(l => l.snapshot?.cards)
  const zones = useLive(l => l.snapshot?.zones)
  const now = useNow()
  const open = useMemo(() => onCanvas(cards ?? []), [cards])
  // Places moved here and not saved yet: the server's copy is older until it
  // reports the same place back.
  const [moved, setMoved] = useState<Record<string, Point>>({})
  useEffect(() => {
    setMoved(m => {
      const next = { ...m }
      for (const c of open) if (next[c.id] && c.pos && c.pos.x === next[c.id].x && c.pos.y === next[c.id].y) delete next[c.id]
      return next
    })
  }, [open])
  const at = useMemo(() => placeCards(open, moved), [open, moved])

  // The nodes React Flow draws: rebuilt from the live state, keeping what the
  // person is doing (a drag under way, the selection).
  const [nodes, setNodes] = useState<Node[]>([])
  useEffect(() => {
    setNodes(prev => {
      const before = new Map(prev.map(n => [n.id, n]))
      const keep = (n: Node): Node => {
        const was = before.get(n.id)
        return was ? { ...n, selected: was.selected, ...(was.dragging ? { position: was.position, dragging: true } : {}) } : n
      }
      return [
        ...(zones ?? []).filter(z => !z.collapsed).map(z => keep(zoneNode(z))),
        ...open.map(c => keep({ id: c.id, type: "session", position: at[c.id], data: { card: c, now } })),
      ]
    })
  }, [open, zones, at, now])
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(ns => applyNodeChanges(changes, ns)), [])

  // A zone carries the cards inside it when the drag starts.
  const carried = useRef<{ zone: string; start: Point; cards: { id: string; from: Point }[] } | null>(null)
  const onNodeDragStart: OnNodeDrag = (_, node) => {
    if (node.type !== "zone") return
    const zone = (node.data as ZoneNodeData).zone
    carried.current = { zone: node.id, start: node.position, cards: open.filter(c => isInZone(zone, at[c.id])).map(c => ({ id: c.id, from: at[c.id] })) }
  }
  const onNodeDrag: OnNodeDrag = (_, node) => {
    const c = carried.current
    if (!c || c.zone !== node.id) return
    const dx = node.position.x - c.start.x
    const dy = node.position.y - c.start.y
    const ids = new Map(c.cards.map(k => [k.id, k.from]))
    setNodes(ns => ns.map(n => (ids.has(n.id) ? { ...n, position: { x: ids.get(n.id)!.x + dx, y: ids.get(n.id)!.y + dy } } : n)))
  }
  const onNodeDragStop: OnNodeDrag = (_, node, dragged) => {
    const save = (id: string, p: Point) => {
      const to = { x: snap(p.x), y: snap(p.y) }
      setMoved(m => ({ ...m, [id]: to }))
      moveTo(id, to).catch((err: Error) => toast.error(err.message))
      return to
    }
    for (const n of dragged) if (n.type === "session") save(n.id, n.position)
    const c = carried.current
    if (node.type === "zone" && c && zones) {
      const dx = snap(node.position.x) - c.start.x
      const dy = snap(node.position.y) - c.start.y
      for (const k of c.cards) save(k.id, { x: k.from.x + dx, y: k.from.y + dy })
      const id = node.id.slice("zone:".length)
      post("/api/canvas/zones", { zones: zones.map(z => (z.id === id ? { ...z, x: snap(node.position.x), y: snap(node.position.y) } : z)) })
        .catch((err: Error) => toast.error(err.message))
    }
    carried.current = null
  }

  if (!cards) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Connecting…</div>
  return (
    <FlowCanvas
      nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
      panOnDrag minZoom={0.3} maxZoom={1.6} snapToGrid snapGrid={[24, 24]} proOptions={{ hideAttribution: true }}
    >
      <Controls />
      <MiniMap pannable zoomable className="!bg-card" maskColor="rgb(0 0 0 / 0.5)"
        nodeColor={n => (n.type === "zone" ? "rgb(255 255 255 / 0.05)" : "rgb(255 255 255 / 0.3)")} />
    </FlowCanvas>
  )
}
