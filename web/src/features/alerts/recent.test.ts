import { describe, expect, it } from "vitest"
import { edgeOf, isWriting, withEnds } from "./recent"

describe("withEnds", () => {
  it("puts the sessions that just told you first, each once, the newest 10 within half an hour", () => {
    const now = 10_000_000
    const before = [{ id: "a", at: now - 60_000 }, { id: "b", at: now - 40 * 60_000 }]
    expect(withEnds(before, ["c", "a"], now)).toEqual([{ id: "c", at: now }, { id: "a", at: now }])
    expect(withEnds([], Array.from({ length: 12 }, (_, i) => `s${i}`), now)).toHaveLength(10)
  })
})

describe("edgeOf", () => {
  const view = { width: 1000, height: 600 }
  it("is nothing for a card on screen", () => {
    expect(edgeOf({ x: 500, y: 300 }, view)).toBeNull()
  })
  it("sits on the edge toward a card off screen, pointing at it", () => {
    expect(edgeOf({ x: 1500, y: 300 }, view)).toEqual({ x: 1000 - 28, y: 300, angle: 0 })
    expect(edgeOf({ x: 500, y: -400 }, view)).toEqual({ x: 500, y: 28, angle: -90 })
    expect(edgeOf({ x: -300, y: 900 }, view)!.x).toBe(28)
    expect(edgeOf({ x: -300, y: 900 }, view)!.y).toBe(600 - 28)
  })
})

describe("isWriting", () => {
  it("is a box you type in, not a button or a checkbox", () => {
    expect(isWriting({ tagName: "TEXTAREA" })).toBe(true)
    expect(isWriting({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(isWriting({ tagName: "DIV", isContentEditable: true })).toBe(true)
    expect(isWriting({ tagName: "INPUT", type: "checkbox" })).toBe(false)
    expect(isWriting({ tagName: "BUTTON" })).toBe(false)
    expect(isWriting(null)).toBe(false)
  })
})
