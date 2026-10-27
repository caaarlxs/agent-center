// The canvas on React Flow (MIT), through AI Elements' Canvas and Controls:
// pan, zoom, a minimap, zones as group nodes, and session cards whose detail
// follows the zoom (semantic zoom), all built in.
import { MiniMap, type Node, type NodeProps, useStore } from "@xyflow/react"
import { Canvas } from "@/components/ai-elements/canvas"
import { Controls } from "@/components/ai-elements/controls"
import { SESSIONS, ZONES, type Session } from "./data"
import { type Level, SessionCard } from "./session"

const levelOf = (zoom: number): Level => (zoom < 0.62 ? "far" : zoom < 0.9 ? "mid" : "near")

function SessionNode({ data }: NodeProps<Node<{ session: Session }>>) {
  const zoom = useStore(s => s.transform[2])
  return <SessionCard session={data.session} level={levelOf(zoom)} />
}

function ZoneNode({ data }: NodeProps<Node<{ name: string; hue: number }>>) {
  const zoom = useStore(s => s.transform[2])
  return (
    <div className="size-full rounded-2xl" style={{ background: `oklch(0.7 0.12 ${data.hue} / 0.05)`, boxShadow: `inset 0 0 0 1px oklch(0.7 0.12 ${data.hue} / 0.3)` }}>
      <div className="px-4 pt-2.5 font-semibold" style={{ color: `oklch(0.78 0.12 ${data.hue})`, fontSize: 13 * Math.min(1 / zoom, 2.2) }}>{data.name}</div>
    </div>
  )
}

const nodeTypes = { session: SessionNode, zone: ZoneNode }

const PLACES: Record<string, { x: number; y: number; zone?: string }> = {
  s1: { x: 24, y: 56, zone: "z1" }, s2: { x: 328, y: 56, zone: "z1" }, s3: { x: 24, y: 240, zone: "z1" }, s4: { x: 328, y: 240, zone: "z1" },
  s6: { x: 24, y: 56, zone: "z2" }, s7: { x: 24, y: 240, zone: "z2" }, s5: { x: 1080, y: 56 }, s8: { x: 1080, y: 240 },
}

const NODES: Node[] = [
  ...ZONES.map(z => ({ id: z.id, type: "zone", position: { x: z.x, y: z.y }, data: { name: z.name, hue: z.hue }, style: { width: z.w, height: z.h }, selectable: true })),
  ...SESSIONS.map(s => ({
    id: s.id, type: "session", position: { x: PLACES[s.id].x, y: PLACES[s.id].y }, data: { session: s },
    ...(PLACES[s.id].zone ? { parentId: PLACES[s.id].zone, extent: "parent" as const } : {}),
  })),
]

export function CanvasDemo() {
  return (
    <div className="h-[620px] w-full overflow-hidden rounded-xl border">
      <Canvas defaultNodes={NODES} defaultEdges={[]} nodeTypes={nodeTypes} panOnDrag minZoom={0.3} maxZoom={1.6} proOptions={{ hideAttribution: true }}>
        <Controls />
        <MiniMap pannable zoomable className="!bg-card" maskColor="rgb(0 0 0 / 0.5)" nodeColor={n => (n.type === "zone" ? "rgb(255 255 255 / 0.06)" : "rgb(255 255 255 / 0.3)")} />
      </Canvas>
    </div>
  )
}
