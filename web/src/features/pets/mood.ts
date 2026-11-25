// What a pet does on its own, read from the board: how much energy it has
// (what is left of your 5-hour limit), when it rests (at night, at the
// weekend, out of tokens), and which session it keeps company. Nothing to
// look after: it shows how your work goes. Pure, for PetLayer.
import type { Card, Snapshot } from "@/lib/api-types"

type Limits = Snapshot["limits"]
export type Rest = "night" | "weekend" | "spent" | null
export type Post = { cardId: string; kind: "asking" | "working" } | null

const NIGHT_FROM = 22
const NIGHT_TO = 7

/** What is left of the 5-hour limit, 0 to 100; full when the board knows none, or once it reset. */
export function energyOf(limits: Limits | null | undefined, now: number) {
  const w = limits?.windows.find(w => w.kind === "five_hour")
  if (!w) return 100
  if (w.resetsAt && Date.parse(w.resetsAt) <= now) return 100
  return Math.round(Math.max(0, Math.min(100, 100 - w.percentUsed)))
}

/** Why it sleeps now, if it does. */
export function restOf(energy: number, date: Date): Rest {
  const day = date.getDay()
  if (day === 0 || day === 6) return "weekend"
  const hour = date.getHours()
  if (hour >= NIGHT_FROM || hour < NIGHT_TO) return "night"
  return energy <= 0 ? "spent" : null
}

/** Where each pet goes: a session that asks you first, then the newest working; one each, the rest free. */
export function postsOf(cards: Pick<Card, "id" | "column" | "updatedAt">[], pets: string[]): Map<string, Post> {
  const asking = cards.filter(c => c.column === "asking").map(c => ({ cardId: c.id, kind: "asking" as const, at: c.updatedAt }))
  const working = cards.filter(c => c.column === "working").map(c => ({ cardId: c.id, kind: "working" as const, at: c.updatedAt }))
  const queue = [...asking.sort((a, b) => b.at - a.at), ...working.sort((a, b) => b.at - a.at)]
  return new Map(pets.map((pet, i) => {
    const post = queue[i]
    return [pet, post ? { cardId: post.cardId, kind: post.kind } : null]
  }))
}

/** No session works or asks: time to play. */
export const isQuiet = (cards: Pick<Card, "column">[]) => !cards.some(c => c.column === "working" || c.column === "asking")
