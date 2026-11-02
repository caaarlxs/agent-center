import { describe, expect, it } from "vitest"
import type { Card, TicketRow } from "@/lib/api-types"
import { syncHint } from "./sync"
import type { Column } from "./Tickets"

const col = (name: string, id: string): Column => ({ name, statusIds: [id], tone: "doing", tickets: [] })
const columns = [col("Backlog", "1"), col("En curso", "2"), col("En review", "3"), col("Testing", "4"), col("Finalizada", "5")]
const ticket = (statusId: string, isMine = true): TicketRow =>
  ({ key: "PP-1", summary: "", status: "", statusId, tone: "doing", kind: "task", assignee: null, url: "", type: null, priority: null, sprint: null, updated: 0, parent: null, epic: null, isMine })
const pr = (number: number, isDraft = false) => ({ number, title: "", url: `u${number}`, state: "OPEN", isDraft, reviewDecision: null, checks: null }) as Card["prs"][number]
const session = (prs: Card["prs"], mergedPrs: Card["prs"] = []) => ({ prs, mergedPrs }) as Card

describe("syncHint", () => {
  it("asks for review when a PR is open and the ticket is not there yet", () => {
    const hint = syncHint(ticket("2"), [session([pr(48)])], columns)
    expect([hint?.pr.number, hint?.isMerged, hint?.column.name]).toEqual([48, false, "En review"])
  })
  it("asks for the column after review when a PR is merged", () => {
    expect(syncHint(ticket("3"), [session([], [pr(47)])], columns)?.column.name).toBe("Testing")
    expect(syncHint(ticket("2"), [session([pr(48)], [pr(47)])], columns)?.column.name).toBe("Testing")
  })
  it("says nothing when they agree, on others' tickets, drafts, or without a review column", () => {
    expect(syncHint(ticket("3"), [session([pr(48)])], columns)).toBeNull()
    expect(syncHint(ticket("4"), [session([], [pr(47)])], columns)).toBeNull()
    expect(syncHint(ticket("2", false), [session([pr(48)])], columns)).toBeNull()
    expect(syncHint(ticket("2"), [session([pr(48, true)])], columns)).toBeNull()
    expect(syncHint(ticket("1"), [session([pr(48)])], [col("Backlog", "1"), col("Done", "5")])).toBeNull()
  })
})
