// What waits for you, in the order "Next up" walks it: approvals first, then
// questions (the oldest first), then what is new to review (the oldest
// first). Pure: tested on its own.
import type { Card } from "@/lib/api-types"

export function waitingOf(cards: Card[]): Card[] {
  const since = (c: Card) => c.waitingSince ?? c.lastActivity ?? 0
  const asking = cards.filter(c => c.column === "asking").sort((a, b) => since(a) - since(b))
  return [
    ...asking.filter(c => c.state === "permission"),
    ...asking.filter(c => c.state !== "permission"),
    ...cards.filter(c => c.column === "review").sort((a, b) => (a.lastActivity ?? 0) - (b.lastActivity ?? 0)),
  ]
}

// The one after `current` (the first when none is open, or it is not in the list).
export function nextAfter(waiting: Card[], current: string | null): Card | null {
  if (!waiting.length) return null
  const i = waiting.findIndex(c => c.id === current)
  return waiting[(i + 1) % waiting.length]
}
