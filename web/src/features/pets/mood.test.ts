import { describe, expect, it } from "vitest"
import { energyOf, isQuiet, postsOf, restOf } from "./mood"

const at = (iso: string) => new Date(iso)
const limits = (pct: number, resetsAt = "2026-11-25T15:00:00Z") => ({ at: 0, windows: [{ kind: "five_hour", percentUsed: pct, resetsAt }, { kind: "seven_day", percentUsed: 5, resetsAt: "2026-11-30T00:00:00Z" }] })
const card = (id: string, column: string, updatedAt = 0) => ({ id, column, updatedAt }) as any

describe("energyOf", () => {
  it("is what is left of the 5-hour limit", () => {
    const now = Date.parse("2026-11-25T12:00:00Z")
    expect(energyOf(limits(30), now)).toBe(70)
    expect(energyOf(limits(120), now)).toBe(0)
    expect(energyOf(limits(95, "2026-11-25T11:00:00Z"), now)).toBe(100) // reset already: full again
  })
  it("is full when the board knows no limit", () => {
    expect(energyOf(null, 0)).toBe(100)
    expect(energyOf({ at: 0, windows: [] }, 0)).toBe(100)
  })
})

describe("restOf", () => {
  it("sleeps at night, out of tokens, and not otherwise", () => {
    expect(restOf(80, at("2026-11-25T23:30:00"))).toBe("night")
    expect(restOf(80, at("2026-11-25T06:10:00"))).toBe("night")
    expect(restOf(0, at("2026-11-25T12:00:00"))).toBe("spent")
    expect(restOf(40, at("2026-11-25T12:00:00"))).toBeNull()
  })
  it("is away at the weekend", () => {
    expect(restOf(80, at("2026-11-28T12:00:00"))).toBe("weekend") // a Saturday
    expect(restOf(80, at("2026-11-29T12:00:00"))).toBe("weekend")
  })
})

describe("postsOf", () => {
  it("sends each pet to a different session: one that asks you first, then the newest working", () => {
    const cards = [card("w1", "working", 1), card("a", "asking", 0), card("w2", "working", 5), card("d", "done", 9)]
    expect(postsOf(cards, ["p", "q"])).toEqual(new Map([["p", { cardId: "a", kind: "asking" }], ["q", { cardId: "w2", kind: "working" }]]))
  })
  it("leaves a pet free when there is no session for it", () => {
    expect(postsOf([card("w1", "working")], ["p", "q"])).toEqual(new Map([["p", { cardId: "w1", kind: "working" }], ["q", null]]))
    expect(postsOf([], ["p"])).toEqual(new Map([["p", null]]))
  })
})

describe("isQuiet", () => {
  it("is a board where no session works or asks", () => {
    expect(isQuiet([card("a", "pending"), card("b", "done")])).toBe(true)
    expect(isQuiet([card("a", "working")])).toBe(false)
    expect(isQuiet([card("a", "asking")])).toBe(false)
  })
})
