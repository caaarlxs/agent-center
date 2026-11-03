import { describe, expect, it } from "vitest"
import { columnOf, isQueued, journeyOf, nextStage, toFix, waitingStep } from "./pipeline-board"

type At = "refine" | "plan" | "build" | "review" | "staging" | "prod"
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
    expect(nextStage(at("staging", "ready"))).toBe("prod")
    expect(nextStage(at("prod", "ready"))).toBeNull()
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
  it("waits for prod in the Prod column, and stays there once live", () => {
    expect(columnOf(at("staging", "ready"))).toBe(5)
    expect(isQueued(at("staging", "ready"))).toBe(true)
    expect(columnOf(at("prod", "ready"))).toBe(5)
    expect(isQueued(at("prod", "ready"))).toBe(false)
  })
  it("tells the step that waits for you", () => {
    const release = { env: "staging", steps: [{ id: "R1", status: "done" }, { id: "R2", status: "waiting" }, { id: "R3", status: "pending" }] }
    expect(waitingStep(at("staging", "running", [], release))?.id).toBe("R2")
    expect(waitingStep(at("staging", "ready", [], release))).toBeUndefined()
    expect(waitingStep(at("build", "running"))).toBeUndefined()
  })
})

describe("journeyOf", () => {
  const units = [{ id: "U1", repo: "a", pr: "https://x/pull/1" }, { id: "U2", repo: "b", pr: null }]
  const history = [{ stage: "refine", questions: 4 }, { stage: "refine", questions: 0 }, { stage: "plan", questions: 0 }]
  it("says each stage done so far in one fact, the one at hand by its state, and the next one waiting", () => {
    const state = { stage: "review", status: "ready", units, history, findings: [{ id: "F1", severity: "minor" }] } as never
    const preview = { env: "staging", steps: [{ status: "pending" }, { status: "pending" }] } as never
    expect(journeyOf(state, preview).map(n => [n.tone, n.fact])).toEqual([
      ["done", "4 decisions"], ["done", "2 units"], ["done", "1 PR"], ["done", "1 minor"], ["next", "2 steps"], ["todo", null],
    ])
  })
  it("shows what waits for you, and a release under way by its steps", () => {
    const fix = { stage: "review", status: "ready", units, history, findings: [{ id: "F1", severity: "major" }] } as never
    expect(journeyOf(fix, null)[3]).toEqual({ stage: "review", tone: "ask", fact: "1 to fix" })
    const release = { env: "staging", steps: [{ status: "done" }, { status: "waiting" }, { status: "pending" }] }
    const deploying = { stage: "staging", status: "running", units, history, release } as never
    expect(journeyOf(deploying, null)[4]).toEqual({ stage: "staging", tone: "ask", fact: "1/3 steps" })
    expect(journeyOf({ ...(deploying as object), status: "failed" } as never, null)[4]!.tone).toBe("bad")
    expect(journeyOf({ stage: "plan", status: "running", history } as never, null).map(n => n.tone)).toEqual(["done", "work", "todo", "todo", "todo", "todo"])
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
