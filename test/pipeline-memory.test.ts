import { describe, expect, it } from "bun:test"
import { AUTO_FIXES, autoNext, backRefusal, backWhy, continuePrompt, newsOf, pipelineKeyOf, spentIn, whyStart, type PipelineState, type Run } from "../lib/pipeline"
import { tookUnit } from "../lib/release"

const base: PipelineState = { key: "PP-1", stage: "refine", status: "ready", sessionId: null, runs: 1, startedAt: 1, endedAt: 2, askedAt: null, questions: [], error: null }
const run = (n: number, stage: Run["stage"], status: Run["status"] = "ready", extra: Partial<Run> = {}): Run =>
  ({ n, stage, sessionId: `s-${stage}`, startedAt: n, endedAt: n, status, questions: 0, units: 0, error: null, ...extra })

describe("on its own", () => {
  const blocker = { id: "F1", unit: "U1", severity: "blocker" as const, file: null, line: null, title: "t", detail: "", fix: "" }
  it("goes on to the review, and tests staging once it is deployed", () => {
    expect(autoNext({ ...base, auto: true })).toBe("plan")
    expect(autoNext({ ...base, auto: true, stage: "build" })).toBe("review")
    expect(autoNext({ ...base, auto: true, stage: "review" })).toBeNull()
    expect(autoNext({ ...base, auto: true, stage: "staging" })).toBe("test")
    expect(autoNext({ ...base, auto: false })).toBeNull()
  })
  it("fixes what a review or a test found a few times, then waits for you", () => {
    expect(autoNext({ ...base, auto: true, stage: "review", findings: [blocker] })).toBe("build")
    expect(autoNext({ ...base, auto: true, stage: "test", results: [{ id: "T1", criterion: "c", status: "fail", evidence: "" }] })).toBe("build")
    expect(autoNext({ ...base, auto: true, stage: "review", findings: [blocker], autoFixes: AUTO_FIXES })).toBeNull()
  })
  it("stops where a person decides: a criterion nobody could try", () => {
    expect(autoNext({ ...base, auto: true, stage: "test", results: [{ id: "T1", criterion: "c", status: "untested", evidence: "" }] })).toBeNull()
  })
})

describe("sending it back", () => {
  it("to refine, plan or build, once the stage before it was done, and not while one runs", () => {
    expect(backRefusal({ ...base, stage: "test", history: [run(1, "refine"), run(2, "plan")] }, "build")).toBeNull()
    expect(backRefusal({ ...base, history: [run(1, "refine")] }, "build")).toMatch(/plan done first/i)
    expect(backRefusal({ ...base, status: "running" }, "refine")).toMatch(/runs/)
    expect(backRefusal(base, "review")).toMatch(/Refine, Plan or Build/)
  })
  it("tells the stage what you said, what people wrote, and that what is deployed stays", () => {
    const state = { ...base, stage: "test" as const, deployed: { staging: { env: "staging" as const, steps: [] } }, news: { comments: [{ author: "Francisco", at: Date.parse("2026-11-09"), body: "Also the export" }] } }
    const why = backWhy(state, "plan", "Add the export")
    expect(why.cause).toBe("Sent back: Add the export")
    expect(why.text).toContain("Add the export")
    expect(why.text).toContain("Francisco, 2026-11-09: Also the export")
    expect(why.text).toContain("unidades nuevas")
    expect(backWhy(state, "refine", "").text).not.toContain("unidades nuevas")
  })
})

describe("a stage's own session", () => {
  it("goes on with what changed, and is still the pipeline's", () => {
    const prompt = continuePrompt("PP-1", "/d/PP-1", "plan", [], "Te devuelven")
    expect(pipelineKeyOf(prompt)).toBe("PP-1")
    expect(prompt).toContain("Te devuelven")
    expect(prompt).toContain("plan.json.prev")
  })
  it("a run again after a stop goes on where it was; a fix says what it fixes", () => {
    expect(whyStart({ ...base, status: "failed", error: "Stopped by you" }, "refine")?.cause).toBe("Run again")
    expect(whyStart({ ...base, stage: "review" }, "build")?.cause).toBe("Fix the review")
    expect(whyStart({ ...base }, "plan")).toBeUndefined()
  })
  it("each run spends what it added to the session", () => {
    const spend = (cost: number) => ({ input: cost, output: 0, cacheRead: 0, cacheWrite: 0, cost, model: "m" })
    const history = [run(1, "refine", "needs-info"), run(2, "refine", "ready", { base: spend(3) })]
    expect(spentIn(history[0]!, history, spend(5))?.cost).toBe(3)
    expect(spentIn(history[1]!, history, spend(5))?.cost).toBe(2)
  })
})

describe("what people wrote since the last run", () => {
  it("is a person's, not the board's", () => {
    const c = (body: string, at: number) => ({ id: String(at), author: "A", authorId: null, at, body })
    expect(newsOf([c("🤖 Agent Center · done", 5), c("PR: https://x", 6), c("Respuestas a las preguntas del pipeline", 7), c("Old", 1), c("New scope", 8)] as never, 2))
      .toEqual({ comments: [{ author: "A", at: 8, body: "New scope" }] })
    expect(newsOf([], 2)).toBeNull()
  })
})

describe("what an environment runs", () => {
  it("a new PR under an id used before is new work", () => {
    const steps = [{ unit: "U1", links: [{ label: "PR #1", url: "https://github.com/o/r/pull/1" }] }]
    expect(tookUnit(steps, { id: "U1", pr: "https://github.com/o/r/pull/1" })).toBe(true)
    expect(tookUnit(steps, { id: "U1", pr: "https://github.com/o/r/pull/9" })).toBe(false)
    expect(tookUnit([{ unit: "U1" }], { id: "U1", pr: null })).toBe(true)
  })
})

describe("a review after a fix", () => {
  it("reviews only what changed since the last review", () => {
    const state = { ...base, stage: "build" as const, fixing: { from: "review" as const, ids: ["F1"] }, findings: [{ id: "F1", unit: "U1", severity: "major" as const, file: null, line: null, title: "t", detail: "", fix: "" }],
      units: [{ id: "U1", repo: "r", subtask: null, branch: "b", title: "t", dependsOn: [], pr: "https://github.com/o/r/pull/1" }], history: [run(13, "review", "ready", { endedAt: Date.parse("2026-11-10T10:00:00Z") })] }
    const why = whyStart(state, "review")
    expect(why?.cause).toBe("Review the fix")
    expect(why?.text).toContain("U1 (https://github.com/o/r/pull/1)")
    expect(why?.text).toContain("2026-11-10T10:00:00.000Z")
    expect(whyStart({ ...state, fixing: null }, "review")).toBeUndefined()
    const sent = { ...state, fixing: null, history: [...state.history, run(14, "build", "ready", { cause: "Sent back: copies" })] }
    expect(whyStart(sent, "review")?.cause).toBe("Review the change")
    expect(whyStart(sent, "review")?.text).toContain("sent-back.md")
  })
})
