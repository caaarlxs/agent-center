// "What's new": the catalogue's lines dated after your last look at the guide
// (kept in this browser). A first visit counts the last week as new.
import md from "../../../../FEATURES.md?raw"
import { persistedStore } from "@/lib/store"
import { catalogueOf, newSince, seenUpTo } from "./guide"

export const CATALOGUE = catalogueOf(md)
const FIRST_LOOK_DAYS = 7

// A day as the catalogue writes it (YYYY-MM-DD), in this Mac's time zone.
export const dayOf = (ms: number) => new Date(ms).toLocaleDateString("sv-SE")

const seen = persistedStore<string | null>("guideSeen", null)
export const markSeen = () => seen.set(seenUpTo(CATALOGUE, dayOf(Date.now())))
export function useUnseen() {
  const day = seen.use() ?? dayOf(Date.now() - FIRST_LOOK_DAYS * 86_400_000)
  return newSince(CATALOGUE, day)
}
