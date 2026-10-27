// What the page's views share besides the open session (open-session.ts).

import { createStore } from "@/lib/store"

// The repo the canvas shows (its root), or every repo (null).
export const repoFilter = createStore<string | null>(null)

// A card the canvas should go to and flash ("Next up", the search): a new
// object each time, so asking twice for the same card goes there twice.
export const focusRequest = createStore<{ id: string } | null>(null)
export const focusCard = (id: string) => focusRequest.set({ id })
