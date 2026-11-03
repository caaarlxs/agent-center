// Pets: a little creature that walks about the board. They come only out of
// packs, and packs come by chance: the first is there from the start; each
// one, when it arrives, draws when the next will (any time in the next two
// weeks), so nobody knows, the page included (it is never told), and packs
// left closed pile up. A pack holds three pets, the last of them rare or
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

const PATH = join(DATA_DIR, "pets.json")
const HOUR = 3600_000
const MIN_WAIT = 2 * HOUR
const MAX_WAIT = 14 * 24 * HOUR
const PER_PACK = 3
const PR_BOOST = 24 * HOUR
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

// How often each rarity comes out of a slot; the last slot of a pack skips common.
const ODDS: Record<Rarity, number> = { common: 64, rare: 25, epic: 9, legendary: 2 }
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
          packs: saved.packs ?? 0, nextAt: saved.nextAt, owned: saved.owned ?? {}, active: saved.active ?? null, opened: saved.opened ?? 0,
          prsSince: saved.prsSince ?? now, prsSeen: saved.prsSeen ?? [], prBoosts: saved.prBoosts ?? 0,
        }
      : { packs: 1, nextAt: now + wait(Math.random), owned: {}, active: null, opened: 0, prsSince: now, prsSeen: [], prBoosts: 0 } // the first, from the start
    if (!saved || saved.prsSince === undefined) await save()
  }
  const sped = speedUp(state, await prUrls(), now)
  if (arrive(state, now, Math.random) || sped) await save()
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
type Opened = { url: string; createdAt?: string | null }
async function prUrls(): Promise<Opened[] | null> {
  const snap = await latestState().catch(() => null)
  return snap ? snap.cards.flatMap(c => [...(c.prs ?? []), ...(c.mergedPrs ?? [])]) : null
}

// Each PR opened since the pets began counting, not counted before, takes a
// day off the wait (never past now); answers whether anything changed.
export function speedUp(s: Pick<State, "nextAt" | "prsSince" | "prsSeen" | "prBoosts">, prs: Opened[] | null, now: number) {
  const fresh = [...new Set((prs ?? []).filter(p => p.createdAt && Date.parse(p.createdAt) > s.prsSince && !s.prsSeen.includes(p.url)).map(p => p.url))]
  if (!fresh.length) return false
  s.prsSeen = [...s.prsSeen, ...fresh].slice(-PRS_KEPT)
  s.prBoosts += fresh.length
  s.nextAt = Math.max(now, s.nextAt - fresh.length * PR_BOOST)
  return true
}

function pick<T extends string>(odds: Record<T, number>, random: () => number): T {
  const entries = Object.entries(odds) as [T, number][]
  let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0)
  for (const [key, w] of entries) if ((roll -= w) < 0) return key
  return entries.at(-1)![0]
}

// The rarities of one pack.
export const rollRarities = (random: () => number): Rarity[] => Array.from({ length: PER_PACK }, (_, i) => pick(i === PER_PACK - 1 ? LAST_ODDS : ODDS, random))

// The pets of one pack, drawn here.
export function roll(random: () => number): { id: string; rarity: Rarity }[] {
  return rollRarities(random).map(rarity => {
    const skins = SKINS.filter(k => k.rarity === rarity)
    const skin = skins[Math.floor(random() * skins.length)]!
    const species = SPECIES[Math.floor(random() * SPECIES.length)]!
    return { id: petId(species, skin.key), rarity }
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

// Each pet of a pack from codex-pets.net, brought home; a pet whose files do
// not come is swapped for another of its rarity. Null when none can be had.
async function communityPack(): Promise<Pull[] | null> {
  const catalog = await communityCatalog()
  if (!catalog.length) return null
  const pulls: Pull[] = []
  const tried = new Set<string>()
  for (const rarity of rollRarities(Math.random)) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const entry = pickFrom(catalog, rarity, Math.random, tried)
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
const shown = (s: State) => ({ packs: s.packs, owned: s.owned, active: s.active, opened: s.opened, prBoosts: s.prBoosts })

const COMMUNITY = "community:"

export async function petsState() {
  void communityCatalog().catch(() => {}) // read ahead, so the first pack opens at once
  return { ...shown(await load()), species: SPECIES, skins: SKINS, perPack: PER_PACK, community: await adopted() }
}

// The catalogue for the collection: every pet a pack can hold.
export async function petsCatalog() {
  return (await communityCatalog()).map(({ id, name, poster, category, rarity }) => ({ id: `${COMMUNITY}${id}`, name, poster, category, rarity }))
}

export async function openPack() {
  const s = await load()
  if (s.packs < 1) return "No pack to open"
  const drawn = (await communityPack().catch(() => null)) ?? roll(Math.random).map(p => ({ ...p, isNew: false }))
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

export async function choosePet(id: unknown) {
  const s = await load()
  if (id !== null && !(typeof id === "string" && s.owned[id])) return "You do not have that pet"
  s.active = id
  await save()
  return shown(s)
}
