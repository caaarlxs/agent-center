// The order the keyboard walks (J/K, ↓/↑): what the current view shows, top
// to bottom. On the canvas: top to bottom, then left to right. Pure: tested
// on its own (main.js walkOrder).
import type { Card } from "@/lib/api-types"
import { onCanvas, placeCards } from "@/features/canvas/geometry"
import { byPin, columnsShown, inboxGroups } from "./columns"
import { TIERS, byRank, tierOf } from "./tiers"

export type View = "inbox" | "board" | "canvas" | "tiers"
export type GroupBy = "none" | "repo"

export function canvasOrder(cards: Card[]): Card[] {
  const open = onCanvas(cards)
  const at = placeCards(open)
  return [...open].sort((a, b) => at[a.id].y - at[b.id].y || at[a.id].x - at[b.id].x)
}

export function walkOrder(view: View, cards: Card[], showDone: boolean, groupBy: GroupBy, repos: { root: string }[]): Card[] {
  if (view === "canvas") return canvasOrder(cards)
  if (view === "tiers") return TIERS.flatMap(t => cards.filter(c => c.column !== "archived" && tierOf(c) === t.key).sort(byRank))
  const cols = columnsShown(showDone)
  const inCol = (list: Card[], col: string) => list.filter(c => c.column === col).sort(byPin)
  if (view === "board" && groupBy === "repo") return repos.flatMap(r => cols.flatMap(col => inCol(cards.filter(c => c.repoRoot === r.root), col)))
  if (view === "board") return cols.flatMap(col => inCol(cards, col))
  return inboxGroups(cards, showDone).flatMap(g => g.cards)
}

// The one `step` away from `current` (the first or the last when none is).
export function stepFrom(order: Card[], current: string | null, step: 1 | -1): Card | null {
  if (!order.length) return null
  const i = order.findIndex(c => c.id === current)
  if (i === -1) return order[step > 0 ? 0 : order.length - 1]
  return order[Math.max(0, Math.min(order.length - 1, i + step))]
}
