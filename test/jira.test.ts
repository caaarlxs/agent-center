// What is a ticket, and what Jira answers, in the board's words (lib/jira.ts).
import { describe, expect, it } from "bun:test"
import { briefOf, docOf, jqlOf, keysIn, markdownOf, ownWords, pickOrder, rowOf, sessionKeys, siteOf, ticketOf } from "../lib/jira"

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
  it("reads a ticket whole, and whether it is yours", () => {
    const t = ticketOf(raw, "https://deale.atlassian.net")
    expect([t.type, t.priority, t.reporter, t.description, t.comments[0]?.body, t.isMine]).toEqual(["Story", "High", "Ana", "Why", "Ok", false])
    const mine = { ...raw, fields: { ...raw.fields, assignee: { displayName: "Carlos", accountId: "me" } } }
    expect(ticketOf(mine, "https://x", "me").isMine).toBe(true)
  })
  it("reads a row with the open sprint", () => {
    const withSprint = { ...raw, fields: { ...raw.fields, customfield_10020: [{ name: "S41", state: "closed" }, { name: "S42", state: "active" }] } }
    const row = rowOf(withSprint, "https://x", "customfield_10020")
    expect([row.type, row.priority, row.sprint, row.updated > 0]).toEqual(["Story", "High", "S42", true])
    expect(rowOf(raw, "https://x", null).sprint).toBeNull()
  })
})

describe("jqlOf", () => {
  it("asks for yours, the ones you reported, or the open sprint, with words", () => {
    expect(jqlOf("mine", ["PP"])).toBe("project in (PP) AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC")
    expect(jqlOf("reported", ["PP", "OPS"])).toBe("project in (PP,OPS) AND reporter = currentUser() ORDER BY updated DESC")
    expect(jqlOf("sprint", ["PP"], 'login "page"')).toBe('project in (PP) AND sprint in openSprints() AND text ~ "login  page" ORDER BY updated DESC')
  })
})

describe("docOf", () => {
  it("writes a comment as a paragraph per line", () => {
    expect(docOf("Done\n\nNext").content.map(p => p.content[0]?.text ?? "")).toEqual(["Done", "", "Next"])
  })
})

describe("pickOrder", () => {
  it("takes the board that holds most of the statuses seen", () => {
    const roadmap = ["10016", "10318", "3", "10067"]
    const dev = ["10016", "10017", "3", "10053", "10067", "10219"]
    expect(pickOrder([roadmap, dev], ["3", "10053", "10219"])).toBe(dev)
    expect(pickOrder([roadmap], ["999"])).toEqual([])
  })
})

describe("sessionKeys", () => {
  it("takes the branch's and title's, then those the conversation names twice or more", () => {
    const mentions = new Map([["PP-3131", 9], ["PP-3130", 14], ["PP-2000", 1], ["OPS-5", 7]])
    expect(sessionKeys(["PP-3130"], mentions, ["PP"])).toEqual(["PP-3130", "PP-3131"])
    expect(sessionKeys([], new Map([["PP-1", 5], ["PP-2", 4], ["PP-3", 3], ["PP-4", 2]]), ["PP"])).toEqual(["PP-1", "PP-2", "PP-3"])
  })
})

describe("ownWords", () => {
  it("keeps what you and Claude said, and what Claude put in its tools", () => {
    expect(ownWords(JSON.stringify({ type: "user", message: { content: "Look at PP-1" } }))).toBe("Look at PP-1")
    expect(ownWords(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "On it" }, { type: "tool_use", input: { command: "git commit -m 'fix (PP-2)'" } }] } }))).toContain("PP-2")
  })
  it("leaves out what tools gave back, and injected context", () => {
    expect(ownWords(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "abc fix (PP-9)" }] } }))).toBe("")
    expect(ownWords(JSON.stringify({ type: "user", isMeta: true, message: { content: "PP-9" } }))).toBe("")
    expect(ownWords("not json")).toBe("")
  })
})
