// How big each pet is on the board, as you set it in its menu (− and +):
// kept in this browser, a factor on top of the size its stage gives it.
import { persistedStore } from "@/lib/store"

export const SIZES = [0.6, 0.8, 1, 1.25, 1.5, 1.75, 2]
export const sizes = persistedStore<Record<string, number>>("petSize", {})
export const sizeOf = (id: string) => sizes.get()[id] ?? 1

/** The next size one step up (1) or down (-1), never past the ends. */
export function nextSize(now: number, dir: 1 | -1): number {
  const way = dir > 0 ? SIZES.filter(s => s > now + 1e-9) : SIZES.filter(s => s < now - 1e-9).reverse()
  return way[0] ?? now
}

export function resize(id: string, dir: 1 | -1) {
  const size = nextSize(sizeOf(id), dir)
  const { [id]: _, ...rest } = sizes.get()
  sizes.set(size === 1 ? rest : { ...rest, [id]: size })
  return size
}
