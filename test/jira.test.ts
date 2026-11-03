// What is a ticket, and what Jira answers, in the board's words (lib/jira.ts).
import { describe, expect, it } from "bun:test"
import { ticketsAfter } from "../lib/board"
import { briefOf, docOf, jqlOf, keysIn, kindOf, markdownOf, pickColumns, rowOf, sessionKeys, siteOf, ticketOf, userKeys } from "../lib/jira"

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
      key: "PP-3130", summary: "Hide unavailable companies", status: "In Progress", tone: "doing", kind: "story", assignee: "Carlos", url: "https://deale.atlassian.net/browse/PP-3130",
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
    const mine = { ...raw, fields: { ...raw.fields, assignee: { displayName: "Carlos", accountId: "me" } } }
    expect([rowOf(mine, "https://x", null, new Map(), "me").isMine, rowOf(mine, "https://x", null).isMine]).toEqual([true, false])
  })
})

describe("jqlOf", () => {
  it("asks for yours, the ones you reported, or the open sprint, with words", () => {
    expect(jqlOf("mine", ["PP"])).toBe("project in (PP) AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC")
    expect(jqlOf("reported", ["PP", "OPS"])).toBe("project in (PP,OPS) AND reporter = currentUser() ORDER BY updated DESC")
    expect(jqlOf("sprint", ["PP"], 'login "page"')).toBe('project in (PP) AND sprint in openSprints() AND text ~ "login  page" ORDER BY updated DESC')
  })
  it("asks for the whole project", () => {
    expect(jqlOf("all", ["PP"], "aviso")).toBe('project in (PP) AND text ~ "aviso" ORDER BY updated DESC')
  })
  it("finds a ticket by its key, whatever the filter", () => {
    expect(jqlOf("mine", ["PP"], " pp-3093 ")).toBe("project in (PP) AND key = PP-3093 ORDER BY updated DESC")
  })
})

describe("docOf", () => {
  it("writes a comment as a paragraph per line", () => {
    expect(docOf("Done\n\nNext").content.map(p => p.content[0]?.text ?? "")).toEqual(["Done", "", "Next"])
  })
})

describe("kindOf", () => {
  it("tells epics, stories, tasks, sub-tasks and bugs apart, in English or Spanish", () => {
    expect([{ name: "Epic", hierarchyLevel: 1 }, { name: "Historia" }, { name: "Tarea" }, { name: "Subtarea", subtask: true }, { name: "Bug" }, { name: "Odd", hierarchyLevel: 0 }].map(kindOf))
      .toEqual(["epic", "story", "task", "subtask", "bug", "task"])
  })
})

describe("where a ticket sits", () => {
  const ref = (key: string, type: object) => ({ key, fields: { summary: key, status: { name: "To Do", statusCategory: { key: "new" } }, issuetype: type } })
  const epic = ref("PP-1", { name: "Epic", hierarchyLevel: 1 })
  const story = ref("PP-2", { name: "Story", hierarchyLevel: 0 })
  it("takes its parent as its epic when it is one", () => {
    const row = rowOf({ key: "PP-2", fields: { ...story.fields, parent: epic } }, "https://x", null)
    expect([row.kind, row.parent?.key, row.epic?.key]).toEqual(["story", "PP-1", "PP-1"])
  })
  it("takes a sub-task's epic from its parent's parent", () => {
    const sub = { key: "PP-3", fields: { ...ref("PP-3", { name: "Sub-task", subtask: true }).fields, parent: story } }
    expect(rowOf(sub, "https://x", null).epic).toBeNull()
    const epics = new Map([["PP-2", rowOf(epic, "https://x", null) as any]])
    expect(rowOf(sub, "https://x", null, epics).epic?.key).toBe("PP-1")
  })
  it("reads what sits in a ticket and how it links to others", () => {
    const raw = { key: "PP-2", fields: { ...story.fields, subtasks: [ref("PP-3", { name: "Sub-task", subtask: true })], issuelinks: [{ type: { outward: "blocks", inward: "is blocked by" }, inwardIssue: ref("PP-9", { name: "Bug" }) }] } }
    const t = ticketOf(raw, "https://x", null, null, [ref("PP-3", {}) as any, { key: "PP-4" } as any])
    expect(t.children.map(c => c.key)).toEqual(["PP-3", "PP-4"])
    expect(t.links.map(l => [l.how, l.ticket.key, l.ticket.kind])).toEqual([["is blocked by", "PP-9", "bug"]])
  })
})

