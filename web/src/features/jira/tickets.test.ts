import { describe, expect, it } from "vitest"
import type { TicketRow } from "@/lib/api-types"
import { promptFor } from "./jira"
import { columnsOf } from "./Tickets"

const row = (key: string, status: string, tone: TicketRow["tone"], statusId = status): TicketRow =>
  ({ key, summary: key, status, statusId, tone, assignee: null, url: "", type: null, priority: null, sprint: null, updated: 0 })

describe("columnsOf", () => {
  it("puts each status once, to do, then in progress, then done", () => {
    const cols = columnsOf([row("A", "In Review", "doing"), row("B", "Done", "done"), row("C", "To Do", "todo"), row("D", "In Review", "doing")])
    expect(cols.map(c => [c.status, c.tickets.map(t => t.key).join("")])).toEqual([["To Do", "C"], ["In Review", "AD"], ["Done", "B"]])
  })
  it("follows the team's board when there is one", () => {
    const cols = columnsOf([row("A", "Listo", "doing", "4"), row("B", "Testing", "doing", "3"), row("C", "En curso", "doing", "1"), row("D", "Odd", "todo", "9")], ["1", "2", "3", "4"])
    expect(cols.map(c => c.status)).toEqual(["En curso", "Testing", "Listo", "Odd"])
  })
})

describe("promptFor", () => {
  it("starts a session with the ticket's key, summary, link and description", () => {
    expect(promptFor({ key: "PP-1", summary: "Fix it", url: "https://x/browse/PP-1" }, "Why\n")).toBe("PP-1: Fix it\n\nhttps://x/browse/PP-1\n\nDescription:\nWhy")
    expect(promptFor({ key: "PP-1", summary: "Fix it", url: "u" })).toBe("PP-1: Fix it\n\nu")
  })
})
