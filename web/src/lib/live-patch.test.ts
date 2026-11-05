import { describe, expect, it } from "vitest"
import { type Patch, applyPatch } from "./live-patch"

describe("applyPatch", () => {
  it("keeps the cards that did not change as they were (the same objects)", () => {
    const a = { id: "a", n: 1 }
    const b = { id: "b", n: 1 }
    const before = { cards: [a, b], at: 1 } as never
    const after = applyPatch(before, { cards: [{ id: "b", n: 2 }], removed: [], order: null, rest: { at: 2 } } as unknown as Patch) as unknown as { cards: { id: string; n: number }[]; at: number }
    expect(after.cards[0]).toBe(a)
    expect(after.cards[1]).toEqual({ id: "b", n: 2 })
    expect(after.at).toBe(2)
  })
  it("drops the cards gone and follows the new order", () => {
    const a = { id: "a", n: 1 }
    const before = { cards: [a, { id: "b", n: 1 }] } as never
    const after = applyPatch(before, { cards: [{ id: "c", n: 1 }], removed: ["b"], order: ["c", "a"], rest: {} } as unknown as Patch) as unknown as { cards: { id: string }[] }
    expect(after.cards.map(c => c.id)).toEqual(["c", "a"])
    expect(after.cards[1]).toBe(a)
  })
})
