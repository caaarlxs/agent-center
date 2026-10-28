// The board's columns (the states a session goes through) and what the list
// views do with them: the inbox's groups, the board's drop rules and its
// stacks of one repo. Pure: tested on its own (util.js, board.js).
import type { Card } from "@/lib/api-types"

// "review" holds what is new since you last looked; once seen it moves to
// "pending" (your queue) until the session changes again.
export const COLUMNS = ["asking", "review", "working", "pending", "parked", "done"] as const
export type ColumnKey = (typeof COLUMNS)[number]

export type Tone = "ask" | "review" | "work" | "pending" | "muted"
export const COLUMN: Record<ColumnKey, { label: string; tone: Tone }> = {
  asking: { label: "Asking you", tone: "ask" },
  review: { label: "To review", tone: "review" },
  working: { label: "Working", tone: "work" },
  pending: { label: "Pending", tone: "pending" },
  parked: { label: "Later", tone: "muted" },
  done: { label: "Done", tone: "muted" },
}

// A tone's dot colour (Tailwind classes).
export const TONE_DOT: Record<Tone, string> = {
  ask: "bg-ask",
  review: "bg-review",
  work: "bg-work",
  pending: "bg-[color-mix(in_srgb,var(--review)_55%,var(--faint))]",
  muted: "bg-faint",
}

export const byPin = (a: Card, b: Card) => Number(b.pinned) - Number(a.pinned)

// The columns shown: Done only when asked for (or while a card is dragged,
// to drop it there).
export const columnsShown = (showDone: boolean, isDragging = false): ColumnKey[] =>
  COLUMNS.filter(c => c !== "done" || showDone || isDragging)

// The inbox: the pinned first, then one group per column; an empty group
// hides, except "Asking you" (it says nothing waits).
export type Group = { key: "pinned" | ColumnKey; label: string; cards: Card[] }
export function inboxGroups(cards: Card[], showDone: boolean): Group[] {
  const isPinned = (c: Card) => c.pinned && c.column !== "done"
  return [
    { key: "pinned" as const, label: "Pinned", cards: cards.filter(isPinned) },
    ...columnsShown(showDone).map(col => ({ key: col, label: COLUMN[col].label, cards: cards.filter(c => c.column === col && !isPinned(c)) })),
  ].filter(g => g.cards.length > 0 || g.key === "asking")
}

// What a card dropped on a column asks of the server, or null (no drop).
export type Step = [action: "park" | "done" | "seen" | "unpark" | "undone" | "tier" | "rank", payload: Record<string, unknown>]
export function dropAction(card: Card | null, column: ColumnKey): Step | null {
  if (!card || card.column === column) return null
  if (column === "parked") return ["park", { until: null }]
  if (column === "done") return ["done", {}]
  if (column === "pending" && card.column === "review") return ["seen", {}]
  if (card.column === "parked") return ["unpark", {}]
  if (card.column === "done") return ["undone", {}]
  return null
}

// Consecutive cards of one repo (and one pin state), in the column's order:
// each run shows as one stack headed by its repo; the order never changes.
export type Run = { repoRoot: string; repo: string; pinned: boolean; cards: Card[] }
export function runsOf(list: Card[]): Run[] {
  const runs: Run[] = []
  for (const card of list) {
    const last = runs.at(-1)
    if (last && last.repoRoot === card.repoRoot && last.pinned === card.pinned) last.cards.push(card)
    else runs.push({ repoRoot: card.repoRoot, repo: card.repo, pinned: card.pinned, cards: [card] })
  }
  return runs
}
