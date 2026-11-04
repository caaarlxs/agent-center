import { describe, expect, it } from "vitest"
import { DRAW, effectOf, sceneOf } from "./stage-effects"

const state = (extra: Record<string, unknown>) => ({ key: "PP-1", stage: "build", status: "running", questions: [], ...extra }) as never

describe("effectOf", () => {
  it("moves while its agent works, holds still in amber while it waits for you, and in red once it failed", () => {
    expect(effectOf(state({}))).toBe("run")
    expect(effectOf(state({ status: "needs-info" }))).toBe("wait")
    expect(effectOf(state({ stage: "review", status: "ready", findings: [{ id: "F1", severity: "blocking" }] }))).toBe("wait")
    expect(effectOf(state({ stage: "staging", release: { steps: [{ id: "R1", status: "waiting" }] } }))).toBe("wait")
    expect(effectOf(state({ status: "failed" }))).toBe("fail")
  })
  it("goes away once the stage is done", () => {
    expect(effectOf(state({ status: "ready" }))).toBe("off")
  })
})

describe("sceneOf", () => {
  it("draws a node a unit, a line a finding, a cell a criterion", () => {
    const scene = sceneOf(
      state({
        units: [{ id: "U1", repo: "deal-service" }, { id: "U2", repo: "web" }, { id: "U3", repo: "web" }],
        findings: [{ id: "F1", severity: "blocking" }, { id: "F2", severity: "minor" }],
        results: [{ id: "C1", status: "pass" }, { id: "C2", status: "fail" }],
      }),
      null,
    )
    expect(scene.nodes).toBe(3)
    expect(scene.marks).toBe(2)
    expect(scene.cells).toEqual(["pass", "fail"])
  })
  it("runs a track a repo the release touches", () => {
    const scene = sceneOf(state({ stage: "staging", release: { steps: [{ repo: "deal-service" }, { repo: "web" }, { repo: "web" }, { repo: null }] } }), null)
    expect(scene.tracks).toBe(2)
  })
  it("rains what its agent works on now", () => {
    const scene = sceneOf(state({}), { steps: [{ text: "Read lib/a.ts", isOpen: false }, { text: "Edit deal/ebitda.py", isOpen: true }], helpers: [], units: [] } as never)
    expect(scene.glyphs).toContain("ebitda.py")
  })
  it("keeps a shape of its own while there is nothing to draw it from", () => {
    const scene = sceneOf(state({}), null)
    expect(scene.nodes).toBeGreaterThan(0)
    expect(scene.tracks).toBeGreaterThan(0)
    expect(scene.glyphs.length).toBeGreaterThan(0)
    expect(scene.cells).toEqual([])
  })
})

// A canvas that counts what is drawn on it.
const counting = () => {
  const drawn = { n: 0 }
  const x = new Proxy({}, { get: (_, k) => (String(k).startsWith("fill") || k === "stroke" ? () => drawn.n++ : () => {}), set: () => true })
  return { x: x as CanvasRenderingContext2D, drawn }
}
const paint = (stage: keyof typeof DRAW, t: number) => {
  const { x, drawn } = counting()
  DRAW[stage]({ x, w: 100, h: 110, t, scene: sceneOf(state({}), null), mem: {}, ink: "#0f0", mark: "#fa0", mono: "monospace" })
  return drawn.n
}

describe("DRAW", () => {
  it("shows something in a single still frame (waiting, reduced motion), every stage", () => {
    for (const stage of Object.keys(DRAW) as (keyof typeof DRAW)[]) expect(paint(stage, 1.5), stage).toBeGreaterThan(0)
  })
  it("has an effect for every stage", () => {
    expect(Object.keys(DRAW).sort()).toEqual(["build", "plan", "prod", "refine", "review", "smoke", "staging", "test"])
  })
})
