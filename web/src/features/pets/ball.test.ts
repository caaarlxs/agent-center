import { describe, expect, it } from "vitest"
import { GRAVITY, throwTo } from "./ball"

describe("throwTo", () => {
  it("is a throw whose arc lands where it is aimed", () => {
    const from = { x: 100, y: 500 }
    const to = { x: 400, y: 520 }
    const { vx, vy, time } = throwTo(from, to)
    expect(from.x + vx * time).toBeCloseTo(to.x, 5)
    expect(from.y + vy * time + 0.5 * GRAVITY * time * time).toBeCloseTo(to.y, 5)
    expect(vy).toBeLessThan(0) // up first
  })
  it("takes longer the farther it goes, within limits", () => {
    expect(throwTo({ x: 0, y: 0 }, { x: 80, y: 0 }).time).toBeLessThan(throwTo({ x: 0, y: 0 }, { x: 600, y: 0 }).time)
    expect(throwTo({ x: 0, y: 0 }, { x: 5000, y: 0 }).time).toBeLessThanOrEqual(1.1)
  })
})
