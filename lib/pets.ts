// Pets: a little creature that walks about the board (two at once at most).
// They come only out of packs, and packs come by chance: the first is there
// from the start; each one, when it arrives, draws when the next will (some
// time between 4 and 30 hours on), so nobody knows, the page included (it is
// never told), and packs left closed pile up. A pet out on the board grows
// with your work (lib/pet-levels.ts): every 20th level it reaches brings a
// pack too. A pack holds three pets, the last of them rare or
// better: pets of codex-pets.net, rated by community-pets.ts. Each PR a
// session opens brings the next pack a day nearer: counted once, and only
// one opened after the pets began counting. The pets drawn here (a species
// in a skin) came out of the first packs; they stay yours, and come out
// again only when codex-pets.net cannot be reached.

import { join } from "node:path"
import { DATA_DIR } from "./config"
import { readJson, writeJsonAtomic } from "./files"
import { latestState } from "./live"
import { adopted, bringHome, communityCatalog, type Entry } from "./community-pets"
import { type Condition, type XpKind, award, isXpKind, levelOf, luckyOdds, packsBetween } from "./pet-levels"

const PATH = join(DATA_DIR, "pets.json")
const HOUR = 3600_000
const MIN_WAIT = 4 * HOUR
const MAX_WAIT = 30 * HOUR
const PER_PACK = 3
const PR_BOOST = 6 * HOUR
const XP_KEYS_KEPT = 3000
const PRS_KEPT = 1000

export const SPECIES = [
  "cat", "dog", "fox", "bunny", "frog", "owl", "penguin", "axolotl",
  "panda", "bear", "duck", "slime", "ghost", "robot", "dragon", "octopus",
  "unicorn", "capybara", "hamster", "shark", "dino", "phoenix",
  "mushroom", "alien", "astronaut", "wizard", "ninja", "pirate",
] as const
export type Species = (typeof SPECIES)[number]

export const RARITIES = ["common", "rare", "epic", "legendary"] as const
export type Rarity = (typeof RARITIES)[number]

export const SKINS: { key: string; rarity: Rarity }[] = [
  { key: "classic", rarity: "common" }, { key: "snow", rarity: "common" }, { key: "cocoa", rarity: "common" },
  { key: "mint", rarity: "rare" }, { key: "sakura", rarity: "rare" }, { key: "ocean", rarity: "rare" },
  { key: "neon", rarity: "epic" }, { key: "shadow", rarity: "epic" }, { key: "lava", rarity: "epic" },
  { key: "gold", rarity: "legendary" }, { key: "galaxy", rarity: "legendary" }, { key: "holo", rarity: "legendary" },
]

// How often each rarity comes out of a slot; the last slot of a pack skips
// common. The level of the pets on the board (the higher) makes the better ones likelier
// (luckyOdds, lib/pet-levels.ts).
export const ODDS: Record<Rarity, number> = { common: 64, rare: 25, epic: 9, legendary: 2 }
const LAST_ODDS: Record<Rarity, number> = { common: 0, rare: 70, epic: 24, legendary: 6 }

export const petId = (species: string, skin: string) => `${species}:${skin}`
const ALL = SPECIES.flatMap(s => SKINS.map(k => petId(s, k.key)))
export const isPet = (v: unknown): v is string => typeof v === "string" && ALL.includes(v)
export const rarityOf = (id: string): Rarity => SKINS.find(k => k.key === id.split(":")[1])?.rarity ?? "common"

type State = {
  packs: number // closed, waiting to be opened
  nextAt: number // when the next one arrives: drawn when the last one did, never shown
  owned: Record<string, number> // pet id → how many came out
  active: string | null // the one on the board
  buddy: string | null // a second one with it
  xp: Record<string, number> // pet id → all it has earned
  xpSeen: string[] // the events already counted (a page sends each once, two pages too)
  wasOpen: string[] // PRs the pets saw open: only their merge counts
  mergedSeen: string[] // PRs whose merge already counted
  opened: number
  prsSince: number // PRs opened before this do not count
  prsSeen: string[] // the ones that counted
  prBoosts: number // how many
}

