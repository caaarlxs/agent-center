// What the pets notice on the board. Pure: tested on its own.

type Seen = { id: string; column: string; waitingSince?: number | null }

const ORDER = ["asking", "review", "pending"]

/** The session that waits for you first: one asking (the longest first), then one to review, then one pending. */
export function nextWaiting<T extends Seen>(cards: readonly T[]): T | null {
  const waiting = cards.filter(c => ORDER.includes(c.column))
  waiting.sort((a, b) => ORDER.indexOf(a.column) - ORDER.indexOf(b.column) || (a.waitingSince ?? Infinity) - (b.waitingSince ?? Infinity))
  return waiting[0] ?? null
}

/** The sessions that finished a turn since `before`: working then, not now. */
export const turnsEnded = (before: ReadonlyMap<string, string>, cards: readonly Seen[]) =>
  cards.filter(c => before.get(c.id) === "working" && c.column !== "working").map(c => c.id)
