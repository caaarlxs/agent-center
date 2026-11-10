import { expect, test } from "bun:test"
import { rate } from "../lib/community-pets"
import { arrive, grow, isXpEvent, newlyMerged, pickFrom, roll, rollRarities, speedUp } from "../lib/pets"
import { XP, levelOf } from "../lib/pet-levels"

const DAY = 24 * 3600_000

const HOUR = 3600_000

test("packs pile up: each one that arrives draws when the next will, 4 to 30 hours on", () => {
  const s = { packs: 0, nextAt: 0 }
  expect(arrive(s, 3 * DAY, () => 0.5)).toBe(5) // at 0, then every 17 hours
  expect(s.packs).toBe(5)
  expect(s.nextAt).toBeGreaterThan(3 * DAY)
  const before = s.nextAt
  expect(arrive(s, before - 1, () => 0.5)).toBe(0)
  expect(s.nextAt).toBe(before) // not drawn again until it comes
  const late = { packs: 0, nextAt: 0 }
  arrive(late, 0, () => 1)
  expect(late.nextAt).toBe(30 * HOUR)
})

test("a pack: three pets, the last rare or better", () => {
  for (let i = 0; i < 200; i++) {
    const pulls = roll(Math.random)
    expect(pulls).toHaveLength(3)
    expect(pulls[2]!.rarity).not.toBe("common")
  }
  expect(roll(() => 0.999).map(p => p.rarity)).toEqual(["legendary", "legendary", "legendary"])
})

test("a pet of a high level on the board brings better pets out of a pack", () => {
  const better = (level: number) => {
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: 3000 }, () => rollRarities(random, level)[0]).filter(r => r !== "common").length
  }
  expect(better(40)).toBeGreaterThan(better(1) * 1.3)
})

test("each PR opened since the pets began counting brings the next pack six hours nearer, once", () => {
  const s = { nextAt: 10 * DAY, prsSince: 5 * DAY, prsSeen: [] as string[], prBoosts: 0 }
  const pr = (url: string, day: number | null) => ({ url, createdAt: day === null ? null : new Date(day * DAY).toISOString() })
  expect(speedUp(s, [pr("old", 4), pr("unknown", null)], 6 * DAY)).toBe(0) // opened before, or when not known
  expect(speedUp(s, [pr("a", 6), pr("b", 6), pr("a", 6)], 6 * DAY)).toBe(2)
  expect(s.nextAt).toBe(10 * DAY - 12 * HOUR)
  expect(s.prBoosts).toBe(2)
  expect(speedUp(s, [pr("a", 6), pr("b", 6)], 6 * DAY)).toBe(0) // counted once
  speedUp(s, Array.from({ length: 20 }, (_, i) => pr(`c${i}`, 7)), 7.5 * DAY)
  expect(s.nextAt).toBe(7.5 * DAY) // never before now: it arrives at once
})

test("codex-pets.net's pets: anime girls are common; the rest as rare as they are loved", () => {
  const pet = (id: string, kind: string, tags: string[], likes: number) => ({ id, name: id, description: "", poster: "", kind, tags, likes, views: 0 })
  const list = [
    pet("frieren", "person", ["anime", "cute"], 999),
    ...Array.from({ length: 100 }, (_, i) => pet(`p${i}`, i % 2 ? "animal" : "creature", [], 100 - i)),
  ]
  const rated = new Map(rate(list).map(p => [p.id, p]))
  expect(rated.get("frieren")).toMatchObject({ rarity: "common", category: "Anime" })
  expect(rated.get("p0")).toMatchObject({ rarity: "legendary", category: "Creature" })
  expect(rated.get("p3")!.rarity).toBe("legendary")
  expect(rated.get("p4")!.rarity).toBe("epic")
  expect(rated.get("p20")!.rarity).toBe("rare")
  expect(rated.get("p60")!.rarity).toBe("common")
  expect(pickFrom([...rated.values()], "legendary", () => 0)!.rarity).toBe("legendary")
  expect(pickFrom([rated.get("p60")!], "epic", () => 0)!.id).toBe("p60") // the next one down when none
})

test("a merged PR counts once, only one the pets saw open", () => {
  const s = { wasOpen: [] as string[], mergedSeen: [] as string[] }
  const pr = (url: string, isMerged: boolean) => ({ url, createdAt: null, isMerged })
  expect(newlyMerged(s, [pr("old", true), pr("m", false)])).toBe(0) // merged before: never
  expect(newlyMerged(s, [pr("old", true), pr("m", true)])).toBe(1)
  expect(newlyMerged(s, [pr("m", true)])).toBe(0) // once
  expect(newlyMerged(s, null)).toBe(0)
})

test("the pets out grow; the one a page names, alone; each 20th level brings a pack", () => {
  const s = { xp: {} as Record<string, number>, packs: 0, active: "a", buddy: "b" }
  grow(s, "turn", "ok")
  expect(s.xp).toEqual({ a: XP.turn, b: XP.turn })
  grow(s, "focusTurn", "well", "b")
  expect(s.xp.b).toBe(XP.turn + 30)
  expect(grow(s, "fed", "ok", "away")).toBe(false) // not out: nothing
  s.xp.a = 0
  for (let i = 0; i < 100; i++) grow(s, "prMerged", "ok", "a")
  expect(s.packs).toBe(Math.floor(levelOf(s.xp.a!).level / 20))
})

test("a page's events: known kinds only, never the PRs the server counts itself", () => {
  expect(isXpEvent({ key: "turn:x:1", kind: "turn" })).toBe(true)
  expect(isXpEvent({ key: "k", kind: "fed", pet: "a", condition: "well" })).toBe(true)
  expect(isXpEvent({ key: "k", kind: "prMerged" })).toBe(false)
  expect(isXpEvent({ key: "k", kind: "magic" })).toBe(false)
  expect(isXpEvent({ key: "k", kind: "fed", condition: "great" })).toBe(false)
})
