import { describe, expect, it } from "vitest"
import { nextLength, speedFor } from "./typewriter"

describe("the letters of the answer being written", () => {
  it("catch up with what arrived within about one piece's time", () => {
    const speed = speedFor(0, 120)
    let shown = 0
    for (let ms = 0; ms < 165; ms += 33) shown = nextLength(shown, 120, 33, speed)
    expect(shown).toBe(120)
  })
  it("come a few at a time, never all at once", () => {
    expect(nextLength(0, 120, 33, speedFor(0, 120))).toBeLessThan(40)
    expect(nextLength(0, 120, 33, speedFor(0, 120))).toBeGreaterThan(0)
  })
  it("never go past what arrived", () => expect(nextLength(119, 120, 500, speedFor(119, 120))).toBe(120))
})
