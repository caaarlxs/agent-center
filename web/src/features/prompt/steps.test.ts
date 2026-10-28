import { describe, expect, it } from "vitest"
import { shareOf, stepAt, stepByKey } from "./steps"

describe("stepAt", () => {
  it("snaps a point to the nearest step", () => {
    expect(stepAt(0, 200, 5)).toBe(0)
    expect(stepAt(60, 200, 5)).toBe(1)
    expect(stepAt(110, 200, 5)).toBe(2)
    expect(stepAt(200, 200, 5)).toBe(4)
  })
  it("stays on the track outside it", () => {
    expect(stepAt(-30, 200, 5)).toBe(0)
    expect(stepAt(260, 200, 5)).toBe(4)
  })
})

describe("stepByKey", () => {
  it("moves one step with the arrows, within the ends", () => {
    expect(stepByKey("ArrowRight", 2, 5)).toBe(3)
    expect(stepByKey("ArrowLeft", 0, 5)).toBe(0)
    expect(stepByKey("ArrowUp", 4, 5)).toBe(4)
  })
  it("jumps to the ends with Home and End, ignores other keys", () => {
    expect(stepByKey("Home", 3, 5)).toBe(0)
    expect(stepByKey("End", 1, 5)).toBe(4)
    expect(stepByKey("Enter", 1, 5)).toBeNull()
  })
})

describe("shareOf", () => it("spreads the steps on the track", () => expect(shareOf(2, 5)).toBe(0.5)))