export type Pull = { id: string; rarity: Rarity; isNew: boolean; name?: string; category?: string }

const wait = (random: () => number) => MIN_WAIT + random() * (MAX_WAIT - MIN_WAIT)

let state: State | null = null
let saving: Promise<void> = Promise.resolve()

async function load(now = Date.now()): Promise<State> {
  if (!state) {
    const saved = (await readJson(PATH).catch(() => null)) as Partial<State> | null
    state = saved && typeof saved.nextAt === "number"
      ? {
          packs: saved.packs ?? 0, owned: saved.owned ?? {}, active: saved.active ?? null, opened: saved.opened ?? 0,
          prsSince: saved.prsSince ?? now, prsSeen: saved.prsSeen ?? [], prBoosts: saved.prBoosts ?? 0,
          buddy: saved.buddy ?? null, xp: saved.xp ?? {}, xpSeen: saved.xpSeen ?? [], wasOpen: saved.wasOpen ?? [], mergedSeen: saved.mergedSeen ?? [],
          // A wait drawn when packs came up to two weeks apart: no longer than one is now.
          nextAt: Math.min(saved.nextAt, now + MAX_WAIT),
        }
      : { packs: 1, nextAt: now + wait(Math.random), owned: {}, active: null, buddy: null, opened: 0, prsSince: now, prsSeen: [], prBoosts: 0, xp: {}, xpSeen: [], wasOpen: [], mergedSeen: [] } // the first, from the start
    if (!saved || saved.prsSince === undefined) await save()
  }
  const prs = await prUrls()
  const opened = speedUp(state, prs, now)
  const merged = newlyMerged(state, prs)
  for (let i = 0; i < opened; i++) grow(state, "prOpened", "ok")
  for (let i = 0; i < merged; i++) grow(state, "prMerged", "ok")
  if (arrive(state, now, Math.random) || opened || merged) await save()
  return state
}

const save = () => (saving = saving.then(() => writeJsonAtomic(PATH, state, { pretty: true })))

// The packs whose time has come, each drawing the time of the next from its own.
export function arrive(s: Pick<State, "packs" | "nextAt">, now: number, random: () => number) {
  let came = 0
  while (s.nextAt <= now) {
    s.packs++
    came++
    s.nextAt += wait(random)
  }
  return came
}

// Every PR the board knows of, open or merged, with when it was opened.
type Opened = { url: string; createdAt?: string | null; isMerged?: boolean }
async function prUrls(): Promise<Opened[] | null> {
  const snap = await latestState().catch(() => null)
  return snap ? snap.cards.flatMap(c => [...(c.prs ?? []), ...(c.mergedPrs ?? []).map(p => ({ ...p, isMerged: true }))]) : null
}

// The PRs merged since last time, each counted once: how many. Only a PR
// the pets saw open counts, so one merged before (or while the board was
// still reading its PRs) never does.
export function newlyMerged(s: Pick<State, "wasOpen" | "mergedSeen">, prs: Opened[] | null) {
  const list = prs ?? []
  const open = list.filter(p => !p.isMerged && !s.wasOpen.includes(p.url)).map(p => p.url)
  if (open.length) s.wasOpen = [...s.wasOpen, ...new Set(open)].slice(-PRS_KEPT)
  const fresh = [...new Set(list.filter(p => p.isMerged && s.wasOpen.includes(p.url) && !s.mergedSeen.includes(p.url)).map(p => p.url))]
  if (fresh.length) s.mergedSeen = [...s.mergedSeen, ...fresh].slice(-PRS_KEPT)
  return fresh.length
}

// XP for the pets out on the board (the one a page names, if it is out), and
// a pack for each 20th level one of them reaches.
export function grow(s: Pick<State, "xp" | "packs" | "active" | "buddy">, kind: XpKind, condition: Condition, only?: string) {
  const out = [s.active, s.buddy].filter((p): p is string => !!p && (!only || p === only))
  for (const pet of out) {
    const before = levelOf(s.xp[pet] ?? 0).level
    s.xp[pet] = (s.xp[pet] ?? 0) + award(kind, condition)
    s.packs += packsBetween(before, levelOf(s.xp[pet]!).level)
  }
  return out.length > 0
}

