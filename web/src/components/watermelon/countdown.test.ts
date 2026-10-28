import { describe, expect, it } from "vitest"
import { leftAfter } from "./countdown"

describe("leftAfter", () => {
  it("counts down by the time gone by", () => expect(leftAfter(7000, 100, false)).toBe(6900))
  it("stands still while paused", () => expect(leftAfter(7000, 100, true)).toBe(7000))
  it("stops at zero", () => expect(leftAfter(50, 100, false)).toBe(0))
})
