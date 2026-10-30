import { expect, test } from "vitest"
import type { Note } from "@/lib/api-types"
import { CARD_W } from "./geometry"
import { attachTo, continueList, linesOf, nextSize, noteAt, piecesOf, placeNote, tally, toggleBox, toggleItem, toggleMark } from "./notes"

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

test("Enter on a list line starts the next box; on an empty box it ends the list", () => {
  expect(continueList("- [ ] one", 9)).toEqual({ text: "- [ ] one\n- [ ] ", caret: 16 })
  expect(continueList("- [x] one\n- [ ] ", 16)).toEqual({ text: "- [x] one\n", caret: 10 })
  expect(continueList("plain", 5)).toBeNull()
})


test("a note counts its ticked boxes", () => {
  expect(tally("a\n- [x] b\n- [ ] c")).toBe("1/2")
  expect(tally("a")).toBeNull()
})

test("the text's size steps between what reads and what fits", () => {
  expect(nextSize(undefined, 1)).toBe(16)
  expect(nextSize(13, -1)).toBe(11)
  expect(nextSize(11, -1)).toBe(11)
  expect(nextSize(32, 1)).toBe(32)
})

test("a mark goes on a selection, off again, and around the caret", () => {
  expect(toggleMark("say hi now", 4, 6, "**")).toEqual({ text: "say **hi** now", start: 6, end: 8 })
  expect(toggleMark("say **hi** now", 6, 8, "**")).toEqual({ text: "say hi now", start: 4, end: 6 })
  expect(toggleMark("say **hi** now", 4, 10, "**")).toEqual({ text: "say hi now", start: 4, end: 6 })
  expect(toggleMark("ab", 1, 1, "__")).toEqual({ text: "a____b", start: 3, end: 3 })
})

test("a line shows its marks as looks; a lone mark stays as typed", () => {
  expect(piecesOf("a **b __c__** ~~d~~")).toEqual([
    { text: "a ", bold: false, underline: false, strike: false },
    { text: "b ", bold: true, underline: false, strike: false },
    { text: "c", bold: true, underline: true, strike: false },
    { text: " ", bold: false, underline: false, strike: false },
    { text: "d", bold: false, underline: false, strike: true },
  ])
  expect(piecesOf("2 ** 3")).toEqual([{ text: "2 ** 3", bold: false, underline: false, strike: false }])
})

test("the box button turns the caret's line into a box, and back", () => {
  expect(toggleBox("buy milk\ncall Ana", 12)).toEqual({ text: "buy milk\n- [ ] call Ana", caret: 18 })
  expect(toggleBox("buy milk\n- [ ] call Ana", 18)).toEqual({ text: "buy milk\ncall Ana", caret: 12 })
  expect(toggleBox("", 0)).toEqual({ text: "- [ ] ", caret: 6 })
})
