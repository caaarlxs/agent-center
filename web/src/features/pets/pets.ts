// The pets as the server keeps them (lib/pets.ts): the packs to open, the pets
// you have, the one on the board and its buddy, and the XP each has earned. Asked again now and then and when the
// window comes back, so a pack that arrived shows (with a toast) without a
// reload; when the next one comes the page never knows.
import { toast } from "sonner"
import { get, post } from "@/lib/api"
import { createStore } from "@/lib/store"
import { openDialog } from "@/app/open-dialog"
import type { Condition, XpKind } from "@server/pet-levels"
import { COMMUNITY, setAdopted, type Adopted, type Rarity } from "./art"
import { careOf, energyOf, fullnessOf } from "./care"

export type Skin = { key: string; rarity: Rarity }
export type Pets = { packs: number; owned: Record<string, number>; active: string | null; buddy: string | null; xp: Record<string, number>; opened: number; prBoosts: number; ticketBoosts?: number; ticketPacks?: number; species: string[]; skins: Skin[]; perPack: number; odds: Record<Rarity, number>; community: Adopted[] }
export type Pull = { id: string; rarity: Rarity; isNew: boolean; name?: string; category?: string }

export const pets = createStore<Pets | null>(null)
const EVERY = 5 * 60_000

export async function loadPets() {
  const before = pets.get()
  const next = await get<Pets>("/api/pets").catch(() => null)
  if (!next) return
  const byTicket = before ? (next.ticketPacks ?? 0) - (before.ticketPacks ?? 0) : 0
  if (before && next.packs > before.packs)
    toast(byTicket > 0 ? "Your Jira ticket brought a pack!" : next.packs - before.packs > 1 ? `${next.packs - before.packs} new packs arrived!` : "A new pack arrived!", {
      icon: byTicket > 0 ? "🎟️" : undefined,
      description: byTicket > 0 ? "Lucky: one ticket in eight brings a pack there and then" : "Open it to see which pets are inside",
      action: { label: "Open", onClick: () => openDialog({ kind: "pets" }) },
    })
  setAdopted(next.community)
  pets.set(next)
}

let isWatching = false
export function watchPets() {
  if (isWatching) return
  isWatching = true
  void loadPets()
  setInterval(() => void loadPets(), EVERY)
  window.addEventListener("focus", () => void loadPets())
}

export async function openPack(): Promise<Pull[]> {
  const res = await post<Omit<Pets, "species" | "skins" | "perPack"> & { pulls: Pull[] }>("/api/pets/open")
  const { pulls, ...rest } = res
  setAdopted(rest.community)
  pets.set({ ...pets.get()!, ...rest })
  return pulls
}

// The pet out on the board (slot "buddy": the one with it).
export async function choosePet(id: string | null, slot: "active" | "buddy" = "active") {
  const res = await post<Omit<Pets, "species" | "skins" | "perPack" | "community">>("/api/pets/choose", { id, slot })
  pets.set({ ...pets.get()!, ...res })
}

// How a pet is doing, for what it earns: fed and rested earns more, hungry or tired less.
export function conditionOf(pet: string): Condition {
  const c = careOf(pet)
  const [food, energy] = [fullnessOf(c), energyOf(c)]
  return food < 25 || energy < 20 ? "poorly" : food > 60 && energy > 50 ? "well" : "ok"
}

// What the pets did with you, sent to the board a moment later, a few at a
// time; the key makes each count once, from however many pages.
type XpEvent = { key: string; kind: XpKind; pet?: string; condition?: Condition }
let queue: XpEvent[] = []
let flushing: number | null = null
export function earn(kind: XpKind, key: string, pet?: string) {
  queue.push({ key, kind, pet, condition: pet ? conditionOf(pet) : undefined })
  flushing ??= window.setTimeout(() => {
    flushing = null
    const events = queue.splice(0, 50)
    void post<Omit<Pets, "species" | "skins" | "perPack" | "community">>("/api/pets/xp", { events })
      .then(res => pets.set({ ...pets.get()!, ...res }), () => {})
  }, 1500)
}

export const rarityOf = (p: Pets, id: string): Rarity =>
  id.startsWith(COMMUNITY) ? (p.community.find(c => `${COMMUNITY}${c.id}` === id)?.rarity ?? "common") : (p.skins.find(k => k.key === id.split(":")[1])?.rarity ?? "common")

// Every pet a pack can hold (codex-pets.net's, rated by the server), asked
// once a session when the collection first shows.
export type CatalogPet = { id: string; name: string; poster: string; category: string; rarity: Rarity }
export const catalog = createStore<CatalogPet[] | null>(null)
let catalogLoad: Promise<void> | null = null
export function loadCatalog() {
  catalogLoad ??= get<{ pets: CatalogPet[] }>("/api/pets/catalog").then(r => catalog.set(r.pets), () => void (catalogLoad = null))
  return catalogLoad
}
