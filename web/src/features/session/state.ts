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
  pending: "Pending",
  parked: "Later",
  done: "Done",
  stale: "Stuck",
}

// The label a card's state shows: an interrupted session says so (the
// classic board's stateOf), a stuck one "Stuck".
export const labelOf = (card: Card): string => {
  const state = stateOf(card)
  return state === "stale" && !card.isStale && card.isInterrupted ? "Interrupted" : STATE_LABEL[state]
}

// How long a session has waited for you: yellow under 10 minutes, orange up
// to 30, red past 30 (its border, its age, how hard it shakes).
export type Urgency = "low" | "mid" | "high"
export function urgencyOf(card: Card, now: number): Urgency | null {
  if (card.column !== "asking" || !card.waitingSince) return null
  const min = (now - card.waitingSince) / 60_000
  return min > 30 ? "high" : min >= 10 ? "mid" : "low"
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
  const d = Math.round(h / 24)
  return d < 30 ? `${d} d` : `${Math.round(d / 30)} mo`
}

// A repo's colour, the same on every view and in both boards: a hue from
// its name (util.js hue), its dot and its name in that hue.
export function hueOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}
export const repoDot = (name: string) => `hsl(${hueOf(name)} 62% 55%)`
export const repoText = (name: string) => `hsl(${hueOf(name)} 55% var(--repo-l))`
