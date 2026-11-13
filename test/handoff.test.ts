import { describe, expect, it } from "bun:test"
import { addLine, excerptOf, freshPrompt, newHistory, noteInput } from "../lib/handoff"

const user = (text: string, extra = {}) => JSON.stringify({ type: "user", message: { content: text }, ...extra })
const said = (text: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } })
const tool = (name: string, input: object) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } })
const result = (text: string, is_error = false) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: text, is_error }] } })

describe("excerptOf", () => {
  it("keeps what you and Claude said and each step in one line, not the tools' output, the latest last", () => {
    const e = excerptOf([user("Build the inbox"), tool("Bash", { command: "ls -la", description: "List the folder" }), result("a huge listing"), said("Done, the inbox works"), user("Now the colours")], 10_000)
    expect(e.said).toEqual([
      { who: "you", text: "Build the inbox" },
      { who: "step", text: "→ Bash: List the folder" },
      { who: "claude", text: "Done, the inbox works" },
      { who: "you", text: "Now the colours" },
    ])
  })
  it("keeps a step's error, cut, and leaves task tools to the task list", () => {
    const e = excerptOf([tool("Bash", { command: "bun test" }), result("1 fail\n" + "x".repeat(400), true), tool("TaskCreate", { subject: "Ship" })], 10_000)
    expect(e.said[0]).toEqual({ who: "step", text: "→ Bash: bun test" })
    expect(e.said[1]!.text.startsWith("✗ 1 fail x")).toBe(true)
    expect(e.said[1]!.text.length).toBe(302)
    expect(e.said).toHaveLength(2)
  })
  it("leaves out injected context, commands and compaction summaries", () => {
    const e = excerptOf([user("<system-reminder>x</system-reminder>"), user("hidden", { isMeta: true }), user("summary", { isCompactSummary: true }), user("real")], 10_000)
    expect(e.said.map(s => s.text)).toEqual(["real"])
  })
  it("keeps only the latest messages that fit, and the files it changed, once each", () => {
    const e = excerptOf([tool("Edit", { file_path: "/x/a.ts" }), tool("Write", { file_path: "/x/a.ts" }), tool("MultiEdit", { file_path: "/x/b.ts" }), user("a".repeat(500)), said("b".repeat(500)), user("last")], 520)
    expect(e.said.map(s => s.text)).toEqual(["b".repeat(500), "last"])
    expect(e.files).toEqual(["/x/a.ts", "/x/b.ts"])
  })
})

describe("the whole conversation", () => {
  it("keeps the latest /compact summary, every request you made, and the task list as it ends", () => {
    const h = newHistory()
    const lines = [
      user("Build the inbox"),
      user("old summary", { isCompactSummary: true }),
      tool("TodoWrite", { todos: [{ content: "Old plan", status: "pending" }] }),
      user("Now the colours"),
      result("noise"),
      user("<system-reminder>x</system-reminder>"),
      user("latest summary", { isCompactSummary: true }),
      tool("TaskCreate", { subject: "Colours" }),
      tool("TaskCreate", { subject: "Dark mode" }),
      tool("TaskCreate", { subject: "Dropped" }),
      tool("TaskUpdate", { taskId: "1", status: "completed" }),
      tool("TaskUpdate", { taskId: "3", status: "deleted" }),
    ]
    for (const line of lines) addLine(h, line)
    expect(h.summary).toBe("latest summary")
    expect(h.yours).toEqual(["Build the inbox", "Now the colours"])
    expect([...h.tasks.values()]).toEqual([{ subject: "Old plan", status: "pending" }, { subject: "Colours", status: "completed" }, { subject: "Dark mode", status: "pending" }])
  })
  it("gives Sonnet every part, your first request even when the rest does not fit", () => {
    const h = newHistory()
    for (const t of ["First request", "y".repeat(1400), "z".repeat(1400), "Latest request"]) addLine(h, user(t))
    h.tasks.set("1", { subject: "Colours", status: "in_progress" })
    const input = noteInput({ history: h, said: [{ who: "step", text: "→ Bash: Run the tests" }, { who: "claude", text: "All pass" }], files: ["/x/a.ts"], repo: "Branch: main" })
    expect(input).toContain("## Last exact step")
    expect(input).toContain("(not compacted)")
    expect(input).toContain("- First request")
    expect(input).toContain("- Latest request")
    expect(input).toContain("→ Bash: Run the tests\n\n**Claude:** All pass")
    expect(input).toContain("- [in_progress] Colours")
    expect(input).toContain("# The repository now\nBranch: main")
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
