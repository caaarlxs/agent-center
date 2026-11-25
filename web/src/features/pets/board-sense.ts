// What the pets notice on the board. Pure: tested on its own.

type Seen = { id: string; column: string }

/** The sessions that finished a turn since `before`: working then, not now. */
export const turnsEnded = (before: ReadonlyMap<string, string>, cards: readonly Seen[]) =>
  cards.filter(c => before.get(c.id) === "working" && c.column !== "working").map(c => c.id)
