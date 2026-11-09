import { describe, expect, it } from "vitest"
import { isWaiting } from "./Ask"

describe("isWaiting", () => {
  it("is the last question without its answer, for a while only", () => {
    expect(isWaiting([])).toBe(false)
    expect(isWaiting([{ q: "a", a: null, at: 1000 }], 2000)).toBe(true)
    expect(isWaiting([{ q: "a", a: "b", at: 1000 }], 2000)).toBe(false)
    expect(isWaiting([{ q: "a", a: null, at: 1000, error: "no" }], 2000)).toBe(false)
    expect(isWaiting([{ q: "a", a: null, at: 1000 }], 1000 + 6 * 60_000)).toBe(false)
  })
})
