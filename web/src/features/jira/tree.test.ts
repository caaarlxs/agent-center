import { describe, expect, test } from "vitest"
import type { TicketRef, TicketRow } from "@/lib/api-types"
import { treeOf } from "./tree"

const ref = (key: string, kind: TicketRef["kind"]): TicketRef => ({ key, summary: key, type: null, kind, status: "To Do", tone: "todo", url: "" })
const row = (key: string, kind: TicketRef["kind"], parent: TicketRef | null = null, epic: TicketRef | null = null) =>
  ({ ...ref(key, kind), assignee: null, statusId: "1", priority: null, sprint: null, updated: 0, parent, epic, isMine: false }) as TicketRow
const shape = (nodes: ReturnType<typeof treeOf>): unknown => nodes.map(n => [n.ticket.key, n.isLinked, shape(n.children)])

const EPIC = ref("PP-2816", "epic")
const STORY = ref("PP-3131", "story")

describe("treeOf", () => {
  test("puts each ticket under what it sits in, up to the epic, which shows though not linked", () => {
    const rows = [row("PP-3133", "subtask", STORY, EPIC), row("PP-3132", "subtask", STORY, EPIC), row("PP-3131", "story", EPIC, EPIC), row("PP-3130", "story", EPIC, EPIC)]
    expect(shape(treeOf(rows))).toEqual([
      ["PP-2816", false, [
        ["PP-3130", true, []],
        ["PP-3131", true, [["PP-3132", true, []], ["PP-3133", true, []]]],
      ]],
    ])
  })
  test("a parent that is not linked shows too, under its epic", () => {
    expect(shape(treeOf([row("PP-9", "subtask", STORY, EPIC)]))).toEqual([["PP-2816", false, [["PP-3131", false, [["PP-9", true, []]]]]]])
  })
  test("a ticket with nothing above it is a root; epics first, then by kind and number", () => {
    const rows = [row("PP-20", "bug"), row("PP-3", "task"), row("PP-100", "epic"), row("PP-11", "story")]
    expect((shape(treeOf(rows)) as [string][]).map(n => n[0])).toEqual(["PP-100", "PP-11", "PP-3", "PP-20"])
  })
  test("an epic that is linked is marked so", () => {
    expect(shape(treeOf([row("PP-2816", "epic"), row("PP-3130", "story", EPIC, EPIC)]))).toEqual([["PP-2816", true, [["PP-3130", true, []]]]])
  })
})
