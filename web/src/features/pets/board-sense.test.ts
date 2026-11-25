import { expect, test } from "vitest"
import { turnsEnded } from "./board-sense"

const card = (id: string, column: string) => ({ id, column })

test("the sessions that just finished a turn: working before, not now", () => {
  const before = new Map([["a", "working"], ["b", "working"], ["c", "review"]])
  expect(turnsEnded(before, [card("a", "review"), card("b", "working"), card("c", "asking"), card("new", "review")])).toEqual(["a"])
})
