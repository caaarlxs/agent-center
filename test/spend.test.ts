import { describe, expect, it } from "bun:test"
import { SPANS, originOf, projectOf, spanOf, summarize, turnCosts } from "../lib/spend"
import { spendOf } from "../lib/usage"

describe("spendOf", () => {
  it("adds up a conversation's tokens by kind, its main model and its API-equivalent cost", () => {
    const s = spendOf([
      { model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0 } },
      { model: "claude-opus-5-5", usage: { input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      { model: "claude-haiku-5-5", usage: { output_tokens: 10 } },
    ])
    expect(s).toMatchObject({ input: 1000, output: 3010, cacheRead: 1_000_000, cacheWrite: 0, model: "claude-opus-5-5" })
    expect(s.cost).toBeCloseTo((1000 * 4 + 3000 * 20 + 1_000_000 * 0.2 + 10 * 0.5) / 1_000_000, 4)
  })
  it("is nothing for no messages", () => {
    expect(spendOf([])).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, model: null })
  })
})


const msg = (at: number, read: number, write = 0, out = 0, model = "claude-opus-5-5", isMain = true) =>
  ({ model, at, isMain, usage: { cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: out } })

describe("originOf", () => {
  it("tells where a session runs: yours, the pipeline, the terminal, the board's helpers", () => {
    expect(originOf("claude-desktop", "/x", "claude-opus-5-5")).toBe("yours")
    expect(originOf("sdk-cli", "/repo", "claude-opus-5-5")).toBe("yours")
    expect(originOf("sdk-cli", "/data/pipeline-PP-1", "claude-opus-5-5")).toBe("pipeline")
    expect(originOf("sdk-cli", "/Agent Center/data/pipeline/PP-2815/work", "claude-opus-5-5")).toBe("pipeline")
  })
  it("names a pipeline stage's project by its ticket, any other by its folder", () => {
    expect(projectOf("/Agent Center/data/pipeline/PP-2815/work/U8-deale")).toBe("PP-2815")
    expect(projectOf("/Users/me/dev/agent-center")).toBe("agent-center")
    expect(projectOf(null)).toBe("?")
    expect(originOf("sdk-cli", "/repo", "claude-sonnet-5-5")).toBe("helpers")
    expect(originOf("cli", "/repo", "claude-opus-5-5")).toBe("terminal")
  })
})

describe("summarize", () => {
  const sessions = [
    { id: "a", title: "Big", project: "agent-center", origin: "yours" as const, lastContext: 600_000, messages: [msg(100, 500_000, 0, 1000), msg(200, 600_000, 10_000, 2000), msg(5, 999_999)] },
    { id: "b", title: "Small", project: "deale", origin: "pipeline" as const, lastContext: 50_000, messages: [msg(150, 40_000, 5_000, 500)] },
  ]
  const s = summarize(sessions, 50)
  it("counts only what was spent since the window began", () => {
    expect(s.sessions.find(x => x.id === "a")!.turns).toBe(2)
  })
  it("splits the spend by kind of token, origin, project and session, the biggest first", () => {
    expect(s.byKind.cacheRead).toBeGreaterThan(s.byKind.output)
    expect(s.byOrigin[0]!.key).toBe("yours")
    expect(s.byProject.map(p => p.key)).toEqual(["agent-center", "deale"])
    expect(s.sessions[0]!.id).toBe("a")
    expect(s.total).toBeCloseTo(s.sessions.reduce((t, x) => t + x.cost, 0))
  })
  it("says what one more step costs a session: its context read again", () => {
    expect(s.sessions[0]!.stepCost).toBeCloseTo((600_000 * 0.2) / 1e6)
  })
})

describe("turnCosts", () => {
  it("adds up each turn: the responses from one of your messages to the next", () => {
    const costs = turnCosts([msg(10, 1_000_000), msg(20, 1_000_000), msg(35, 1_000_000)], [0, 30])
    expect(costs).toHaveLength(2)
    expect(costs[0]!.at).toBe(0)
    expect(costs[0]!.cost).toBeCloseTo(0.4)
    expect(costs[1]!.cost).toBeCloseTo(0.2)
  })
})

describe("spanOf", () => {
  it("reads a span by name, the week by its old name, 5 hours otherwise", () => {
    expect(spanOf("1h")).toBe(SPANS["1h"])
    expect(spanOf("30d")).toBe(30 * 24 * 3600_000)
    expect(spanOf("week")).toBe(SPANS["7d"])
    expect(spanOf(null)).toBe(SPANS["5h"])
    expect(spanOf("forever")).toBe(SPANS["5h"])
  })
})
