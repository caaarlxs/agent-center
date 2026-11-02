import { describe, expect, it } from "vitest"
import type { TicketRef, TicketRow } from "@/lib/api-types"
import { promptFor, promptForAll } from "./jira"
import { columnsOf, lanesOf } from "./Tickets"

const row = (key: string, status: string, tone: TicketRow["tone"], statusId = status, epic: TicketRef | null = null): TicketRow =>
  ({ key, summary: key, status, statusId, tone, kind: "task", assignee: null, url: "", type: null, priority: null, sprint: null, updated: 0, parent: epic, epic })
const epic = (key: string): TicketRef => ({ key, summary: key, type: "Epic", kind: "epic", status: "To Do", tone: "todo", url: "" })

describe("columnsOf", () => {
  it("puts each status once, to do, then in progress, then done, when there is no board", () => {
    const cols = columnsOf([row("A", "In Review", "doing"), row("B", "Done", "done"), row("C", "To Do", "todo"), row("D", "In Review", "doing")])
    expect(cols.map(c => [c.name, c.tickets.map(t => t.key).join("")])).toEqual([["To Do", "C"], ["In Review", "AD"], ["Done", "B"]])
  })
  it("shows every column of the team's board, the empty ones too, then the statuses it lacks", () => {
    const board = [{ name: "Backlog", statusIds: ["1"] }, { name: "Doing", statusIds: ["2", "3"] }, { name: "Review", statusIds: ["4"] }, { name: "Done", statusIds: ["5"] }]
    const cols = columnsOf([row("A", "Testing", "doing", "3"), row("B", "En curso", "doing", "2"), row("C", "Odd", "todo", "9")], board)
    expect(cols.map(c => [c.name, c.tickets.map(t => t.key).join(""), c.tone])).toEqual([
      ["Backlog", "", "todo"], ["Doing", "AB", "doing"], ["Review", "", "doing"], ["Done", "", "done"], ["Odd", "C", "todo"],
    ])
  })
})

describe("lanesOf", () => {
  it("puts tickets in a row per epic, the epic with them, the most first, those in none last", () => {
    const e1 = epic("E-1")
    const e2 = epic("E-2")
    const lanes = lanesOf([row("A", "x", "todo", "1", e2), row("B", "x", "todo"), row("C", "x", "todo", "1", e1), row("D", "x", "todo", "1", e1), { ...row("E-2", "x", "todo"), kind: "epic" }])
    expect(lanes.map(l => [l.epic?.key ?? null, l.tickets.map(t => t.key).join(" ")])).toEqual([["E-2", "A E-2"], ["E-1", "C D"], [null, "B"]])
  })
})

describe("promptFor", () => {
  it("starts a session with the ticket's key, summary, link and description", () => {
    expect(promptFor({ key: "PP-1", summary: "Fix it", url: "https://x/browse/PP-1" }, "Why\n")).toBe("PP-1: Fix it\n\nhttps://x/browse/PP-1\n\nDescription:\nWhy")
    expect(promptFor({ key: "PP-1", summary: "Fix it", url: "u" })).toBe("PP-1: Fix it\n\nu")
  })
  it("names several tickets one after the other", () => {
    const one = { ticket: { key: "PP-1", summary: "A", url: "u1" } }
    expect(promptForAll([one])).toBe("PP-1: A\n\nu1")
    expect(promptForAll([one, { ticket: { key: "PP-2", summary: "B", url: "u2" }, description: "d" }])).toBe("Work on these Jira tickets together:\n\nPP-1: A\n\nu1\n\n---\n\nPP-2: B\n\nu2\n\nDescription:\nd")
  })
})
