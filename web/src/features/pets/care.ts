// How each pet is doing, kept in this browser: when it last ate (it is hungry
// again some ten hours later), how much energy it has (it tires through the
// day and fills up again asleep, in under an hour), whether it sleeps, the
// session it works with, and whether it may send you notifications.
import { persistedStore } from "@/lib/store"

export type Care = { fedAt: number; energy: number; at: number; isAsleep: boolean; focus: string | null; canNotify: boolean; toldHungry?: boolean }

const HUNGRY_IN = 10 * 3600_000
const TIRED_IN = 9 * 3600_000
const RESTED_IN = 40 * 60_000

export const cares = persistedStore<Record<string, Care>>("petCare", {})

const fresh = (now: number): Care => ({ fedAt: now, energy: 90, at: now, isAsleep: false, focus: null, canNotify: true })
const clamp = (n: number) => Math.max(0, Math.min(100, n))

export const careOf = (id: string, now = Date.now()) => cares.get()[id] ?? fresh(now)
export const fullnessOf = (c: Care, now = Date.now()) => clamp(100 - ((now - c.fedAt) / HUNGRY_IN) * 100)
export const energyOf = (c: Care, now = Date.now()) => clamp(c.energy + ((now - c.at) / (c.isAsleep ? RESTED_IN : -TIRED_IN)) * 100)

// A change to one pet's care; its energy is settled up to now first.
export function setCare(id: string, change: Partial<Care>, now = Date.now()) {
  const c = careOf(id, now)
  cares.set({ ...cares.get(), [id]: { ...c, energy: energyOf(c, now), at: now, ...change } })
}

export const FOODS = ["🍖", "🍣", "🍪", "🍎", "🧁", "🍩", "🥕", "🍕", "🍓", "🧀"]
