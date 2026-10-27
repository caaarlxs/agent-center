// What the page just did to a session, shown at once: a patch over the
// server's card that stands until the server agrees, or 6 seconds pass
// (main.js OPTIMISTIC). Pure: tested on its own.
import type { Card } from "@/lib/api-types"

export const OVERRIDE_MS = 6000

export type Patch = Partial<Pick<Card, "column" | "pinned" | "isUnread" | "title" | "color" | "tier" | "parkedUntil">>
export type Overrides = Record<string, Patch & { at: number }>

// The patch an action makes, or null (it changes nothing the card shows).
export function patchOf(action: string, payload: Record<string, unknown> = {}): Patch | null {
  switch (action) {
    case "pin": return { pinned: true }
    case "unpin": return { pinned: false }
    case "park": return { column: "parked", parkedUntil: (payload.until as number | null) ?? null }
    case "done": return { column: "done", pinned: false }
    case "archive": return { column: "archived", pinned: false }
    case "unseen": return { column: "review", isUnread: true }
    case "seen": return { isUnread: false }
    case "color": return { color: (payload.color as string) || null }
    case "tier": return { tier: (payload.tier as string) || "other" }
    default: return null
  }
}

// The overrides still standing once the server sent `cards`: the same
// object when none ended, so nothing redraws for nothing.
export function settle(overrides: Overrides, cards: Card[], now: number): Overrides {
  let changed = false
  const left: Overrides = {}
  for (const [id, ov] of Object.entries(overrides)) {
    const card = cards.find(c => c.id === id)
    const agrees = !!card && (Object.keys(ov) as (keyof typeof ov)[]).every(k => k === "at" || card[k as keyof Card] === ov[k])
    if (!agrees && now - ov.at < OVERRIDE_MS) left[id] = ov
    else changed = true
  }
  return changed ? left : overrides
}

// The cards as the page shows them: with their patches, without the archived.
export function withOverrides(cards: Card[], overrides: Overrides): Card[] {
  return cards
    .map(c => {
      if (!overrides[c.id]) return c
      const { at: _, ...patch } = overrides[c.id]
      return { ...c, ...patch } as Card
    })
    .filter(c => c.column !== "archived")
}
