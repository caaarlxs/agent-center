import { describe, expect, it } from "bun:test"
import { excerptOf, freshPrompt } from "../lib/handoff"

const user = (text: string, extra = {}) => JSON.stringify({ type: "user", message: { content: text }, ...extra })
const said = (text: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } })
const tool = (name: string, input: object) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } })
const result = (text: string) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: text }] } })

describe("excerptOf", () => {
  it("keeps what you and Claude said, not the tools' output, the latest last", () => {
    const e = excerptOf([user("Build the inbox"), tool("Bash", { command: "ls" }), result("a huge listing"), said("Done, the inbox works"), user("Now the colours")], 10_000)
    expect(e.said).toEqual([{ who: "you", text: "Build the inbox" }, { who: "claude", text: "Done, the inbox works" }, { who: "you", text: "Now the colours" }])
  })
  it("leaves out injected context, commands and compaction summaries", () => {
    const e = excerptOf([user("<system-reminder>x</system-reminder>"), user("hidden", { isMeta: true }), user("summary", { isCompactSummary: true }), user("real")], 10_000)
    expect(e.said.map(s => s.text)).toEqual(["real"])
  })
  it("keeps only the latest messages that fit, and the files it changed, once each", () => {
    const e = excerptOf([user("a".repeat(500)), said("b".repeat(500)), user("last"), tool("Edit", { file_path: "/x/a.ts" }), tool("Write", { file_path: "/x/a.ts" }), tool("MultiEdit", { file_path: "/x/b.ts" })], 520)
    expect(e.said.map(s => s.text)).toEqual(["b".repeat(500), "last"])
    expect(e.files).toEqual(["/x/a.ts", "/x/b.ts"])
  })
})

describe("freshPrompt", () => {
  it("hands over the note, names the old session and where its full conversation is", () => {
    const p = freshPrompt({ title: "Custom IDE", note: "## Goal\nShip it", transcript: "/t/abc.jsonl" })
    expect(p).toContain("“Custom IDE”")
    expect(p).toContain("## Goal\nShip it")
    expect(p).toContain("/t/abc.jsonl")
  })
})
