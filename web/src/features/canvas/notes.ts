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
