// The pets in packs come from codex-pets.net, the community's gallery. Its
// catalogue is read here once a day (it does not let a page ask it directly),
// and each pet gets a category and a rarity. The category and the fame of a
// pet come from pet-classes.ts. Inside each category the pets are ranked by
// fame first, then by how loved they are there (likes and views), and cut
// into shares: the top 3% legendary, the next 10% epic, the next 27% rare.
// Only a famous pet (fame 2 or 3) is legendary: a slot no famous pet fills
// goes to epic. Of the versions of one character, only the best ranks as it
// is: the others come a step down. NSFW pets and the old sheet format never
// come out. A pet that comes out of a pack is downloaded into the data folder
// (never into the repository): a sheet of animations, 8 frames across, a row
// each (idle, running right and left, waving, jumping, failed, waiting,
// running, review), which the page plays as the pet moves.

import { mkdir, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { DATA_DIR } from "./config"
import { readJson, writeJsonAtomic } from "./files"
import { type Category, type Classes, classifyMissing, knownClasses } from "./pet-classes"

const SITE = "https://codex-pets.net"
const DIR = join(DATA_DIR, "pets")
const CATALOG = join(DATA_DIR, "pets-catalog.json")
const MAX_SHEET = 12 * 1024 * 1024
const PAGE = 60 // the most it gives at once
const STALE = 24 * 3600_000

export type Rarity = "common" | "rare" | "epic" | "legendary"
export type Entry = { id: string; name: string; description: string; poster: string; kind: string; tags: string[]; likes: number; views: number; category: string; rarity: Rarity }
export type Adopted = { id: string; name: string; description: string; source: string; cell: [number, number]; atlas: [number, number]; rarity?: Rarity; category?: string }

const safeId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9._-]{1,120}$/.test(id) && !id.startsWith(".")
const sizeOf = (text: unknown, fallback: [number, number]): [number, number] => {
  const m = typeof text === "string" ? text.match(/^(\d+)x(\d+)$/) : null
  return m ? [Number(m[1]), Number(m[2])] : fallback
}