// Each PR opened since the pets began counting, not counted before, takes six
// hours off the wait (never past now); answers how many there were.
export function speedUp(s: Pick<State, "nextAt" | "prsSince" | "prsSeen" | "prBoosts">, prs: Opened[] | null, now: number) {
  const fresh = [...new Set((prs ?? []).filter(p => p.createdAt && Date.parse(p.createdAt) > s.prsSince && !s.prsSeen.includes(p.url)).map(p => p.url))]
  if (!fresh.length) return 0
  s.prsSeen = [...s.prsSeen, ...fresh].slice(-PRS_KEPT)
  s.prBoosts += fresh.length
  s.nextAt = Math.max(now, s.nextAt - fresh.length * PR_BOOST)
  return fresh.length
}

function pick<T extends string>(odds: Record<T, number>, random: () => number): T {
  const entries = Object.entries(odds) as [T, number][]
  let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0)
  for (const [key, w] of entries) if ((roll -= w) < 0) return key
  return entries.at(-1)![0]
}

// The rarities of one pack.
export const rollRarities = (random: () => number, level = 1): Rarity[] =>
  Array.from({ length: PER_PACK }, (_, i) => pick(luckyOdds(i === PER_PACK - 1 ? LAST_ODDS : ODDS, level), random))

// The pets of one pack, drawn here: none you have (nor twice in it) while
// there are others of that rarity to draw.
export function roll(random: () => number, level = 1, owned: Record<string, number> = {}): { id: string; rarity: Rarity }[] {
  const taken = new Set(Object.keys(owned).filter(id => owned[id]))
  return rollRarities(random, level).map(rarity => {
    const skins = SKINS.filter(k => k.rarity === rarity)
    let id = ""
    for (let attempt = 0; attempt < 40 && (!id || taken.has(id)); attempt++)
      id = petId(SPECIES[Math.floor(random() * SPECIES.length)]!, skins[Math.floor(random() * skins.length)]!.key)
    taken.add(id)
    return { id, rarity }
  })
}

// A pet of the catalogue in that rarity (the next one down when it has none).
export function pickFrom(catalog: Entry[], rarity: Rarity, random: () => number, skip: Set<string> = new Set()) {
  for (let r = RARITIES.indexOf(rarity); r >= 0; r--) {
    const pool = catalog.filter(p => p.rarity === RARITIES[r] && !skip.has(p.id))
    if (pool.length) return pool[Math.floor(random() * pool.length)]!
  }
  return null
}

// A pet of the catalogue you do not have yet (nor tried): of that rarity, or
// the nearest that still has one, higher first; only when you have them all,
// one again.
export function pickNew(catalog: Entry[], rarity: Rarity, random: () => number, have: Set<string>, tried: Set<string> = new Set()) {
  const skip = new Set([...have, ...tried])
  const at = RARITIES.indexOf(rarity)
  const order = [at, ...RARITIES.map((_, r) => r).filter(r => r > at), ...RARITIES.map((_, r) => r).filter(r => r < at).reverse()]
  for (const r of order) {
    const pool = catalog.filter(p => p.rarity === RARITIES[r] && !skip.has(p.id))
    if (pool.length) return pool[Math.floor(random() * pool.length)]!
  }
  return pickFrom(catalog, rarity, random, tried)
}

// Each pet of a pack from codex-pets.net, brought home; a pet whose files do
// not come is swapped for another of its rarity. Null when none can be had.
async function communityPack(level: number, owned: Record<string, number>): Promise<Pull[] | null> {
  const catalog = await communityCatalog()
  if (!catalog.length) return null
  const pulls: Pull[] = []
  const tried = new Set<string>()
  const have = new Set(Object.keys(owned).filter(id => owned[id] && id.startsWith(COMMUNITY)).map(id => id.slice(COMMUNITY.length)))
  for (const rarity of rollRarities(Math.random, level)) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const entry = pickNew(catalog, rarity, Math.random, have, tried)
      if (!entry) return null
      tried.add(entry.id)
      const home = await bringHome(entry)
      if (home) {
        pulls.push({ id: `${COMMUNITY}${entry.id}`, rarity: entry.rarity, isNew: false, name: entry.name, category: entry.category })
        break
      }
    }
  }
  return pulls.length === PER_PACK ? pulls : null
}

