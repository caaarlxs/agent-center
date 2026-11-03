// The pets as the server keeps them (lib/pets.ts): the packs to open, the pets
// you have and the one on the board. Asked again now and then and when the
// window comes back, so a pack that arrived shows (with a toast) without a
// reload; when the next one comes the page never knows.
import { toast } from "sonner"
import { get, post } from "@/lib/api"
import { createStore } from "@/lib/store"
import { openDialog } from "@/app/open-dialog"
import { COMMUNITY, setAdopted, type Adopted, type Rarity } from "./art"

export type Skin = { key: string; rarity: Rarity }
export type Pets = { packs: number; owned: Record<string, number>; active: string | null; opened: number; prBoosts: number; species: string[]; skins: Skin[]; perPack: number; community: Adopted[] }
export type Pull = { id: string; rarity: Rarity; isNew: boolean; name?: string; category?: string }

export const pets = createStore<Pets | null>(null)
const EVERY = 5 * 60_000

export async function loadPets() {
  const before = pets.get()
  const next = await get<Pets>("/api/pets").catch(() => null)
  if (!next) return
  if (before && next.packs > before.packs)
    toast(next.packs - before.packs > 1 ? `${next.packs - before.packs} new packs arrived!` : "A new pack arrived!", {
      description: "Open it to see which pets are inside",
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

export async function choosePet(id: string | null) {
  const res = await post<Omit<Pets, "species" | "skins" | "perPack" | "community">>("/api/pets/choose", { id })
  pets.set({ ...pets.get()!, ...res })
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
