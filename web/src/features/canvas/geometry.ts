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
