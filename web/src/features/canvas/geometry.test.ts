import { describe, expect, test } from "vitest"
import type { Card, Zone } from "@/lib/api-types"
import { CARD_H, CARD_W, ENTRY, GRID, isInZone, onCanvas, placeCards, snap } from "./geometry"

const card = (id: string, extra: Partial<Card> = {}) => ({ id, column: "review", pos: null, ...extra }) as Card

describe("placeCards", () => {
  test("a saved place wins; the rest line up in Incoming, two per row", () => {
    const at = placeCards([card("a", { pos: { x: 500, y: 300 } }), card("b"), card("c"), card("d")])
    expect(at.a).toEqual({ x: 500, y: 300 })
    expect(at.b).toEqual({ x: ENTRY.x, y: ENTRY.y + GRID })
    expect(at.c).toEqual({ x: ENTRY.x + CARD_W + GRID, y: ENTRY.y + GRID })
    expect(at.d).toEqual({ x: ENTRY.x, y: ENTRY.y + GRID + CARD_H })
  })

  test("a place moved here and not saved yet wins over the saved one", () => {
    expect(placeCards([card("a", { pos: { x: 0, y: 0 } })], { a: { x: 96, y: 48 } }).a).toEqual({ x: 96, y: 48 })
  })
})

test("snap rounds to the grid and never goes negative", () => {
  expect(snap(35)).toBe(24)
  expect(snap(37)).toBe(48)
  expect(snap(-30)).toBe(0)
})

test("onCanvas leaves out done and archived cards", () => {
  expect(onCanvas([card("a"), card("b", { column: "done" }), card("c", { column: "archived" })]).map(c => c.id)).toEqual(["a"])
})

test("a zone holds a card by its top centre", () => {
  const zone: Zone = { id: "z", name: "Z", x: 0, y: 0, w: 400, h: 200 }
  expect(isInZone(zone, { x: 0, y: 0 })).toBe(true)
  expect(isInZone(zone, { x: 300, y: 0 })).toBe(false) // its centre is past the right edge
  expect(isInZone(zone, { x: 0, y: 170 })).toBe(false) // its top is too low
})
