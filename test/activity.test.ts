import { describe, expect, it } from "bun:test"
import { helperOf, slowSteps, stepsOf } from "../lib/activity"

const at = (s: number) => new Date(s * 1000).toISOString()
const call = (s: number, id: string, name: string, input: object) => ({ type: "assistant", timestamp: at(s), message: { content: [{ type: "tool_use", id, name, input }] } })
const result = (s: number, id: string) => ({ type: "user", timestamp: at(s), message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } })

describe("stepsOf", () => {
  it("lists the tool calls, the latest last, each with when it ended (open until its result comes back)", () => {
    const rows = [
      call(1, "a", "Bash", { command: "git fetch", description: "Fetch api-service" }), result(2, "a"),
      call(2, "b", "Read", { file_path: "/repo/plan.md" }), result(3, "b"),
      call(3, "c", "Agent", { description: "Build U1", prompt: "..." }),
    ]
    expect(stepsOf(rows)).toEqual([
      { at: 1000, endedAt: 2000, tool: "Bash", text: "Fetch api-service", isOpen: false },
      { at: 2000, endedAt: 3000, tool: "Read", text: "/repo/plan.md", isOpen: false },
      { at: 3000, endedAt: null, tool: "Agent", text: "Build U1", isOpen: true },
    ])
  })
  it("keeps the last ones only", () => {
    const rows = [1, 2, 3].map(n => call(n, `t${n}`, "Grep", { pattern: `p${n}` }))
    expect(stepsOf(rows, 2).map(s => s.text)).toEqual(["p2", "p3"])
  })
})

describe("a subagent", () => {
  const rows = [call(100, "a", "Bash", { command: "pytest", description: "Run the whole suite" }), result(340, "a"), call(341, "b", "Bash", { command: "git push", description: "Push" })]
  it("says when it started and, once done, when it ended", () => {
    expect(helperOf({ description: "F39 in user-service", finished: true }, rows)).toMatchObject({ description: "F39 in user-service", isDone: true, startedAt: 100_000, endedAt: 341_000 })
    expect(helperOf({ description: "F40" }, rows)).toMatchObject({ isDone: false, startedAt: 100_000, endedAt: null, step: { text: "Push", isOpen: true } })
  })
})

describe("where a pass's time went", () => {
  const main = [call(0, "m", "Agent", { description: "Fix F39", prompt: "…" }), result(1500, "m")]
  const helper = [call(10, "a", "Bash", { command: "pytest", description: "Run the whole suite" }), result(250, "a"), call(250, "b", "Bash", { command: "pytest -k x", description: "Run the test of the fix" }), result(260, "b"), call(260, "c", "Bash", { command: "pytest", description: "Count failures" }), result(700, "c")]
  it("lists the steps of a minute or more, longest first, each with who took it; a subagent's wait is not its own", () => {
    expect(slowSteps([{ who: null, rows: main }, { who: "F39 in user-service", rows: helper }], 60_000)).toEqual([
      { who: "F39 in user-service", tool: "Bash", text: "Count failures", ms: 440_000 },
      { who: "F39 in user-service", tool: "Bash", text: "Run the whole suite", ms: 240_000 },
    ])
  })
})
