import { expect, test } from "vitest"
import { flingOf, flyStep, type Flight } from "./fling"

const box = { minX: 40, maxX: 1000, minY: 120, maxY: 800 }
const fly = (f: Flight, seconds: number) => {
  let s = f
  let landed = false
  for (let t = 0; t < seconds && !landed; t += 0.016) ({ flight: s, landed } = flyStep(s, 0.016, box))
  return { s, landed }
}

test("thrown up, it comes down, bounces and lands on the floor", () => {
  const { s, landed } = fly({ x: 500, y: 700, vx: 300, vy: -900, angle: 0 }, 8)
  expect(landed).toBe(true)
  expect(s.y).toBe(box.maxY)
  expect(s.x).toBeGreaterThan(500)
})

test("it bounces off the walls, never leaving the window", () => {
  const { s } = fly({ x: 900, y: 500, vx: 2500, vy: 0, angle: 0 }, 8)
  expect(s.x).toBeLessThanOrEqual(box.maxX)
  expect(s.x).toBeGreaterThanOrEqual(box.minX)
})

test("it tumbles the way it flies", () => {
  const { flight } = flyStep({ x: 500, y: 500, vx: 400, vy: 0, angle: 0 }, 0.1, box)
  expect(flight.angle).toBeGreaterThan(0)
})

test("a drag let go slowly is not a throw; a quick one is, capped", () => {
  const t = (ms: number, x: number, y: number) => ({ x, y, t: ms })
  expect(flingOf([t(0, 0, 0), t(80, 10, 0)], 80)).toBeNull()
  const quick = flingOf([t(0, 0, 0), t(50, 60, -40)], 50)!
  expect(quick.vx).toBeCloseTo(1200)
  expect(quick.vy).toBeCloseTo(-800)
  const wild = flingOf([t(0, 0, 0), t(10, 500, 0)], 10)!
  expect(Math.hypot(wild.vx, wild.vy)).toBeCloseTo(2600)
})

test("moved fast, then held still before letting go: not a throw", () => {
  const t = (ms: number, x: number, y: number) => ({ x, y, t: ms })
  expect(flingOf([t(0, 0, 0), t(50, 300, 0)], 250)).toBeNull()
})
