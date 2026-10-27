// What the page's views share besides the open session (open-session.ts).

import { createStore, persistedStore } from "@/lib/store"

// The board's views; the sidebar chooses one (kept as the classic board keeps it).
export type View = "inbox" | "board" | "canvas" | "tiers"
export const VIEW_NAME: Record<View, string> = { inbox: "Inbox", board: "Board", canvas: "Canvas", tiers: "Tiers" }
export const view = persistedStore<View>("view", "canvas")

// The repo the canvas shows (its root), or every repo (null). Kept, so a
// reload shows the same; the shell lets it go when that repo leaves.
export const repoFilter = persistedStore<string | null>("repoFilter", null)

// A card the canvas should go to and flash ("Next up", the search): a new
// object each time, so asking twice for the same card goes there twice.
export const focusRequest = createStore<{ id: string } | null>(null)
export const focusCard = (id: string) => focusRequest.set({ id })

// The sidebar as a drawer over the page, in a narrow window (≤ 860px).
export const sideOpen = createStore(false)
