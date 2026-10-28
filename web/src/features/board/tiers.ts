// The tier list: one row per level of importance, then "Paused" (Later).
// Done cards are on no row (they close from the card itself). A card goes to a row by a drag, or with [ and ]. Pure:
// tested on its own (tiers.js).
import type { Card } from "@/lib/api-types"
import type { Step } from "./columns"

export const TIERS = [
  { key: "main", label: "Main task", hint: "What matters most right now", color: "#ef4444" },
  { key: "fixes", label: "Fixes", hint: "Bugs and corrections", color: "#f97316" },
  { key: "searches", label: "Searches", hint: "Look-ups and research", color: "#eab308" },
  { key: "other", label: "Other", hint: "Everything not sorted yet", color: "#22c55e" },
  { key: "paused", label: "Paused", hint: "Set aside for later: drop here to pause it", color: "#64748b" },
] as const
export type TierKey = (typeof TIERS)[number]["key"]

const ROWS: readonly string[] = ["main", "fixes", "searches", "other"] // the ones a card keeps (lib/board.ts TIERS)

export const tierOf = (card: Card): TierKey | null =>
  card.column === "done" ? null : card.column === "parked" ? "paused" : ROWS.includes(card.tier) ? (card.tier as TierKey) : "other"

// What it takes to move a card to a row: the actions to send, or null.
// Out of Done or Later first; Paused keeps the row it had for its return.
export function toTier(card: Card | null, key: TierKey): Step[] | null {
  if (!card || tierOf(card) === key) return null
  const steps: Step[] = card.column === "done" ? [["undone", {}]] : card.column === "parked" ? [["unpark", {}]] : []
  if (key === "paused") return [...steps, ["park", { until: null }]]
  return [...steps, ["tier", { tier: key }]]
}

// A row's order, left to right: the place the person gave each card (rank),
// then the ones never placed, in a fixed order (activity never moves them).
export const byRank = (a: Card, b: Card) =>
  (a.tierRank ?? Infinity) - (b.tierRank ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const GAP = 1024

// The ranks that put card `id` at `index` of `row` (the row's cards in order):
// one rank between its new neighbours, or the whole row numbered again when
// some card there has none yet (or no room is left between two).
export function ranksAt(row: Card[], id: string, index: number): [string, number][] {
  const others = row.filter(c => c.id !== id)
  const before = others[index - 1]?.tierRank
  const after = others[index]?.tierRank
  if (others.every(c => c.tierRank != null)) {
    const lo = before ?? (after ?? GAP) - GAP
    const hi = after ?? lo + 2 * GAP
    if (hi - lo > 1e-6) return [[id, (lo + hi) / 2]]
  }
  const order = others.map(c => c.id)
  order.splice(index, 0, id)
  return order.flatMap((cid, i) => (cid === id || row.find(c => c.id === cid)?.tierRank !== (i + 1) * GAP ? [[cid, (i + 1) * GAP] as [string, number]] : []))
}

// The row above ([) or below (]) a card's, or null at the ends.
export function tierStep(card: Card, step: -1 | 1): TierKey | null {
  if (!tierOf(card)) return null
  const i = TIERS.findIndex(t => t.key === tierOf(card))
  return TIERS[i + step]?.key ?? null
}

// What an empty row says.
export function emptyText(key: TierKey, canDrop: boolean): string {
  if (canDrop) return "Drop here"
  return key === "paused" ? "Drag a card here to pause it" : "Empty"
}
