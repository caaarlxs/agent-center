import { describe, expect, it } from "vitest"
import { carriedResults, columnOf, isQueued, nextStage, passesOf, toFix, tonesOf, untested, waitingStep } from "./pipeline-board"

type At = "refine" | "plan" | "build" | "review" | "staging" | "test" | "prod" | "smoke"
const at = (stage: At, status: "running" | "needs-info" | "ready" | "failed", findings?: { id: string; severity: string }[], release?: unknown) => ({ stage, status, findings, release }) as never

describe("columnOf", () => {
  it("puts a ticket in its stage's column while the stage is open", () => {
    expect(columnOf(at("refine", "running"))).toBe(0)
    expect(columnOf(at("plan", "needs-info"))).toBe(1)
    expect(columnOf(at("plan", "failed"))).toBe(1)
  })
  it("moves a ticket whose stage is done to the next column, waiting", () => {
    expect(columnOf(at("refine", "ready"))).toBe(1)
    expect(columnOf(at("plan", "ready"))).toBe(2)
    expect(isQueued(at("plan", "ready"))).toBe(true)
    expect(isQueued(at("plan", "running"))).toBe(false)
  })
  it("offers the next stage there is an agent for", () => {
    expect(nextStage(at("refine", "ready"))).toBe("plan")
    expect(nextStage(at("plan", "ready"))).toBe("build")
    expect(nextStage(at("build", "ready"))).toBe("review")
    expect(nextStage(at("review", "ready"))).toBe("staging")
    expect(nextStage(at("staging", "ready"))).toBe("test")
    expect(nextStage(at("test", "ready"))).toBe("prod")
    expect(nextStage(at("prod", "ready"))).toBe("smoke")
    expect(nextStage(at("smoke", "ready"))).toBeNull()
    expect(nextStage(at("plan", "running"))).toBeNull()
  })
})

describe("a review", () => {
  const found = [{ id: "F1", severity: "major" }, { id: "F2", severity: "minor" }]
  it("sends its blockers and majors back to the build, and the ticket stays in Review", () => {
    expect(toFix(at("review", "ready", found)).map(f => f.id)).toEqual(["F1"])
    expect(nextStage(at("review", "ready", found))).toBe("build")
    expect(columnOf(at("review", "ready", found))).toBe(3)
    expect(isQueued(at("review", "ready", found))).toBe(false)
  })
  it("with only minors, lets the ticket wait for staging", () => {
    const minor = [{ id: "F2", severity: "minor" }]
    expect(toFix(at("review", "ready", minor))).toEqual([])
    expect(columnOf(at("review", "ready", minor))).toBe(4)
    expect(isQueued(at("review", "ready", minor))).toBe(true)
  })
  it("counts nothing to fix on a ticket at another stage", () => {
    expect(toFix(at("build", "ready", found))).toEqual([])
  })
})

describe("a release", () => {
  it("tests in the Staging column and checks in the Prod one; once checked in prod, it waits for nothing", () => {
    expect(columnOf(at("staging", "ready"))).toBe(4)
    expect(isQueued(at("staging", "ready"))).toBe(true)
    expect(columnOf(at("test", "running"))).toBe(4)
    expect(columnOf(at("test", "ready"))).toBe(5)
    expect(columnOf(at("prod", "ready"))).toBe(5)
    expect(columnOf(at("smoke", "ready"))).toBe(5)
    expect(isQueued(at("smoke", "ready"))).toBe(false)
  })
  it("keeps a ticket whose test failed in Staging, waiting for you", () => {
    const failed = { stage: "test", status: "ready", results: [{ id: "T1", status: "fail" }, { id: "T2", status: "pass" }] } as never
    expect(nextStage(failed)).toBeNull()
    expect(columnOf(failed)).toBe(4)
    expect(tonesOf(failed)[4]).toBe("ask")
  })
  it("tells the step that waits for you", () => {
    const release = { env: "staging", steps: [{ id: "R1", status: "done" }, { id: "R2", status: "waiting" }, { id: "R3", status: "pending" }] }
    expect(waitingStep(at("staging", "running", [], release))?.id).toBe("R2")
    expect(waitingStep(at("staging", "ready", [], release))).toBeUndefined()
    expect(waitingStep(at("build", "running"))).toBeUndefined()
  })
})

