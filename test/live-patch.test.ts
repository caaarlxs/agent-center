import { describe, expect, test } from "bun:test"
import { patchOf, piecesOf } from "../lib/live-patch"

const snap = (cards: { id: string; n: number }[], rest: Record<string, unknown> = { at: 1 }) => ({ cards, ...rest })

describe("patchOf", () => {
  test("names only the cards that changed, and the order when it changed", () => {
    const before = piecesOf(snap([{ id: "a", n: 1 }, { id: "b", n: 1 }]))
    const after = piecesOf(snap([{ id: "a", n: 1 }, { id: "b", n: 2 }]))
    expect(patchOf(before, after)).toEqual({ cards: [{ id: "b", n: 2 }], removed: [], order: null, rest: {} })
  })
  test("tells a card gone, a new one with its place, and other fields that changed", () => {
    const before = piecesOf(snap([{ id: "a", n: 1 }, { id: "b", n: 1 }], { at: 1, x: 5 }))
    const after = piecesOf(snap([{ id: "c", n: 1 }, { id: "a", n: 1 }], { at: 2, x: 5 }))
    expect(patchOf(before, after)).toEqual({ cards: [{ id: "c", n: 1 }], removed: ["b"], order: ["c", "a"], rest: { at: 2 } })
  })
  test("is null when nothing changed", () => {
    const one = piecesOf(snap([{ id: "a", n: 1 }]))
    expect(patchOf(one, piecesOf(snap([{ id: "a", n: 1 }])))).toBeNull()
  })
})
