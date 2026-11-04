import { describe, expect, it } from "bun:test"
import { canJudge, gatePrompt, parseAdvice } from "../lib/gate"

const step = (kind: string, extra = {}) => ({ id: "R1", kind, title: "Backfill: simulate", status: "waiting", phase: "script", detail: "37 records: 30 write, 7 skip", items: [], report: "S1-staging-simulate.csv", script: "S1", value: null, ...extra }) as never

describe("canJudge", () => {
  it("judges what a step is about to do from what it shows: a simulation, a dry run, a tag, a release PR, a script for real", () => {
    expect(["simulate", "execute", "tag", "promote"].every(k => canJudge(step(k)))).toBe(true)
  })
  it("leaves to a person what only a person can do, and a deploy nobody saw", () => {
    expect(canJudge(step("manual"))).toBe(false)
    expect(canJudge(step("merge", { phase: "deploy" }))).toBe(false)
    expect(canJudge(step("simulate", { status: "running" }))).toBe(false)
  })
})

describe("gatePrompt", () => {
  it("tells the agent the step, what it found, where its report and log are, and where to answer", () => {
    const text = gatePrompt("PP-1", "/d/PP-1", "staging", step("simulate"), "/d/PP-1/gates/3-R1.json")
    expect(text).toContain("Backfill: simulate")
    expect(text).toContain("37 records: 30 write, 7 skip")
    expect(text).toContain("/d/PP-1/scripts/S1-staging-simulate.csv")
    expect(text).toContain("/d/PP-1/scripts/S1-staging-simulate.log")
    expect(text).toContain("/d/PP-1/refine.md")
    expect(text).toContain("/d/PP-1/gates/3-R1.json")
  })
  it("lists what goes with a tag", () => {
    expect(gatePrompt("PP-1", "/d/PP-1", "prod", step("tag", { items: ["Merge pull request #7", "fix: x"], report: null }), "/g.json")).toContain("- Merge pull request #7")
  })
})

describe("parseAdvice", () => {
  it("reads go or hold and why; anything else holds", () => {
    expect(parseAdvice(`{"verdict":"go","reason":"Matches the ticket"}`)).toEqual({ verdict: "go", reason: "Matches the ticket" })
    expect(parseAdvice(`{"verdict":"maybe"}`)).toEqual({ verdict: "hold", reason: "The agent gave no clear answer" })
    expect(parseAdvice("not json")).toEqual({ verdict: "hold", reason: "The agent gave no clear answer" })
  })
})
