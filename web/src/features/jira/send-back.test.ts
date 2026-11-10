import { describe, expect, it } from "vitest"
import type { PipelineState } from "@server/pipeline"
import { backDefault, backLine, canGoBack } from "./send-back"

const base = { key: "PP-1", stage: "test", status: "ready", sessionId: null, runs: 5, startedAt: 1, endedAt: 2, askedAt: null, questions: [], error: null } as PipelineState
const run = (n: number, stage: string, status = "ready") => ({ n, stage, status, sessionId: null, startedAt: n, endedAt: n, questions: 0, units: 0, error: null })

describe("sending it back", () => {
  it("to a stage once the one before it was done", () => {
    const state = { ...base, history: [run(1, "refine")] } as PipelineState
    expect(canGoBack(state, "refine")).toBe(true)
    expect(canGoBack(state, "plan")).toBe(true)
    expect(canGoBack(state, "build")).toBe(false)
  })
  it("to the refinement when people wrote in Jira, else the stage it is in, at most Build", () => {
    expect(backDefault({ ...base, news: { comments: [{ author: "A", at: 1, body: "x" }] } })).toBe("refine")
    expect(backDefault({ ...base, stage: "plan" })).toBe("plan")
    expect(backDefault(base)).toBe("build")
  })
  it("says what follows, and whether it goes on alone", () => {
    expect(backLine(base, "refine")).toBe("Refine picks up where it left off, with what you write. Then Plan, Build and Review, each when you start it.")
    expect(backLine({ ...base, auto: true }, "build")).toBe("Build picks up where it left off, with what you write. Then Review, on their own.")
  })
})
