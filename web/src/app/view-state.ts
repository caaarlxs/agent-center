// What the page's views share besides the open session (open-session.ts).

import { createStore, persistedStore } from "@/lib/store"

// The board's views (features/board); the sidebar chooses one.
import { type View, view } from "@/features/board/state"
export { type View, view }
export const VIEW_NAME: Record<View, string> = { inbox: "Inbox", board: "Board", canvas: "Canvas", tiers: "Tiers" }

// The repo the canvas shows (its root), or every repo (null). Kept, so a
// reload shows the same; the shell lets it go when that repo leaves.
export const repoFilter = persistedStore<string | null>("repoFilter", null)

// A card the canvas should go to and flash ("Next up", the search): a new
// object each time, so asking twice for the same card goes there twice.
export const focusRequest = createStore<{ id: string } | null>(null)
export const focusCard = (id: string) => focusRequest.set({ id })

// The sidebar as a drawer over the page, in a narrow window (≤ 860px).
export const sideOpen = createStore(false)

// What the window shows: the canvas needs room, so a narrow window shows the
// inbox instead (main.js:134-136).
const narrow = typeof window !== "undefined" ? matchMedia("(max-width: 860px)") : null
const isNarrow = createStore(!!narrow?.matches)
narrow?.addEventListener("change", () => isNarrow.set(narrow.matches))
export function useShownView(): View {
  const chosen = view.use()
  return isNarrow.use() && chosen === "canvas" ? "inbox" : chosen
}
