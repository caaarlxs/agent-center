import { describe, expect, it } from "vitest"
import { gestureOf, oriented } from "./gesture"

const box = { left: 100, top: 50, width: 201, height: 437 } // the picture, at half the screen's points
const screen = { width: 402, height: 874 }

describe("gestureOf", () => {
  it("is a tap where you clicked, in the screen's points", () => {
    expect(gestureOf({ x: 200.5, y: 268.5, at: 0 }, { x: 201, y: 269, at: 120 }, box, screen)).toEqual({ kind: "tap", x: 201, y: 437 })
  })
  it("is a hold when the pointer stayed down half a second", () => {
    expect(gestureOf({ x: 150, y: 100, at: 0 }, { x: 151, y: 100, at: 900 }, box, screen)).toEqual({ kind: "hold", x: 100, y: 100, seconds: 0.9 })
  })
  it("is a swipe when it moved, as long as the drag took", () => {
    expect(gestureOf({ x: 200, y: 400, at: 0 }, { x: 200, y: 200, at: 300 }, box, screen)).toEqual({ kind: "swipe", x: 200, y: 700, toX: 200, toY: 300, seconds: 0.3 })
  })
  it("keeps a drag that ends off the picture on the screen", () => {
    expect(gestureOf({ x: 200, y: 400, at: 0 }, { x: 900, y: -80, at: 200 }, box, screen)).toMatchObject({ kind: "swipe", toX: 402, toY: 0 })
  })
})

describe("oriented", () => {
  it("turns the screen's points with the picture", () => {
    expect(oriented(screen, { width: 603, height: 1311 })).toEqual(screen)
    expect(oriented(screen, { width: 1311, height: 603 })).toEqual({ width: 874, height: 402 })
  })
})