// What the page sees: never when the next pack comes.
const shown = (s: State) => ({ packs: s.packs, owned: s.owned, active: s.active, buddy: s.buddy, xp: s.xp, opened: s.opened, prBoosts: s.prBoosts })

const COMMUNITY = "community:"

export async function petsState() {
  void communityCatalog().catch(() => {}) // read ahead, so the first pack opens at once
  return { ...shown(await load()), species: SPECIES, skins: SKINS, perPack: PER_PACK, odds: ODDS, community: await adopted() }
}

// The catalogue for the collection: every pet a pack can hold.
export async function petsCatalog() {
  return (await communityCatalog()).map(({ id, name, poster, category, rarity }) => ({ id: `${COMMUNITY}${id}`, name, poster, category, rarity }))
}

export async function openPack() {
  const s = await load()
  if (s.packs < 1) return "No pack to open"
  const luck = Math.max(1, ...[s.active, s.buddy].map(p => (p ? levelOf(s.xp[p] ?? 0).level : 1))) // the pets out bring their luck, the higher
  const drawn = (await communityPack(luck, s.owned).catch(() => null)) ?? roll(Math.random, luck, s.owned).map(p => ({ ...p, isNew: false }))
  s.packs--
  s.opened++
  const pulls: Pull[] = drawn.map(p => {
    const isNew = !s.owned[p.id]
    s.owned[p.id] = (s.owned[p.id] ?? 0) + 1
    return { ...p, isNew }
  })
  s.active ??= pulls.find(p => p.rarity !== "common")?.id ?? pulls[0]!.id // the first pets walk out at once
  await save()
  return { pulls, ...shown(s), community: await adopted() }
}

// The pet out on the board, or (slot "buddy") the one with it; one pet is never both.
export async function choosePet(id: unknown, slot: unknown = "active") {
  const s = await load()
  if (id !== null && !(typeof id === "string" && s.owned[id])) return "You do not have that pet"
  if (slot === "buddy") {
    if (id !== null && id === s.active) return "That pet is already out"
    s.buddy = id
  } else {
    s.active = id
    if (id !== null && id === s.buddy) s.buddy = null
    if (id === null && s.buddy) [s.active, s.buddy] = [s.buddy, null] // the buddy stays out alone
  }
  await save()
  return shown(s)
}

// What the pets did with you, as a page saw it: each event once (by its
// key), worth what its kind is worth here (lib/pet-levels.ts).
export type XpEvent = { key: string; kind: XpKind; pet?: string; condition?: Condition }
const CONDITIONS = new Set(["well", "ok", "poorly"])
export const isXpEvent = (v: any): v is XpEvent =>
  !!v && typeof v.key === "string" && v.key.length <= 200 && isXpKind(v.kind) && !["prOpened", "prMerged"].includes(v.kind)
  && (v.pet === undefined || typeof v.pet === "string") && (v.condition === undefined || CONDITIONS.has(v.condition))

export async function gainXp(events: unknown) {
  if (!Array.isArray(events) || events.length > 50 || !events.every(isXpEvent)) return "Not a list of pet events"
  const s = await load()
  const seen = new Set(s.xpSeen)
  let changed = false
  for (const e of events) {
    if (seen.has(e.key)) continue
    seen.add(e.key)
    s.xpSeen.push(e.key)
    changed = grow(s, e.kind, e.condition ?? "ok", e.pet) || changed
  }
  s.xpSeen = s.xpSeen.slice(-XP_KEYS_KEPT)
  if (changed) await save()
  return shown(s)
}
