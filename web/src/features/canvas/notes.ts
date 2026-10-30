// Sticky notes on the canvas: free, or attached to a card (they keep their
// offset from it and move with it). Lines written "- [ ] …" are boxes to
// tick. Pure: tested on its own.
import type { Card, Note } from "@/lib/api-types"
import { CARD_W, GRID, type Point, snap } from "./geometry"

export const NOTE_COLORS = ["yellow", "pink", "blue", "green"] as const
export const NOTE_SIZE = { w: 216, h: 144 }

// The key a note keeps for its card: the desktop app's id for the session
// when it has one (it survives a restart of the session), else the card's.
export const cardKey = (card: Pick<Card, "id" | "hostId">) => card.hostId ?? card.id

// Where a note shows: its own place, or its card's plus its offset; a note
// whose card is not on the canvas (done, archived, filtered out) is hidden.
export function noteAt(note: Note, cardAt: (key: string) => Point | null): Point | null {
  if (!note.cardId) return { x: note.x, y: note.y }
  const p = cardAt(note.cardId)
  return p ? { x: p.x + note.x, y: p.y + note.y } : null
}

// The card a note dropped at `r` attaches to: the nearest one it overlaps or
// comes within a grid step of. `cards`: their keys, places and heights.
export function attachTo(r: Point & { w: number; h: number }, cards: { key: string; at: Point; h: number }[]): string | null {
  let best: { key: string; gap: number } | null = null
  for (const c of cards) {
    const gap = Math.max(0, c.at.x - (r.x + r.w), r.x - (c.at.x + CARD_W), c.at.y - (r.y + r.h), r.y - (c.at.y + c.h))
    if (gap <= GRID && (!best || gap < best.gap)) best = { key: c.key, gap }
  }
  return best?.key ?? null
}

// A note dropped at `p`: attached to `key` (its offset from the card), or free.
export function placeNote(note: Note, p: Point, key: string | null, cardAt: (key: string) => Point | null): Note {
  const card = key ? cardAt(key) : null
  return card ? { ...note, cardId: key, x: snap(p.x) - card.x, y: snap(p.y) - card.y } : { ...note, cardId: null, x: snap(p.x), y: snap(p.y) }
}

// A new note: always yellow, 216 × 144 (canvas-notes.js newNote).
export function newNote(at: Point): Note {
  return { id: crypto.randomUUID(), text: "", x: snap(at.x), y: snap(at.y), ...NOTE_SIZE, color: "yellow", cardId: null }
}

const ITEM = /^(\s*[-*] \[)( |x|X)(\] ?)(.*)$/

// A note's lines: plain, or a box to tick.
export function linesOf(text: string): ({ kind: "text"; text: string } | { kind: "item"; text: string; done: boolean })[] {
  return text.split("\n").map(line => {
    const m = line.match(ITEM)
    return m ? { kind: "item", text: m[4], done: m[2] !== " " } : { kind: "text", text: line }
  })
}

// Ticks or unticks the box on line `i`.
export function toggleItem(text: string, i: number): string {
  return text.split("\n").map((line, k) => (k === i ? line.replace(ITEM, (_, a, mark, b, rest) => `${a}${mark === " " ? "x" : " "}${b}${rest}`) : line)).join("\n")
}

// Enter on a list line (canvas-notes.js onKeyDown): the next item starts; on
// an empty item the list ends. The new text and caret, or null (a plain Enter).
export function continueList(text: string, caret: number): { text: string; caret: number } | null {
  const start = text.lastIndexOf("\n", caret - 1) + 1
  const m = text.slice(start, caret).match(ITEM)
  if (!m) return null
  if (m[4].trim()) {
    const add = `\n${m[1]} ${m[3]}`
    return { text: text.slice(0, caret) + add + text.slice(caret), caret: caret + add.length }
  }
  return { text: text.slice(0, start) + text.slice(caret), caret: start }
}

// "2/5": the boxes ticked of all, or null with none.
export function tally(text: string): string | null {
  const items = linesOf(text).filter(l => l.kind === "item")
  return items.length ? `${items.filter(l => l.kind === "item" && l.done).length}/${items.length}` : null
}

// "Add a checkbox": a new box at the end.
export const withItem = (text: string) => {
  const t = text.replace(/\s*$/, "")
  return `${t}${t ? "\n" : ""}- [ ] `
}

// ---------- the text's size and marks ----------

// The sizes a note's text steps through (px): never below what reads.
export const TEXT_SIZES = [11, 13, 16, 20, 26, 32] as const
export const TEXT_SIZE = 13
export function nextSize(size: number | undefined, step: 1 | -1): number {
  const at = TEXT_SIZES.indexOf((size ?? TEXT_SIZE) as (typeof TEXT_SIZES)[number])
  return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, (at === -1 ? 1 : at) + step))]!
}

// Bold, underline, struck: plain marks in the text, shown once you leave it.
export type Mark = "**" | "__" | "~~"
const MARKS: Mark[] = ["**", "__", "~~"]

// The mark on the selection, or off when it has it already (around it or
// inside its ends); with nothing selected, the marks with the caret between.
export function toggleMark(text: string, start: number, end: number, mark: Mark): { text: string; start: number; end: number } {
  const n = mark.length
  if (text.slice(start - n, start) === mark && text.slice(end, end + n) === mark)
    return { text: text.slice(0, start - n) + text.slice(start, end) + text.slice(end + n), start: start - n, end: end - n }
  const picked = text.slice(start, end)
  if (picked.length >= 2 * n && picked.startsWith(mark) && picked.endsWith(mark))
    return { text: text.slice(0, start) + picked.slice(n, -n) + text.slice(end), start, end: end - 2 * n }
  return { text: text.slice(0, start) + mark + picked + mark + text.slice(end), start: start + n, end: end + n }
}

// A line in pieces with their look; a mark with no partner stays as typed.
export type Piece = { text: string; bold: boolean; underline: boolean; strike: boolean }
export function piecesOf(line: string): Piece[] {
  const parts = line.split(/(\*\*|__|~~)/)
  const left: Record<Mark, number> = { "**": 0, "__": 0, "~~": 0 }
  for (const p of parts) if (MARKS.includes(p as Mark)) left[p as Mark]++
  const on: Record<Mark, boolean> = { "**": false, "__": false, "~~": false }
  const out: Piece[] = []
  const add = (text: string) => {
    if (!text) return
    const look = { bold: on["**"], underline: on["__"], strike: on["~~"] }
    const last = out[out.length - 1]
    if (last && last.bold === look.bold && last.underline === look.underline && last.strike === look.strike) last.text += text
    else out.push({ text, ...look })
  }
  for (const p of parts) {
    const mark = MARKS.includes(p as Mark) ? (p as Mark) : null
    if (!mark) add(p)
    else if (on[mark] || left[mark] >= 2) (on[mark] = !on[mark]), left[mark]--
    else (add(p), left[mark]--) // no partner left: as typed
  }
  return out
}
