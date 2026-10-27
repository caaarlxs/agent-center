// The canvas's geometry: the grid everything snaps to, the card size, the
// "Incoming" corner where cards with no saved place line up, and which cards
// a zone holds. Pure functions: the canvas and its tests use the same ones.
import type { Card, Zone } from "@/lib/api-types"

export const GRID = 24
export const CARD_W = 288
export const CARD_H = 144 // a slot in "Incoming"; cards are about 120 tall
export const ENTRY = { x: GRID, y: GRID * 2, cols: 2 }

export type Point = { x: number; y: number }

export const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID)

// The cards the canvas places: done ones sit in "Done", archived ones leave.
export const onCanvas = (cards: Card[]) => cards.filter(c => c.column !== "done" && c.column !== "archived")

// Where each card sits: a place moved here and not saved yet, its saved
// place, else the next slot in "Incoming", in the cards' order.
export function placeCards(cards: Card[], moved: Record<string, Point> = {}): Record<string, Point> {
  const at: Record<string, Point> = {}
  let slot = 0
  for (const card of cards) {
    const p = moved[card.id] ?? card.pos
    if (p) at[card.id] = p
    else {
      at[card.id] = { x: ENTRY.x + (slot % ENTRY.cols) * (CARD_W + GRID), y: ENTRY.y + GRID + Math.floor(slot / ENTRY.cols) * CARD_H }
      slot++
    }
  }
  return at
}

// A zone holds the cards whose top centre lies inside it.
export function isInZone(zone: Zone, p: Point): boolean {
  const x = p.x + CARD_W / 2
  const y = p.y + 40
  return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h
}

// "Incoming": the dashed corner where cards with no place line up, as tall
// as its rows (at least one).
export function entryBox(slots: number) {
  const h = Math.max(1, Math.ceil(slots / ENTRY.cols)) * CARD_H + GRID
  return { x: ENTRY.x - 12, y: ENTRY.y - 12, w: ENTRY.cols * (CARD_W + GRID), h: h + 12 }
}

// The cards that wait in "Incoming": those with no place of their own.
export const entrySlots = (cards: Card[], moved: Record<string, Point> = {}) => cards.filter(c => !moved[c.id] && !c.pos).length

// A zone drawn from (x0, y0) to (x1, y1); a click (no box drawn) gives one of
// the usual size from that point. At least 160 × 120, on the grid.
export function newZone(r: { x0: number; y0: number; x1: number; y1: number }): Zone {
  const isClick = Math.abs(r.x1 - r.x0) < GRID && Math.abs(r.y1 - r.y0) < GRID
  return {
    id: crypto.randomUUID(),
    name: "New zone",
    x: snap(Math.min(r.x0, r.x1)),
    y: snap(Math.min(r.y0, r.y1)),
    w: Math.max(160, isClick ? CARD_W * 2 + GRID * 3 : snap(Math.abs(r.x1 - r.x0))),
    h: Math.max(120, isClick ? CARD_H * 2 + GRID * 2 : snap(Math.abs(r.y1 - r.y0))),
  }
}

type Rect = Point & { w: number; h: number }

// A free place inside a zone for a card `h` tall, clear of `taken` by a grid
// step: the first one from the top left. With no room, below the rest, and
// the zone grows to hold it.
export function placeIn(zone: Zone, taken: Rect[], h: number): { at: Point; zone: Zone } {
  const isFree = (x: number, y: number) =>
    taken.every(r => x + CARD_W + GRID <= r.x || r.x + r.w + GRID <= x || y + h + GRID <= r.y || r.y + r.h + GRID <= y)
  for (let y = zone.y + 48; y + h <= zone.y + zone.h - GRID; y += GRID)
    for (let x = zone.x + GRID; x + CARD_W <= zone.x + zone.w - GRID; x += GRID) if (isFree(x, y)) return { at: { x: snap(x), y: snap(y) }, zone }
  const at = { x: snap(zone.x + GRID), y: snap(Math.max(zone.y + 48, ...taken.map(r => r.y + r.h + GRID))) }
  return { at, zone: { ...zone, w: Math.max(zone.w, CARD_W + GRID * 2), h: Math.max(zone.h, at.y - zone.y + h + GRID) } }
}
