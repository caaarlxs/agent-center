import { persistedStore } from "@/lib/store"

// The note on the board with Open when a session finishes or asks you; "off"
// leaves the card's flash and L (Setup). Apart from prefs.ts, which needs a
// browser to load.
export const sessionToasts = persistedStore<"on" | "off">("sessionToasts", "on")
