// What a ticket's card shows in its right part: an effect a stage, drawn from
// the ticket's own data where there is some (the refinement's steps falling, a
// node a unit, the file its agent works on falling as code, a line a finding,
// a track a repo, a cell a criterion). It moves while the agent works, holds
// still in amber while it waits for you, in red once it failed, and in grey
// once done, so that every card, in every column, keeps the same shape.
import type { PipelineState, Stage } from "@server/pipeline"
import { toFix, waitingStep } from "./pipeline-board"

export type Effect = "run" | "wait" | "fail" | "done"
export type Scene = { nodes: number; marks: number; cells: ("pass" | "fail" | "untested")[]; tracks: number; glyphs: string; steps: string[] }
type Activity = { steps: { text: string; isOpen?: boolean }[] } | null

export function effectOf(state: PipelineState): Effect {
  if (state.status === "failed") return "fail"
  if (state.status === "needs-info" || toFix(state).length > 0 || waitingStep(state)) return "wait"
  return state.status === "running" ? "run" : "done"
}

const CODE = "{}()[];=<>/+*_.:01"
const STEPS = 8
export function sceneOf(state: PipelineState, activity: Activity): Scene {
  const repos = new Set((state.release?.steps ?? []).map(s => s.repo).filter(Boolean))
  const step = activity?.steps.findLast(s => s.isOpen) ?? activity?.steps.at(-1)
  const words = step?.text.split(/\s+/).filter(w => /[./]/.test(w)).join(" ") ?? ""
  return {
    nodes: state.units?.length || 5,
    marks: state.findings?.length ?? 0,
    cells: (state.results ?? []).map(r => r.status),
    tracks: repos.size || 3,
    glyphs: words ? `${words}${CODE}` : CODE,
    steps: (activity?.steps ?? []).slice(-STEPS).reverse().map(s => s.text),
  }
}

// ---------- the drawing ----------

export type Paint = { x: CanvasRenderingContext2D; w: number; h: number; t: number; scene: Scene; mem: Record<string, unknown>; ink: string; mark: string; mono: string }
type Draw = (p: Paint) => void

// What an effect keeps from frame to frame, made again when the card changes size.
const seeded = <T>(mem: Record<string, unknown>, name: string, size: number, make: () => T): T => {
  const at = `${name}:${Math.round(size)}`
  if (mem.at !== at) Object.assign(mem, { at, [name]: make() })
  return mem[name] as T
}
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const dot = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number) => (x.beginPath(), x.arc(cx, cy, r, 0, Math.PI * 2), x.fill())

// Refine: loose dots that come into lines, and loosen again.
const refine: Draw = ({ x, w, h, t, mem, ink }) => {
  const dots = seeded(mem, "refine", w + h, () => Array.from({ length: 60 }, (_, i) => ({ x: rand(0, w), y: rand(0, h), u: (i % 15) / 15, row: Math.floor(i / 15) })))
  const m = (Math.sin(t * 0.8) + 1) / 2
  const e = m * m * (3 - 2 * m)
  x.fillStyle = ink
  for (const d of dots) {
    const tx = w * 0.2 + d.u * w * 0.7
    const ty = h * 0.25 + d.row * h * 0.17
    x.globalAlpha = 0.4 + 0.6 * e
    x.fillRect(d.x + (tx - d.x) * e + Math.sin(t * 2 + d.x) * (1 - e) * 4, d.y + (ty - d.y) * e, 2, 2)
  }
}

// Plan: a graph that draws itself, a node a unit.
const plan: Draw = ({ x, w, h, t, scene, ink }) => {
  const n = Math.min(Math.max(scene.nodes, 2), 8)
  const nodes = [[0.18, 0.5], ...Array.from({ length: n }, (_, i) => [0.82, (i + 1) / (n + 1)])]
  const p = (t * 0.35) % 1.4
  x.strokeStyle = ink
  x.fillStyle = ink
  nodes.slice(1).forEach(([bx, by], i) => {
    const q = Math.min(1, Math.max(0, p * n - i * 0.8))
    x.globalAlpha = q > 0 ? 0.7 : 0
    x.beginPath()
    x.moveTo(nodes[0]![0]! * w, nodes[0]![1]! * h)
    x.lineTo((0.18 + (bx! - 0.18) * q) * w, (0.5 + (by! - 0.5) * q) * h)
    x.stroke()
    x.globalAlpha = q >= 1 ? 1 : 0.25
    dot(x, bx! * w, by! * h, 3)
  })
  x.globalAlpha = 1
  dot(x, nodes[0]![0]! * w, nodes[0]![1]! * h, 3.5)
}

// Build: code falling, made of the file its agent works on. Where each drop
// is comes from the time alone, so that a still frame shows it too.
const build: Draw = ({ x, w, h, t, scene, mem, ink, mono }) => {
  const size = 10
  const drops = seeded(mem, "build", w, () => Array.from({ length: Math.ceil(w / size) }, () => ({ at: rand(0, h + 120), v: rand(30, 70) })))
  x.font = `10px ${mono}`
  x.fillStyle = ink
  const g = scene.glyphs.replace(/\s/g, "")
  drops.forEach((d, i) => {
    const head = ((d.at + t * d.v) % (h + 120)) - 40
    for (let j = 0; j < 8; j++) {
      const y = head - j * 11
      if (y < 0 || y > h) continue
      x.globalAlpha = j ? 0.55 - j * 0.06 : 1
      x.fillText(g[(i * 7 + j * 3 + Math.floor(t * 6 + i)) % g.length]!, i * size, y)
    }
  })
}

