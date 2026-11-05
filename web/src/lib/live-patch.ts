// A change the server sends instead of the whole board (lib/live-patch.ts):
// the cards that changed replace theirs, the ones gone go, the order follows;
// every other card stays the same object, so what reads it does not redraw.
import type { Card, Snapshot } from "./api-types"

export type Patch = { cards: Card[]; removed: string[]; order: string[] | null; rest: Partial<Snapshot> }

export function applyPatch(snapshot: Snapshot, patch: Patch): Snapshot {
  const byId = new Map(snapshot.cards.map(c => [c.id, c]))
  for (const id of patch.removed) byId.delete(id)
  for (const c of patch.cards) byId.set(c.id, c)
  const order = patch.order ?? [...snapshot.cards.map(c => c.id).filter(id => byId.has(id)), ...patch.cards.map(c => c.id).filter(id => !snapshot.cards.some(c => c.id === id))]
  return { ...snapshot, ...patch.rest, cards: order.map(id => byId.get(id)!).filter(Boolean) }
}
