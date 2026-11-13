import { describe, expect, it } from "vitest"
import type { PipelineState } from "@server/pipeline"
import type { Release } from "@server/release"
import { releasePasses, releaseShown } from "./pipeline-board"

const last = { env: "staging", steps: [] } as Release
const next = { env: "staging", steps: [] } as unknown as Release
const at = (stage: string) => ({ key: "PP-1", stage, status: "ready", release: last } as unknown as PipelineState)
describe("the release a column shows", () => {
  it("the one about to start when a fix waits at its door; the one that ran while it is there", () => {
    expect(releaseShown(at("review"), next, "staging")).toBe(next)
    expect(releaseShown(at("staging"), next, "staging")).toBe(last)
    expect(releaseShown(at("test"), null, "staging")).toBe(last)
  })
})

describe("staging's passes", () => {
  const r = (n: number, stage: string, kept?: object) => ({ n, stage, status: "ready", sessionId: null, startedAt: n, endedAt: n, questions: 0, units: 0, error: null, ...(kept ? { kept } : {}) })
  const one = { env: "staging", steps: [{ id: "R1" }] }, two = { env: "staging", steps: [{ id: "R1b" }] }
  const history = [r(1, "review"), r(2, "staging"), r(3, "test", { results: [{ id: "CA3", status: "fail" }] }), r(4, "build"), r(5, "staging", { release: two }), r(6, "test", { results: [{ id: "CA3", status: "pass" }] })]
  it("a release each, with the test that followed it; the last one there is the live view", () => {
    const state = { key: "PP-1", stage: "test", status: "ready", history, deployed: { staging: one } } as unknown as PipelineState
    const passes = releasePasses(state, "staging")
    expect(passes.map(p => p.n)).toEqual([2, 5])
    expect(passes[0]!.past).toMatchObject({ release: one, stage: "test", results: [{ id: "CA3", status: "fail" }] })
    expect(passes[1]!.isLive).toBe(true)
  })
  it("waiting at the door with a fix, every release so far is past", () => {
    const state = { key: "PP-1", stage: "review", status: "ready", history: history.slice(0, 4), deployed: { staging: one } } as unknown as PipelineState
    expect(releasePasses(state, "staging").map(p => p.isLive)).toEqual([false])
  })
})
