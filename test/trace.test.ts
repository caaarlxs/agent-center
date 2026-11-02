import { describe, expect, it } from "bun:test"
import { turnOf, turnsOf } from "../lib/trace"

const at = (s: number) => new Date(Date.UTC(2026, 10, 2, 10, 0, s)).toISOString()
const you = (s: number, text: string) => ({ type: "user", timestamp: at(s), message: { content: text } })
const claude = (s: number, id: string, content: any[], usage?: object) => ({ type: "assistant", timestamp: at(s), message: { id, model: "claude-opus-5-5", content, ...(usage ? { usage } : {}) } })
const call = (id: string, name: string, input: object) => ({ type: "tool_use", id, name, input })
const result = (s: number, id: string, isError = false) => ({ type: "user", timestamp: at(s), message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError }] } })

describe("turnsOf", () => {
  it("splits at each message you wrote, leaving out subagents' rows", () => {
    const turns = turnsOf([you(0, "a"), claude(1, "m1", []), { ...claude(2, "s", []), isSidechain: true }, you(3, "b"), claude(4, "m2", [])])
    expect(turns.map(t => t.length)).toEqual([2, 2])
  })
})

describe("turnOf", () => {
  const rows = [
    you(0, "Run the tests"),
    claude(2, "m1", [{ type: "text", text: "On it" }]),
    claude(3, "m1", [call("t1", "Bash", { command: "bun test", description: "Run the tests" })], { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 40 }),
    result(13, "t1", true),
    claude(15, "m2", [call("q1", "AskUserQuestion", { questions: [] }), call("a1", "Task", { description: "Look around", prompt: "x" })], { input_tokens: 5, output_tokens: 20 }),
    result(40, "q1"),
    result(45, "a1"),
    claude(47, "m3", [{ type: "text", text: "Done" }], { input_tokens: 1, output_tokens: 5 }),
  ]
  const turn = turnOf(rows, Date.parse(at(100)))
  it("times each model call from what it waited on, and each tool from its call to its result", () => {
    expect(turn.spans.map(s => [s.kind, s.name, s.startMs / 1000, s.durationMs / 1000, s.isFailed])).toEqual([
      ["model", "Claude", 0, 3, false],
      ["tool", "Run the tests", 3, 10, true],
      ["model", "Claude", 13, 2, false],
      ["wait", "Waiting for you: a question", 15, 25, false],
      ["agent", "Look around", 15, 30, false],
      ["model", "Claude", 45, 2, false],
    ])
    expect([turn.prompt, turn.durationMs / 1000, turn.isRunning]).toEqual(["Run the tests", 47, false])
  })
  it("adds up the tokens", () => {
    expect(turn.tokens).toEqual({ input: 66, cached: 1000, output: 65 })
  })
  it("keeps a call with no result yet running until now", () => {
    const live = turnOf(rows.slice(0, 3), Date.parse(at(20)))
    expect([live.isRunning, live.durationMs / 1000, live.spans[1]!.isRunning, live.spans[1]!.durationMs / 1000]).toEqual([true, 20, true, 17])
  })
})