// Review: a line reads the code from top to bottom; a finding a line in amber.
const review: Draw = ({ x, w, h, t, scene, mem, ink, mark }) => {
  const lines = seeded(mem, "review", 0, () => {
    const flagged = new Set(Array.from({ length: Math.min(scene.marks || 2, 9) }, () => Math.floor(rand(0, 9))))
    return Array.from({ length: 9 }, (_, i) => ({ width: rand(0.3, 0.9), indent: rand(0, 0.25), isFlagged: flagged.has(i) }))
  })
  const scan = ((t * 0.3) % 1.2) * h
  lines.forEach((l, i) => {
    const y = 8 + (i * (h - 16)) / 8
    const isRead = y < scan
    x.globalAlpha = isRead ? 0.85 : 0.25
    x.fillStyle = isRead && l.isFlagged ? mark : ink
    x.fillRect(w * (0.1 + l.indent), y, w * l.width * 0.75, 3)
  })
  x.globalAlpha = 0.9
  x.fillStyle = ink
  x.fillRect(0, scan, w, 1)
}

// Staging: packets that run to a box, a track a repo.
const staging: Draw = ({ x, w, h, t, scene, ink }) => {
  const n = Math.min(scene.tracks, 4)
  const box = w - 18
  x.fillStyle = ink
  x.strokeStyle = ink
  for (let r = 0; r < n; r++) {
    const y = h * ((r + 1) / (n + 1))
    x.globalAlpha = 0.2
    x.fillRect(0, y, box, 1)
    for (let j = 0; j < 3; j++) {
      const p = (t * 0.4 + j / 3 + r * 0.13) % 1
      x.globalAlpha = 0.3 + p * 0.7
      x.fillRect(p * box, y - 2, 6, 4)
    }
  }
  x.globalAlpha = 0.4 + 0.6 * (1 - ((t * 1.2) % 1))
  x.strokeRect(box, h * 0.2, 12, h * 0.6)
}

// Test: a grid that fills criterion by criterion (in amber, the ones that failed).
const test: Draw = ({ x, w, h, t, scene, ink, mark }) => {
  const cells = scene.cells.length ? scene.cells : Array.from({ length: 25 }, () => "pass" as const)
  const side = Math.ceil(Math.sqrt(cells.length))
  const s = Math.min(w, h) / (side + 1.5)
  const ox = w - s * side - 6
  const oy = (h - s * side) / 2
  const filled = Math.floor((t * 4) % (cells.length + 6))
  cells.forEach((c, i) => {
    x.globalAlpha = i >= filled ? 0.15 : c === "untested" ? 0.4 : 0.9
    x.fillStyle = i < filled && c === "fail" ? mark : ink
    x.fillRect(ox + (i % side) * s, oy + Math.floor(i / side) * s, s - 3, s - 3)
  })
}

// Prod: rings going out from a point.
const prod: Draw = ({ x, w, h, t, ink }) => {
  const cx = w * 0.85
  const cy = h / 2
  x.strokeStyle = ink
  for (let i = 0; i < 4; i++) {
    const p = (t * 0.45 + i / 4) % 1
    x.globalAlpha = (1 - p) * 0.8
    x.beginPath()
    x.arc(cx, cy, 4 + p * w * 0.8, 0, Math.PI * 2)
    x.stroke()
  }
  x.globalAlpha = 1
  x.fillStyle = ink
  dot(x, cx, cy, 3)
}

// Smoke: a heartbeat: prod is alive.
const beat = (u: number, m: number, h: number) =>
  u > 0.4 && u < 0.45 ? m - ((u - 0.4) / 0.05) * h * 0.1
    : u >= 0.45 && u < 0.5 ? m - h * 0.1 + ((u - 0.45) / 0.05) * h * 0.45
    : u >= 0.5 && u < 0.55 ? m + h * 0.35 - ((u - 0.5) / 0.05) * h * 0.45
    : u >= 0.55 && u < 0.6 ? m - h * 0.1 + ((u - 0.55) / 0.05) * h * 0.1
    : m
const smoke: Draw = ({ x, w, h, t, ink }) => {
  const period = w * 0.55
  const off = (t * 45) % period
  x.strokeStyle = ink
  x.lineWidth = 1.5
  x.globalAlpha = 0.85
  x.beginPath()
  for (let px = 0; px <= w; px++) {
    const y = beat(((px + off) % period) / period, h / 2, h)
    if (px) x.lineTo(px, y)
    else x.moveTo(px, y)
  }
  x.stroke()
}

export const DRAW: Record<Stage, Draw> = { refine, plan, build, review, staging, test, prod, smoke }
