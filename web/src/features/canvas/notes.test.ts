import { expect, test } from "vitest"
import type { Note } from "@/lib/api-types"
import { CARD_W } from "./geometry"
import { attachTo, linesOf, noteAt, placeNote, toggleItem } from "./notes"

const note = (extra: Partial<Note> = {}): Note => ({ id: "n", text: "", x: 10, y: 20, w: 200, h: 100, color: "yellow", cardId: null, ...extra })
const cardAt = (key: string) => (key === "c" ? { x: 480, y: 240 } : null)

test("a free note sits at its place; an attached one rides its card, or hides with it", () => {
  expect(noteAt(note(), cardAt)).toEqual({ x: 10, y: 20 })
  expect(noteAt(note({ cardId: "c" }), cardAt)).toEqual({ x: 490, y: 260 })
  expect(noteAt(note({ cardId: "gone" }), cardAt)).toBeNull()
})

test("a note attaches to the nearest card within a grid step", () => {
  const cards = [{ key: "far", at: { x: 1000, y: 0 }, h: 120 }, { key: "c", at: { x: 480, y: 240 }, h: 120 }]
  expect(attachTo({ x: 480 + CARD_W + 10, y: 260, w: 200, h: 100 }, cards)).toBe("c")
  expect(attachTo({ x: 480 + CARD_W + 100, y: 260, w: 200, h: 100 }, cards)).toBeNull()
})

test("placed on a card, a note keeps its offset from it; else its own place", () => {
  expect(placeNote(note(), { x: 500, y: 250 }, "c", cardAt)).toMatchObject({ cardId: "c", x: 24, y: 0 })
  expect(placeNote(note({ cardId: "c" }), { x: 500, y: 250 }, null, cardAt)).toMatchObject({ cardId: null, x: 504, y: 240 })
})

test("boxes to tick", () => {
  expect(linesOf("Plan\n- [ ] one\n- [x] two")).toEqual([{ kind: "text", text: "Plan" }, { kind: "item", text: "one", done: false }, { kind: "item", text: "two", done: true }])
  expect(toggleItem("- [ ] one\n- [x] two", 0)).toBe("- [x] one\n- [x] two")
  expect(toggleItem("- [ ] one\n- [x] two", 1)).toBe("- [ ] one\n- [ ] two")
})
