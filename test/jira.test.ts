// What is a ticket, and what Jira answers, in the board's words (lib/jira.ts).
import { describe, expect, it } from "bun:test"
import { briefOf, keysIn, markdownOf, siteOf, ticketOf } from "../lib/jira"

describe("keysIn", () => {
  it("finds a project's keys in branches and titles, once, in order", () => {
    expect(keysIn(["fix/PP-3130-hide-unavailable", "pp-3051/feat/valid-year", "PP-3130 and PP-3131"], ["PP"])).toEqual(["PP-3130", "PP-3051", "PP-3131"])
  })
  it("leaves other words alone", () => {
    expect(keysIn(["UTF-8 text, ISO-27001, APP-12"], ["PP"])).toEqual([])
    expect(keysIn(["PP-1"], [])).toEqual([])
  })
})

describe("siteOf", () => {
  it("keeps a site as https without a trailing slash", () => {
    expect(siteOf("deale.atlassian.net/")).toBe("https://deale.atlassian.net")
    expect(siteOf("https://deale.atlassian.net")).toBe("https://deale.atlassian.net")
    expect(siteOf("http://x.atlassian.net")).toBeNull()
    expect(siteOf(" ")).toBeNull()
  })
})

describe("markdownOf", () => {
  it("turns Jira's document into Markdown", () => {
    const doc = { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Goal" }] },
      { type: "paragraph", content: [{ type: "text", text: "Hide " }, { type: "text", text: "unavailable", marks: [{ type: "strong" }] }, { type: "text", text: " ones." }] },
      { type: "bulletList", content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two", marks: [{ type: "link", attrs: { href: "https://x" } }] }] }] },
      ] },
      { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "a()" }] },
    ] }
    expect(markdownOf(doc)).toBe("## Goal\n\nHide **unavailable** ones.\n\n- one\n- [two](https://x)\n\n```ts\na()\n```")
  })
  it("is empty for nothing", () => {
    expect(markdownOf(null)).toBe("")
  })
})

describe("what Jira answers", () => {
  const raw = {
    key: "PP-3130",
    fields: {
      summary: "Hide unavailable companies", status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
      assignee: { displayName: "Carlos" }, reporter: { displayName: "Ana" }, priority: { name: "High" }, issuetype: { name: "Story" },
      updated: "2026-11-02T08:00:00.000+0000",
      description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Why" }] }] },
      comment: { comments: [{ author: { displayName: "Ana" }, created: "2026-11-01T10:00:00.000+0000", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ok" }] }] } }] },
    },
  }
  it("reads a card's brief", () => {
    expect(briefOf(raw, "https://deale.atlassian.net")).toEqual({
      key: "PP-3130", summary: "Hide unavailable companies", status: "In Progress", tone: "doing", assignee: "Carlos", url: "https://deale.atlassian.net/browse/PP-3130",
    })
  })
  it("reads a ticket whole", () => {
    const t = ticketOf(raw, "https://deale.atlassian.net")
    expect([t.type, t.priority, t.reporter, t.description, t.comments[0]?.body]).toEqual(["Story", "High", "Ana", "Why", "Ok"])
  })
})
