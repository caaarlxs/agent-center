import { expect, test } from "vitest"
import { flightPath } from "./flight"

const w = 1440
const h = 900
const path = flightPath(w, h)

test("it walks in from the left on the ground and walks out on the right", () => {
  expect(path[0]!.x).toBeLessThan(0)
  expect(path[0]!.y).toBeCloseTo(path.at(-1)!.y)
  expect(path.at(-1)!.x).toBeGreaterThan(w)
  expect(path[0]!.offset).toBe(0)
  expect(path.at(-1)!.offset).toBe(1)
})

test("it flies up high and loops all the way round", () => {
  expect(Math.min(...path.map(p => p.y))).toBeLessThan(h * 0.4)
  const turned = Math.max(...path.map(p => p.a)) - Math.min(...path.map(p => p.a))
  expect(turned).toBeGreaterThan(300)
})

test("no jumps: each step short, the turn smooth, the offsets in order", () => {
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1]!, path[i]!]
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(w / 12)
    expect(Math.abs(b.a - a.a)).toBeLessThan(40)
    expect(b.offset).toBeGreaterThan(a.offset)
  }
})
