import { expect, test } from "vitest"
import { area, peel } from "./peel"

const W = 168
const H = 228

test("not pulled: the whole back stays, nothing folds", () => {
  const p = peel(W, H, { x: W, y: H })
  expect(area(p.rest)).toBeCloseTo(W * H)
  expect(p.flap).toEqual([])
})

test("the corner pulled in: a small triangle folds over, mirrored across the fold", () => {
  const p = peel(W, H, { x: W - 40, y: H - 40 })
  expect(area(p.flap)).toBeCloseTo(800) // a right triangle with legs of 40
  expect(area(p.rest)).toBeCloseTo(W * H - 800)
  // The corner lands where the pointer is.
  expect(p.flap.some(v => Math.hypot(v.x - (W - 40), v.y - (H - 40)) < 0.01)).toBe(true)
})

test("pulled past the far corner: nothing of the back is left", () => {
  const p = peel(W, H, { x: -W * 1.05, y: -H * 1.05 })
  expect(area(p.rest)).toBe(0)
})

test("the fold's place along the shading gradient, from 0 to 1", () => {
  const p = peel(W, H, { x: W / 2, y: H / 2 })
  expect(p.foldAt).toBeGreaterThan(0)
  expect(p.foldAt).toBeLessThan(1)
})
