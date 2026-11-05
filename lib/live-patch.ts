// What changed between two snapshots of the board, to send only that: the
// cards that changed (whole), the ones gone, the order when it moved, and
// the other fields that changed. The page keeps every other card as it was,
// so it redraws only what changed (web/src/lib/live-patch.ts).

type Card = { id: string }
export type Pieces = { cards: Map<string, string>; order: string[]; rest: Map<string, string> }
export type Patch = { cards: unknown[]; removed: string[]; order: string[] | null; rest: Record<string, unknown> }

// A snapshot as JSON pieces: each card's, and each other field's.
export function piecesOf(snapshot: { cards: Card[] } & Record<string, unknown>): Pieces {
  const { cards, ...rest } = snapshot
  return {
    cards: new Map(cards.map(c => [c.id, JSON.stringify(c)])),
    order: cards.map(c => c.id),
    rest: new Map(Object.entries(rest).map(([k, v]) => [k, JSON.stringify(v)])),
  }
}

export function patchOf(before: Pieces, after: Pieces): Patch | null {
  const cards = [...after.cards].filter(([id, json]) => before.cards.get(id) !== json).map(([, json]) => JSON.parse(json))
  const removed = before.order.filter(id => !after.cards.has(id))
  const isMoved = before.order.length !== after.order.length || after.order.some((id, i) => before.order[i] !== id)
  const rest = Object.fromEntries([...after.rest].filter(([k, json]) => before.rest.get(k) !== json).map(([k, json]) => [k, JSON.parse(json)]))
  for (const k of before.rest.keys()) if (!after.rest.has(k)) rest[k] = null
  if (!cards.length && !removed.length && !isMoved && !Object.keys(rest).length) return null
  return { cards, removed, order: isMoved ? after.order : null, rest }
}