describe("tonesOf", () => {
  it("marks the stages done, the one at hand by its state, and the next one waiting", () => {
    const state = { stage: "review", status: "ready", findings: [{ id: "F1", severity: "minor" }] } as never
    expect(tonesOf(state)).toEqual(["done", "done", "done", "done", "next", "todo"])
  })
  it("shows what waits for you, a release under way and one that failed", () => {
    expect(tonesOf({ stage: "review", status: "ready", findings: [{ id: "F1", severity: "major" }] } as never)[3]).toBe("ask")
    const release = { env: "staging", steps: [{ status: "done" }, { status: "waiting" }, { status: "pending" }] }
    const deploying = { stage: "staging", status: "running", release } as never
    expect(tonesOf(deploying)[4]).toBe("ask")
    expect(tonesOf({ ...(deploying as object), status: "failed" } as never)[4]).toBe("bad")
    expect(tonesOf({ stage: "plan", status: "running" } as never)).toEqual(["done", "work", "todo", "todo", "todo", "todo"])
  })
})

describe("what runs spent", () => {
  it("says tokens and dollars short, and adds up the runs", async () => {
    const { tokens, dollars, costOf } = await import("./pipeline-board")
    expect([tokens(3_687_970), tokens(55_157), tokens(706)]).toEqual(["3.7M", "55k", "706"])
    expect([dollars(4.1), dollars(12.4)]).toEqual(["$4.10", "$12"])
    expect(costOf([{ spend: { cost: 1.5 } }, { spend: null }, {}])).toBe(1.5)
  })
})

describe("criteria the test could not try", () => {
  const tested = (statuses: string[]) => ({ stage: "test", status: "ready", results: statuses.map((status, i) => ({ id: `T${i}`, status })) }) as never
  it("wait for you: the ticket stays at the test, not at prod's door", () => {
    expect(untested(tested(["pass", "untested"]))).toHaveLength(1)
    expect(nextStage(tested(["pass", "untested"]))).toBeNull()
    expect(isQueued(tested(["pass", "untested"]))).toBe(false)
    expect(nextStage(tested(["pass", "pass"]))).toBe("prod")
  })
})

describe("the passes of a stage", () => {
  const run = (n: number, stage: string, status = "ready", units = 3) => ({ n, stage, status, units, questions: 0, startedAt: n, endedAt: n + 1, sessionId: null, error: null })
  const history = [run(1, "refine"), run(2, "plan"), run(3, "build"), run(4, "review"), run(5, "staging"), run(6, "test"), run(7, "build", "ready", 4), run(8, "review", "running")]
  it("are the runs of its agent that ended, the test's in Staging, oldest first", () => {
    expect(passesOf(history as never, "build").map(r => r.n)).toEqual([3, 7])
    expect(passesOf(history as never, "staging").map(r => r.n)).toEqual([6])
    expect(passesOf(history as never, "review").map(r => r.n)).toEqual([4])
  })
})

describe("carriedResults", () => {
  const r = (id: string, status = "pass") => ({ id, status, criterion: id })
  const first = [r("CA1"), r("CA2", "fail"), r("CA3", "fail")]
  const second = [r("CA2"), r("CA3", "fail")]
  const third = [r("CA3")]
  const history = [{ stage: "test", kept: { results: first } }, { stage: "build" }, { stage: "test", kept: { results: second } }, { stage: "test", kept: { results: third } }]
  it("adds what earlier passes tried and this one did not, the latest first", () => {
    const state = { stage: "test", results: third, history } as never
    expect(carriedResults(state).map(x => [x.id, x.status])).toEqual([["CA2", "pass"], ["CA1", "pass"]])
  })
  it("a past pass carries only what came before it", () => {
    expect(carriedResults({ stage: "test", results: second, history } as never).map(x => x.id)).toEqual(["CA1"])
    expect(carriedResults({ stage: "test", results: first, history } as never)).toEqual([])
  })
  it("the live state, read apart from its history, counts every pass", () => {
    expect(carriedResults({ stage: "test", results: [r("CA3")], history } as never).map(x => x.id)).toEqual(["CA2", "CA1"])
  })
})
