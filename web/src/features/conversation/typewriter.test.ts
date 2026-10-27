import { describe, expect, it } from "vitest"
import { nextLength, speedFor } from "./typewriter"

describe("the letters of the answer being written", () => {
  it("type a big piece in within the catch-up time, not at once", () => {
    const speed = speedFor(0, 2000)
    let shown = 0
    for (let ms = 0; ms < 400; ms += 33) shown = nextLength(shown, 2000, 33, speed)
    expect(shown).toBeGreaterThan(500)
    expect(shown).toBeLessThan(2000) // still typing halfway
    for (let ms = 400; ms < 830; ms += 33) shown = nextLength(shown, 2000, 33, speed)
    expect(shown).toBe(2000)
  })
  it("come a few at a time, never all at once", () => {
    expect(nextLength(0, 120, 33, speedFor(0, 120))).toBeLessThan(40)
    expect(nextLength(0, 120, 33, speedFor(0, 120))).toBeGreaterThan(0)
  })
  it("never go past what arrived", () => expect(nextLength(119, 120, 500, speedFor(119, 120))).toBe(120))
})
