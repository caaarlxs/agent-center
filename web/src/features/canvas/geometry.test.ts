import { describe, expect, test } from "vitest"
import type { Card, Zone } from "@/lib/api-types"
import { belowZone, CARD_H, CARD_W, ENTRY, GRID, isInZone, membersOf, notesOf, onCanvas, placeCards, snap } from "./geometry"

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

describe("membersOf", () => {
  const zone: Zone = { id: "z", name: "Z", x: 0, y: 0, w: 700, h: 400 }
  const at = { a: { x: 24, y: 48 }, b: { x: 360, y: 48 }, c: { x: 900, y: 48 } }
  const cards = [card("a"), card("b"), card("c")]
  test("an open zone holds the cards inside it", () => {
    expect(membersOf(zone, cards, at).map(c => c.id)).toEqual(["a", "b"])
  })
  test("a folded zone holds the cards it folded, not those put on its place since", () => {
    expect(membersOf({ ...zone, collapsed: true, held: ["a"] }, cards, at).map(c => c.id)).toEqual(["a"])
  })
  test("a zone folded before it kept them holds the cards inside it", () => {
    expect(membersOf({ ...zone, collapsed: true }, cards, at).map(c => c.id)).toEqual(["a", "b"])
  })
})

describe("belowZone", () => {
  test("lines cards up under the zone, three per row", () => {
    const zone: Zone = { id: "z", name: "Z", x: 48, y: 96, w: 696, h: 408 }
    expect(belowZone(zone, 0)).toEqual({ x: 48, y: 96 + 408 + GRID })
    expect(belowZone(zone, 2)).toEqual({ x: 48 + 2 * (CARD_W + GRID), y: 96 + 408 + GRID })
    expect(belowZone(zone, 3)).toEqual({ x: 48, y: 96 + 408 + GRID + CARD_H })
  })
})

describe("notesOf", () => {
  const zone: Zone = { id: "z", name: "Z", x: 0, y: 0, w: 700, h: 400 }
  const notes = [{ id: "n1", x: 24, y: 48 }, { id: "n2", x: 360, y: 48 }, { id: "n3", x: 900, y: 48 }, { id: "n4", x: 24, y: 48, cardId: "k" }]
  test("an open zone holds the free notes inside it", () => {
    expect(notesOf(zone, notes).map(n => n.id)).toEqual(["n1", "n2"])
  })
  test("a folded zone holds the notes it folded, not those put on its place since", () => {
    expect(notesOf({ ...zone, collapsed: true, heldNotes: ["n1"] }, notes).map(n => n.id)).toEqual(["n1"])
  })
  test("a zone folded before it kept them holds the notes inside it", () => {
    expect(notesOf({ ...zone, collapsed: true }, notes).map(n => n.id)).toEqual(["n1", "n2"])
  })
})
