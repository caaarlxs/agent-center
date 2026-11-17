// The tier list: the person's rows, most important first (the default ones
// until they make their own: Edit tiers; lib/board.ts keeps them), then
// "Paused" (Later). Done cards are on no row (they close from the card
// itself). A card goes to a row by a drag, or with [ and ]; one whose row is
// unknown sits in the last one. Pure: the rows are read from the live board
// unless given (tests give them).
import type { Card, Snapshot } from "@/lib/api-types"
import { live } from "@/lib/live"
import type { Step } from "./columns"

export type Row = Snapshot["tiers"][number]
export type Tier = Row & { isPaused?: true }
export type TierKey = string

export const DEFAULT_ROWS: Row[] = [
  { key: "main", label: "Main task", color: "#ef4444" },
  { key: "fixes", label: "Fixes", color: "#f97316" },
  { key: "searches", label: "Searches", color: "#eab308" },
  { key: "other", label: "Other", color: "#22c55e" },
]
export const PAUSED: Tier = { key: "paused", label: "Paused", color: "#64748b", isPaused: true }
export const MAX_ROWS = 20 // as lib/board.ts MAX_TIERS
// The colours a row can take: the cards' own, then red and slate.
export const ROW_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"]

/** The person's rows now, as the board sent them. */
export const rowsNow = (): Row[] => live().snapshot?.tiers ?? DEFAULT_ROWS
/** Every row of the view, top to bottom: the person's, then Paused. */
export const tiersOf = (rows: Row[] = rowsNow()): Tier[] => [...rows, PAUSED]

export const tierOf = (card: Card, rows: Row[] = rowsNow()): TierKey | null =>
  card.column === "done" ? null : card.column === "parked" ? "paused" : rows.some(r => r.key === card.tier) ? card.tier : (rows.at(-1)?.key ?? null)

/** A row's name, for a toast. */
export const labelOf = (key: TierKey, rows: Row[] = rowsNow()) => tiersOf(rows).find(t => t.key === key)?.label ?? key

/** A key for a new row, not taken by another. */
export const newRowKey = (rows: Row[]) => {
  for (;;) {
    const key = `t-${Math.random().toString(36).slice(2, 8)}`
    if (!rows.some(r => r.key === key)) return key
  }
}

// What it takes to move a card to a row: the actions to send, or null.
// Out of Done or Later first; Paused keeps the row it had for its return.
export function toTier(card: Card | null, key: TierKey, rows: Row[] = rowsNow()): Step[] | null {
  if (!card || tierOf(card, rows) === key) return null
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
export function tierStep(card: Card, step: -1 | 1, rows: Row[] = rowsNow()): TierKey | null {
  const key = tierOf(card, rows)
  if (!key) return null
  const all = tiersOf(rows)
  return all[all.findIndex(t => t.key === key) + step]?.key ?? null
}

// What an empty row says.
export function emptyText(key: TierKey, canDrop: boolean): string {
  if (canDrop) return "Drop here"
  return key === "paused" ? "Drag a card here to pause it" : "Empty"
}

// ---------- editing the rows (Edit tiers) ----------

export const renameRow = (rows: Row[], key: TierKey, label: string): Row[] => rows.map(r => (r.key === key ? { ...r, label: label.replace(/\s+/g, " ").trim().slice(0, 40) || r.label } : r))
export const recolorRow = (rows: Row[], key: TierKey, color: string): Row[] => rows.map(r => (r.key === key ? { ...r, color } : r))

/** The row one place up (-1) or down (1); at an end, as it was. */
export function moveRow(rows: Row[], key: TierKey, step: -1 | 1): Row[] {
  const i = rows.findIndex(r => r.key === key)
  const j = i + step
  if (i < 0 || j < 0 || j >= rows.length) return rows
  const out = [...rows]
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

/** A new row at the end, in the next colour; none past MAX_ROWS. */
export function addRow(rows: Row[], label = "New tier"): Row[] {
  if (rows.length >= MAX_ROWS) return rows
  return [...rows, { key: newRowKey(rows), label, color: ROW_COLORS[rows.length % ROW_COLORS.length]! }]
}

/** Without that row; the last one stays (the cards need a row). */
export const removeRow = (rows: Row[], key: TierKey): Row[] => (rows.length > 1 ? rows.filter(r => r.key !== key) : rows)

/** Where the cards of a removed row go: the last row once it is gone. */
export const heirOf = (rows: Row[], key: TierKey) => removeRow(rows, key).at(-1)
