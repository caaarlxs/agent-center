import { describe, expect, it } from "vitest"
import type { Card } from "@/lib/api-types"
import { eventsOf, seenOf } from "./events"

const card = (id: string, column: string, state = "idle") => ({ id, column, state, title: id }) as unknown as Card

describe("eventsOf", () => {
  it("says nothing on the first look", () => {
    expect(eventsOf(null, [card("a", "asking")])).toEqual([])
  })

  it("tells a turn that ended, a new question and a new approval", () => {
    const before = seenOf([card("a", "working"), card("b", "working"), card("c", "review")])
    const now = [card("a", "review"), card("b", "asking"), card("c", "asking", "permission")]
    expect(eventsOf(before, now).map(e => [e.card.id, e.kind])).toEqual([["a", "done"], ["b", "ask"], ["c", "permission"]])
  })

  it("leaves out what still works, still asks, or was archived", () => {
    const before = seenOf([card("a", "working"), card("b", "asking"), card("c", "working")])
    const now = [card("a", "working"), card("b", "asking"), card("c", "archived")]
    expect(eventsOf(before, now)).toEqual([])
  })
})
