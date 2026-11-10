// How a pet grows: the XP each thing it does with you is worth, its level,
// its stage and the luck it brings to packs. A level needs a little more than the one before (50, 75, 100…),
// so the first come within a day of work and the last take weeks; a stage
// changes how it looks on the board; every 20th level brings a pack. Pure,
// and shared with the page (web/src/features/pets).

export const MAX_LEVEL = 60

// What each thing is worth. turn: a session finished a turn while the pet
// was out; focusTurn: one more for the pet working with that session.
export const XP = {
  turn: 8, focusTurn: 20, prOpened: 60, prMerged: 120, focusDone: 40, fed: 4, petted: 2, fetched: 3, delivered: 6,
} as const
export type XpKind = keyof typeof XP
export const isXpKind = (v: unknown): v is XpKind => typeof v === "string" && Object.hasOwn(XP, v)

// A pet fed and rested earns half as much again; a hungry or tired one, half.
export type Condition = "well" | "ok" | "poorly"
const BY: Record<Condition, number> = { well: 1.5, ok: 1, poorly: 0.5 }
export const award = (kind: XpKind, condition: Condition) => Math.round(XP[kind] * BY[condition])

export type Stage = "baby" | "young" | "grown" | "elite" | "legend" | "mythic"
export const STAGES: { stage: Stage; from: number; name: string }[] = [
  { stage: "baby", from: 1, name: "Baby" },
  { stage: "young", from: 5, name: "Young" },
  { stage: "grown", from: 10, name: "Grown" },
  { stage: "elite", from: 20, name: "Elite" },
  { stage: "legend", from: 35, name: "Legend" },
  { stage: "mythic", from: 50, name: "Mythic" },
]
export const stageOf = (level: number) => [...STAGES].reverse().find(s => level >= s.from)!

const needFor = (level: number) => 50 + 25 * (level - 1) // from this level to the next

/** Where a pet with this XP stands: its level, the XP into it and needed for the next, its stage. */
export function levelOf(xp: number) {
  let level = 1
  let left = Math.max(0, xp)
  while (level < MAX_LEVEL && left >= needFor(level)) {
    left -= needFor(level)
    level++
  }
  const top = level === MAX_LEVEL
  return { level, into: top ? 0 : left, need: top ? 0 : needFor(level), stage: stageOf(level).stage }
}

/** The packs a pet earns going from one level to another: one for every 20th. */
export const PACK_EVERY = 20
export const packsBetween = (from: number, to: number) => Math.floor(to / PACK_EVERY) - Math.floor(from / PACK_EVERY)

// Luck: the higher the level of the pet on the board, the likelier the
// better pets come out of a pack. Common stays as it is; rare gains a little,
// epic and legendary more (at level 20 twice as likely, at 60 four times).
type Odds = { common: number; rare: number; epic: number; legendary: number }
export function luckyOdds<T extends Odds>(odds: T, level: number): T {
  const up = (level - 1) / 20
  return { ...odds, rare: odds.rare * (1 + up / 2), epic: odds.epic * (1 + up), legendary: odds.legendary * (1 + up) }
}

/** The chance of rare or better in a slot with those odds, at that level. */
export function betterChance(odds: Odds, level: number) {
  const o = luckyOdds(odds, level)
  return (o.rare + o.epic + o.legendary) / (o.common + o.rare + o.epic + o.legendary)
}
