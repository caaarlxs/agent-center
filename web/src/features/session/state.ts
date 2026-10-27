// A session's state, from its card: the one key every view draws (icon,
// colour, label) and the one line that says why it is where it is.
import type { Card } from "@/lib/api-types"

export type StateKey = "asking" | "permission" | "review" | "working" | "pending" | "parked" | "done" | "stale"

export function stateOf(card: Card): StateKey {
  if (card.column === "done") return "done"
  if (card.column === "asking") return card.state === "permission" ? "permission" : "asking"
  if (card.column === "working") return "working"
  if (card.column === "parked") return "parked"
  if (card.isStale || card.isInterrupted) return "stale"
  if (card.column === "pending") return "pending"
  return "review"
}

export const STATE_LABEL: Record<StateKey, string> = {
  asking: "Asking you",
  permission: "Needs approval",
  review: "To review",
  working: "Working",
  pending: "Idle",
  parked: "Later",
  done: "Done",
  stale: "Stuck",
}

// The line under the title: the question while it asks, the step under way
// while it works, else what Claude said it did.
export function contextOf(card: Card): string | null {
  if (card.column === "asking") return card.ask
  if (card.column === "working") return card.progress?.current ?? null
  return card.recap
}

// The age a card shows: how long it has waited for you, else its last activity.
export function ageOf(card: Card, now: number): string {
  const since = card.waitingSince ?? card.lastActivity ?? card.updatedAt
  const text = ago(since, now)
  return card.waitingSince ? `waiting ${text}` : text
}

export function ago(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60_000))
  if (min < 1) return "now"
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.round(h / 24)} d`
}

// A repo's colour, the same on every view: a hue from its name.
export function hueOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}
