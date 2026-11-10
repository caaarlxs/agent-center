import { expect, test } from "vitest"
import { nextWaiting, turnsEnded } from "./board-sense"

const card = (id: string, column: string, waitingSince: number | null = null) => ({ id, column, waitingSince })

test("the session that waits for you first: one asking, the longest first; then one to review", () => {
  expect(nextWaiting([card("w", "working"), card("r", "review"), card("a2", "asking", 20), card("a1", "asking", 10)])?.id).toBe("a1")
  expect(nextWaiting([card("w", "working"), card("p", "pending"), card("r", "review")])?.id).toBe("r")
  expect(nextWaiting([card("w", "working"), card("d", "done")])).toBeNull()
})

test("the sessions that just finished a turn: working before, not now", () => {
  const before = new Map([["a", "working"], ["b", "working"], ["c", "review"]])
  expect(turnsEnded(before, [card("a", "review"), card("b", "working"), card("c", "asking"), card("new", "review")])).toEqual(["a"])
})
