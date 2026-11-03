import { describe, expect, it } from "bun:test"
import { stepsOf } from "../lib/activity"

const call = (s: number, id: string, name: string, input: object) => ({ type: "assistant", timestamp: new Date(s * 1000).toISOString(), message: { content: [{ type: "tool_use", id, name, input }] } })
const result = (id: string) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } })

describe("stepsOf", () => {
  it("lists the tool calls, the latest last, open until their result comes back", () => {
    const rows = [
      call(1, "a", "Bash", { command: "git fetch", description: "Fetch api-service" }), result("a"),
      call(2, "b", "Read", { file_path: "/repo/plan.md" }), result("b"),
      call(3, "c", "Agent", { description: "Build U1", prompt: "..." }),
    ]
    expect(stepsOf(rows)).toEqual([
      { at: 1000, tool: "Bash", text: "Fetch api-service", isOpen: false },
      { at: 2000, tool: "Read", text: "/repo/plan.md", isOpen: false },
      { at: 3000, tool: "Agent", text: "Build U1", isOpen: true },
    ])
  })
  it("keeps the last ones only", () => {
    const rows = [1, 2, 3].map(n => call(n, `t${n}`, "Grep", { pattern: `p${n}` }))
    expect(stepsOf(rows, 2).map(s => s.text)).toEqual(["p2", "p3"])
  })
})