describe("pickColumns", () => {
  it("takes the board whose columns hold most of the statuses seen", () => {
    const roadmap = [{ name: "Ideas", statusIds: ["10016"] }, { name: "Done", statusIds: ["3"] }]
    const dev = [{ name: "Backlog", statusIds: ["10016"] }, { name: "Review", statusIds: ["10053"] }, { name: "Testing", statusIds: ["10219", "3"] }]
    expect(pickColumns([roadmap, dev], ["3", "10053", "10219"])).toBe(dev)
    expect(pickColumns([roadmap], ["999"])).toEqual([])
  })
})

describe("sessionKeys", () => {
  it("takes the ones it was started from or you linked, its branch's, then those you named, most first", () => {
    const mentions = new Map([["PP-3131", 2], ["PP-3130", 4], ["OPS-5", 7]])
    expect(sessionKeys({}, ["PP-3130"], mentions, ["PP"])).toEqual([{ key: "PP-3130", why: "branch" }, { key: "PP-3131", why: "named" }])
    expect(sessionKeys({ started: ["PP-7"], linked: ["PP-8"] }, [], mentions, ["PP"]).map(l => l.why)).toEqual(["started", "linked", "named"])
  })
  it("leaves out the ones you unlinked, and names three at most beyond yours", () => {
    expect(sessionKeys({ off: ["PP-1"] }, ["PP-1"], new Map([["PP-2", 1]]), ["PP"])).toEqual([{ key: "PP-2", why: "named" }])
    expect(sessionKeys({}, [], new Map([["PP-1", 5], ["PP-2", 4], ["PP-3", 3], ["PP-4", 2]]), ["PP"])).toHaveLength(3)
    expect(sessionKeys({ started: ["PP-1", "PP-2", "PP-3", "PP-4"] }, [], new Map([["PP-5", 9]]), ["PP"])).toHaveLength(4)
  })
})

describe("ticketsAfter", () => {
  it("keeps the ones it was started from, links one, unlinks one", () => {
    const started = ticketsAfter({}, { started: ["PP-1", "PP-2"] })
    expect(started).toEqual({ started: ["PP-1", "PP-2"], linked: [], off: [] })
    expect(ticketsAfter(started, { unlink: "PP-2" })).toEqual({ started: ["PP-1"], linked: [], off: ["PP-2"] })
    expect(ticketsAfter({ off: ["PP-3"] }, { link: "PP-3" })).toEqual({ started: [], linked: ["PP-3"], off: [] })
  })
})

describe("userKeys", () => {
  it("finds the keys you wrote yourself", () => {
    expect(userKeys(JSON.stringify({ type: "user", message: { content: "Look at PP-1 and PP-2" } }))).toEqual(["PP-1", "PP-2"])
    expect(userKeys(JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "PP-1" }] } }))).toEqual(["PP-1"])
  })
  it("leaves out Claude, tools, injected context and lists", () => {
    expect(userKeys(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "PP-1" }] } }))).toEqual([])
    expect(userKeys(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "PP-9" }] } }))).toEqual([])
    expect(userKeys(JSON.stringify({ type: "user", isMeta: true, message: { content: "PP-9" } }))).toEqual([])
    expect(userKeys(JSON.stringify({ type: "user", message: { content: "<command-name>/brief</command-name> PP-9" } }))).toEqual([])
    expect(userKeys(JSON.stringify({ type: "user", message: { content: "PP-1 PP-2 PP-3 PP-4" } }))).toEqual([])
    expect(userKeys("not json")).toEqual([])
  })
})
