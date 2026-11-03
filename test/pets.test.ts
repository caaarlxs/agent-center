import { expect, test } from "bun:test"
import { rate } from "../lib/community-pets"
import { arrive, pickFrom, roll, speedUp } from "../lib/pets"

const DAY = 24 * 3600_000

test("packs pile up: each one that arrives draws when the next will, within two weeks", () => {
  const s = { packs: 0, nextAt: 0 }
  expect(arrive(s, 30 * DAY, () => 0.5)).toBe(5) // at 0, then every ~7 days
  expect(s.packs).toBe(5)
  expect(s.nextAt).toBeGreaterThan(30 * DAY)
  const before = s.nextAt
  expect(arrive(s, before - 1, () => 0.5)).toBe(0)
  expect(s.nextAt).toBe(before) // not drawn again until it comes
  const late = { packs: 0, nextAt: 0 }
  arrive(late, 0, () => 1)
  expect(late.nextAt).toBe(14 * DAY)
})

test("a pack: three pets, the last rare or better", () => {
  for (let i = 0; i < 200; i++) {
    const pulls = roll(Math.random)
    expect(pulls).toHaveLength(3)
    expect(pulls[2]!.rarity).not.toBe("common")
  }
  expect(roll(() => 0.999).map(p => p.rarity)).toEqual(["legendary", "legendary", "legendary"])
})

test("each PR opened since the pets began counting brings the next pack a day nearer, once", () => {
  const s = { nextAt: 10 * DAY, prsSince: 5 * DAY, prsSeen: [] as string[], prBoosts: 0 }
  const pr = (url: string, day: number | null) => ({ url, createdAt: day === null ? null : new Date(day * DAY).toISOString() })
  expect(speedUp(s, [pr("old", 4), pr("unknown", null)], 6 * DAY)).toBe(false) // opened before, or when not known
  expect(speedUp(s, [pr("a", 6), pr("b", 6), pr("a", 6)], 6 * DAY)).toBe(true)
  expect(s.nextAt).toBe(8 * DAY)
  expect(s.prBoosts).toBe(2)
  expect(speedUp(s, [pr("a", 6), pr("b", 6)], 6 * DAY)).toBe(false) // counted once
  speedUp(s, ["c", "d", "e", "f"].map(u => pr(u, 7)), 7.5 * DAY)
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
