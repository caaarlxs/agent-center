// The tier list: one row per level of importance, then "Paused" (Later) and
// "Close" (Done). A card goes to a row by a drag, or with [ and ]. Pure:
// tested on its own (tiers.js).
import type { Card } from "@/lib/api-types"
import type { Step } from "./columns"

export const TIERS = [
  { key: "main", label: "Main task", hint: "What matters most right now", color: "#ef4444" },
  { key: "fixes", label: "Fixes", hint: "Bugs and corrections", color: "#f97316" },
  { key: "searches", label: "Searches", hint: "Look-ups and research", color: "#eab308" },
  { key: "other", label: "Other", hint: "Everything not sorted yet", color: "#22c55e" },
  { key: "paused", label: "Paused", hint: "Set aside for later: drop here to pause it", color: "#64748b" },
  { key: "close", label: "Close", hint: "Drop here to close the conversation", color: "var(--faint)" },
] as const
export type TierKey = (typeof TIERS)[number]["key"]

const ROWS: readonly string[] = ["main", "fixes", "searches", "other"] // the ones a card keeps (lib/board.ts TIERS)

export const tierOf = (card: Card): TierKey =>
  card.column === "done" ? "close" : card.column === "parked" ? "paused" : ROWS.includes(card.tier) ? (card.tier as TierKey) : "other"

// What it takes to move a card to a row: the actions to send, or null.
// Out of Done or Later first; Paused keeps the row it had for its return.
export function toTier(card: Card | null, key: TierKey): Step[] | null {
  if (!card || tierOf(card) === key) return null
  if (key === "close") return [["done", {}]]
  const steps: Step[] = card.column === "done" ? [["undone", {}]] : card.column === "parked" ? [["unpark", {}]] : []
  if (key === "paused") return [...steps, ["park", { until: null }]]
  return [...steps, ["tier", { tier: key }]]
}

// The row above ([) or below (]) a card's, or null at the ends.
export function tierStep(card: Card, step: -1 | 1): TierKey | null {
  const i = TIERS.findIndex(t => t.key === tierOf(card))
  return TIERS[i + step]?.key ?? null
}

// What an empty row says (Close also when its cards are hidden).
export function emptyText(key: TierKey, count: number, canDrop: boolean): string {
  if (key === "close") return canDrop ? "Drop here to close it" : count ? `${count} closed · “Done” at the top shows them` : "Drag a card here to close it"
  if (canDrop) return "Drop here"
  return key === "paused" ? "Drag a card here to pause it" : "Empty"
}
