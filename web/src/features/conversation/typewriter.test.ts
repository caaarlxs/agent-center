import { describe, expect, it } from "vitest"
import { nextLength, speedFor, startOf } from "./typewriter"

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

describe("startOf: where the next text starts typing", () => {
  it("goes on where it was when the text grows", () => expect(startOf("Hello", 3, "Hello world")).toBe(3))
  it("keeps its place when the first block moves into the conversation", () => {
    expect(startOf("First block.\n\nSecond, half", 20, "Second, half and more")).toBe(6)
  })
  it("starts over for another text", () => expect(startOf("Old step", 8, "New step")).toBe(0))
})
