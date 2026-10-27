// What the board's views share: the view and its choices (kept in this
// browser under the classic board's names), the card you point at with the
// keyboard, its open menu, the card being dragged, and what was just done
// ahead of the server (overrides.ts).
import { useEffect, useMemo } from "react"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { createStore, persistedStore } from "@/lib/store"
import type { GroupBy, View } from "./order"
import { type Overrides, settle, withOverrides } from "./overrides"

export const view = persistedStore<View>("view", "inbox")
export const showDone = persistedStore("showDone", false)
export const groupBy = persistedStore<GroupBy>("groupBy", "none")
// Cards that wait for you give a short shake now and then; "off" keeps them still.
export const shake = persistedStore<"on" | "off">("shake", "on")

export const selected = createStore<string | null>(null)
// The Later or Colour menu open on a card (A, C, or its button).
export type Menu = { kind: "park" | "color"; id: string } | null
export const menu = createStore<Menu>(null)
export const toggleMenu = (kind: "park" | "color", id: string) => {
  const m = menu.get()
  menu.set(m?.kind === kind && m.id === id ? null : { kind, id })
}
// A card dragged between columns or rows (Board, Tiers).
export const dragging = createStore<Card | null>(null)
// The canvas's next drag draws a zone (the Zone button).
export const drawingZone = createStore(false)

export const overrides = createStore<Overrides>({})

// Choosing a view also stops drawing a zone.
export const setView = (v: View) => (view.set(v), drawingZone.set(false))

// The cards as the board shows them: the server's, with what was just done
// here on top, without the archived ones.
export function useBoardCards(): Card[] {
  const cards = useLive(l => l.snapshot?.cards)
  const ov = overrides.use()
  useEffect(() => {
    if (cards) overrides.set(settle(overrides.get(), cards, Date.now()))
  }, [cards])
  return useMemo(() => withOverrides(cards ?? [], ov), [cards, ov])
}