async function ask(path: string) {
  const res = await fetch(`${SITE}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`codex-pets.net answered ${res.status}`)
  return res.json() as Promise<any>
}

// ---------- the catalogue ----------

type Raw = Omit<Entry, "category" | "rarity">

// Until Haiku has read a pet, its category comes from the gallery's kind.
const KINDS: Record<string, Category> = { animal: "Animals", person: "People", creature: "Fantasy", object: "Objects" }
const categoryOf = (p: Raw, classes: Classes): string => classes[p.id]?.category ?? (p.kind === "person" && p.tags.includes("anime") ? "Anime" : KINDS[p.kind] ?? "Objects")

// Haiku names a character a bit differently from pet to pet ("Goku", "Son
// Goku"): two names are one character when the words of one are all in the
// other. Each pet's character, by the name of its best-known version.
function characters(list: Raw[], classes: Classes) {
  const words = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const isIn = (a: string[], b: string[]) => a.every(w => b.includes(w))
  const known: { name: string; words: string[] }[] = []
  const best = [...list].sort((a, b) => (classes[b.id]?.fame ?? 0) - (classes[a.id]?.fame ?? 0) || b.likes - a.likes)
  const of = new Map<string, string>()
  for (const p of best) {
    const w = words(classes[p.id]?.character ?? "")
    if (!w.length) continue
    const same = known.find(k => isIn(w, k.words) || isIn(k.words, w)) ?? known[known.push({ name: p.id, words: w }) - 1]!
    of.set(p.id, same.name)
  }
  return of
}

const SHARES: [Rarity, number][] = [["legendary", 0.03], ["epic", 0.1], ["rare", 0.27]]
const FAMOUS = 2 // the least fame of a legendary

// One category ranked best first: fame, then love (as a share of the
// category, so it never outweighs a step of fame), a repeated character a
// step down.
function ranked(list: Raw[], classes: Classes, characterOf: Map<string, string>) {
  const loved = [...list].sort((a, b) => b.likes + b.views / 200 - (a.likes + a.views / 200) || a.id.localeCompare(b.id))
  const love = new Map(loved.map((p, i) => [p.id, 1 - i / list.length]))
  const seen = new Set<string>()
  const score = new Map<string, number>()
  for (const p of [...list].sort((a, b) => (classes[b.id]?.fame ?? 0) + love.get(b.id)! - (classes[a.id]?.fame ?? 0) - love.get(a.id)!)) {
    const who = characterOf.get(p.id) ?? ""
    score.set(p.id, (classes[p.id]?.fame ?? 0) + love.get(p.id)! - (who && seen.has(who) ? 1 : 0))
    if (who) seen.add(who)
  }
  return list.sort((a, b) => score.get(b.id)! - score.get(a.id)! || a.id.localeCompare(b.id))
}

function rarityAt(at: number, size: number, fame: number): Rarity {
  let cut = 0
  for (const [rarity, share] of SHARES) {
    cut += Math.round(size * share)
    if (at < cut) return rarity === "legendary" && fame < FAMOUS ? "epic" : rarity
  }
  return "common"
}

// Categories and rarities, from what Haiku and the gallery say of each pet.
// The versions of one character go where its best-known version goes.
export function rate(list: Raw[], classes: Classes): Entry[] {
  const characterOf = characters(list, classes)
  const byId = new Map(list.map(p => [p.id, p]))
  const groups = new Map<string, Raw[]>()
  for (const p of list) {
    const category = categoryOf(byId.get(characterOf.get(p.id) ?? p.id)!, classes)
    groups.set(category, [...(groups.get(category) ?? []), p])
  }
  return [...groups].flatMap(([category, pets]) =>
    ranked(pets, classes, characterOf).map((p, at) => ({ ...p, category, rarity: rarityAt(at, pets.length, classes[p.id]?.fame ?? 0) })))
}

let catalog: { at: number; pets: Raw[] } | null = null
let reading: Promise<Raw[]> | null = null
let rated: Entry[] | null = null // the catalogue rated with the classes known: again when either changes

async function readGallery(): Promise<Raw[]> {
  const raw: any[] = []
  for (let page = 1; page < 200; page++) {
    const r = await ask(`/api/pets?page=${page}&pageSize=${PAGE}&sort=new`)
    raw.push(...(r.pets ?? []))
    if (!r.pets?.length || page * PAGE >= Number(r.total ?? 0)) break
    await Bun.sleep(120) // gently
  }
  const seen = new Set<string>()
  return raw
    .filter(p => safeId(p.id) && !seen.has(p.id) && seen.add(p.id))
    .filter(p => Number(p.spriteVersionNumber) === 2 && !(p.tags ?? []).includes("nsfw") && !p.ownerShadowbanned && String(p.spritesheetUrl ?? "").startsWith(`${SITE}/`))
    .map(p => ({
      id: String(p.id), name: String(p.displayName ?? p.id).slice(0, 80), description: String(p.description ?? "").slice(0, 300), poster: String(p.posterUrl ?? ""),
      kind: String(p.kind ?? ""), tags: Array.isArray(p.tags) ? p.tags.map(String) : [], likes: Number(p.likeCount ?? 0), views: Number(p.viewCount ?? 0),
    }))
}

// Haiku reads the pets it has not read yet: when the catalogue is read, and
// once when the server starts. Each batch it reads rates the catalogue again.
const classify = (pets: Raw[]) => void classifyMissing(pets, () => (rated = null))

// The catalogue: the one kept, read again in the background once a day; read
// now when there is none yet.
export async function communityCatalog(): Promise<Entry[]> {
  if (process.env.AGENT_CENTER_PETS_OFFLINE) return [] // the tests: the pets drawn here only
  if (!catalog) {
    catalog = await readJson(CATALOG).catch(() => null)
    if (catalog?.pets.length) classify(catalog.pets)
  }
  const isStale = !catalog || Date.now() - catalog.at > STALE
  if (isStale && !reading)
    reading = readGallery()
      .then(async pets => {
        if (pets.length) {
          catalog = { at: Date.now(), pets }
          rated = null
          await writeJsonAtomic(CATALOG, catalog)
          classify(pets)
        }
        return pets
      })
      .finally(() => (reading = null))
  const pets = catalog?.pets.length ? catalog.pets : ((await reading?.catch(() => [])) ?? [])
  if (!pets.length) return []
  return (rated ??= rate(pets, await knownClasses()))
}

// ---------- the pets brought home ----------

// The pets brought home, with the rarity and category they have now.
export async function adopted(): Promise<Adopted[]> {
  const now = new Map((rated ?? (catalog ? rate(catalog.pets, await knownClasses()) : [])).map(p => [p.id, { rarity: p.rarity, category: p.category }]))
  const out: Adopted[] = []
  for (const id of await readdir(DIR).catch(() => [] as string[])) {
    const meta = await readJson(join(DIR, id, "pet.json")).catch(() => null)
    if (meta && safeId(meta.id)) out.push({ ...meta, ...now.get(meta.id) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const has = (id: string) => stat(join(DIR, id, "spritesheet.webp")).then(() => true, () => false)

// One pet brought home: its details and its sheet of animations (kept if it
// is here already).
export async function bringHome(entry: Entry): Promise<Adopted | null> {
  const known = await readJson(join(DIR, entry.id, "pet.json")).catch(() => null)
  if (known && (await has(entry.id))) return { ...known, rarity: entry.rarity, category: entry.category }
  const { pet } = await ask(`/api/pets/${encodeURIComponent(entry.id)}`).catch(() => ({ pet: null }))
  if (!pet?.spritesheetUrl || !String(pet.spritesheetUrl).startsWith(`${SITE}/`)) return null
  const res = await fetch(pet.spritesheetUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
  const sheet = res?.ok ? await res.arrayBuffer() : null
  if (!sheet || sheet.byteLength > MAX_SHEET) return null
  const report = pet.validationReport ?? {}
  const meta: Adopted = {
    id: entry.id, name: entry.name, description: entry.description, source: `${SITE}/?pet=${encodeURIComponent(entry.id)}`,
    cell: sizeOf(report.cellSize, [192, 208]), atlas: sizeOf(report.atlasSize, [1536, 2288]), rarity: entry.rarity, category: entry.category,
  }
  await mkdir(join(DIR, entry.id), { recursive: true })
  await Bun.write(join(DIR, entry.id, "spritesheet.webp"), sheet)
  await writeJsonAtomic(join(DIR, entry.id, "pet.json"), meta, { pretty: true })
  return meta
}

// The sheet of a pet brought home, for the page.
export function sheetOf(id: string) {
  return safeId(id) ? Bun.file(join(DIR, id, "spritesheet.webp")) : null
}
