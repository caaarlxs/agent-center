// What changed between two looks at the board that is worth telling you: a
// turn that ended, a session that started asking or needs your approval.
import type { Card } from "@/lib/api-types"

export type Seen = { asking: Set<string>; working: Set<string> }
export type AlertKind = "done" | "ask" | "permission"
export type AlertEvent = { card: Card; kind: AlertKind }

export const seenOf = (cards: Card[]): Seen => ({
  asking: new Set(cards.filter(c => c.column === "asking").map(c => c.id)),
  working: new Set(cards.filter(c => c.column === "working").map(c => c.id)),
})

// Nothing on the first look (`before` null): what already waits is not news.
export function eventsOf(before: Seen | null, cards: Card[]): AlertEvent[] {
  if (!before) return []
  return cards.flatMap(card => {
    const startsAsking = card.column === "asking" && !before.asking.has(card.id)
    const endsTurn = before.working.has(card.id) && card.column !== "working" && card.column !== "archived"
    if (!startsAsking && !endsTurn) return []
    const kind: AlertKind = card.column !== "asking" ? "done" : card.state === "permission" ? "permission" : "ask"
    return [{ card, kind }]
  })
}

export const WHAT: Record<AlertKind, string> = { done: "finished", ask: "asks you something", permission: "needs your approval" }
