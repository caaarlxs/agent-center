// The pets in packs come from codex-pets.net, the community's gallery. Its
// catalogue is read here once a day (it does not let a page ask it directly),
// and each pet gets a category and a rarity: anime girls (a person tagged
// anime) are common, whatever their likes; every other pet is as rare as it
// is loved there (the 4% most liked are legendary, the next 10% epic, the
// next 26% rare). NSFW pets and the old sheet format never come out. A pet
// that comes out of a pack is downloaded into the data folder (never into
// the repository): a sheet of animations, 8 frames across, a row each (idle,
// running right and left, waving, jumping, failed, waiting, running, review),
// which the page plays as the pet moves.

import { mkdir, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { DATA_DIR } from "./config"
import { readJson, writeJsonAtomic } from "./files"

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

const KINDS: Record<string, string> = { animal: "Animal", person: "Person", creature: "Creature", object: "Object" }
export const isAnimeGirl = (p: { kind: string; tags: string[] }) => p.kind === "person" && p.tags.includes("anime")

// Categories and rarities, from what the gallery says of each pet.
export function rate(list: Omit<Entry, "category" | "rarity">[]): Entry[] {
  const loved = list.filter(p => !isAnimeGirl(p)).sort((a, b) => b.likes - a.likes || b.views - a.views || a.id.localeCompare(b.id))
  const place = new Map(loved.map((p, i) => [p.id, i / Math.max(1, loved.length)]))
  return list.map(p => {
    const at = place.get(p.id)
    const rarity: Rarity = at === undefined ? "common" : at < 0.04 ? "legendary" : at < 0.14 ? "epic" : at < 0.4 ? "rare" : "common"
    return { ...p, category: isAnimeGirl(p) ? "Anime" : KINDS[p.kind] ?? "Other", rarity }
  })
}

let catalog: { at: number; pets: Entry[] } | null = null
let reading: Promise<Entry[]> | null = null

async function readGallery(): Promise<Entry[]> {
  const raw: any[] = []
  for (let page = 1; page < 200; page++) {
    const r = await ask(`/api/pets?page=${page}&pageSize=${PAGE}&sort=new`)
    raw.push(...(r.pets ?? []))
    if (!r.pets?.length || page * PAGE >= Number(r.total ?? 0)) break
    await Bun.sleep(120) // gently
  }
  const seen = new Set<string>()
  const pets = raw
    .filter(p => safeId(p.id) && !seen.has(p.id) && seen.add(p.id))
    .filter(p => Number(p.spriteVersionNumber) === 2 && !(p.tags ?? []).includes("nsfw") && !p.ownerShadowbanned && String(p.spritesheetUrl ?? "").startsWith(`${SITE}/`))
    .map(p => ({
      id: String(p.id), name: String(p.displayName ?? p.id).slice(0, 80), description: String(p.description ?? "").slice(0, 300), poster: String(p.posterUrl ?? ""),
      kind: String(p.kind ?? ""), tags: Array.isArray(p.tags) ? p.tags.map(String) : [], likes: Number(p.likeCount ?? 0), views: Number(p.viewCount ?? 0),
    }))
  return rate(pets)
}

// The catalogue: the one kept, read again in the background once a day; read
// now when there is none yet.
export async function communityCatalog(): Promise<Entry[]> {
  if (process.env.AGENT_CENTER_PETS_OFFLINE) return [] // the tests: the pets drawn here only
  catalog ??= await readJson(CATALOG).catch(() => null)
  const isStale = !catalog || Date.now() - catalog.at > STALE
  if (isStale && !reading)
    reading = readGallery()
      .then(async pets => {
        if (pets.length) {
          catalog = { at: Date.now(), pets }
          await writeJsonAtomic(CATALOG, catalog)
        }
        return pets
      })
      .finally(() => (reading = null))
  if (catalog?.pets.length) return catalog.pets
  return (await reading?.catch(() => [])) ?? []
}

// ---------- the pets brought home ----------

export async function adopted(): Promise<Adopted[]> {
  const out: Adopted[] = []
  for (const id of await readdir(DIR).catch(() => [] as string[])) {
    const meta = await readJson(join(DIR, id, "pet.json")).catch(() => null)
    if (meta && safeId(meta.id)) out.push(meta)
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
