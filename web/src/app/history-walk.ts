// Back and forward (the mouse's side buttons, the window's arrows, ⌘[ ⌘])
// walk the conversations you opened, as in Claude desktop (main.js:339-362):
// each one opened is a history entry. Going back, the panel slides out and
// the one before slides in; to an entry with none open, it closes.
import { useEffect, useRef } from "react"
import { selected } from "@/features/board/state"
import { openNow, openSession, useOpenSession } from "./open-session"

// What a step through history does to the panel, from the session it shows
// (`now`) to the entry's (`target`). Pure: tested on its own.
export type Walk = "stay" | "close" | "open" | "swap"
export function walkTo(target: string | null, now: string | null): Walk {
  if (target === now) return "stay"
  if (!target) return "close"
  return now ? "swap" : "open"
}

const SWAP_MS = 300 // the panel slides out before the other slides in

export function useHistoryWalk() {
  const id = useOpenSession()?.id ?? null
  const fromHistory = useRef(false)
  useEffect(() => {
    if (fromHistory.current) return void (fromHistory.current = false)
    if ((history.state?.reader ?? null) !== id) history.pushState({ ...history.state, reader: id }, "")
  }, [id])
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const target: string | null = e.state?.reader ?? null
      const walk = walkTo(target, openNow()?.id ?? null)
      if (walk === "stay") return
      fromHistory.current = true
      if (walk === "close") return void (openSession(null), selected.set(null))
      if (walk === "open") return void openSession(target)
      openSession(null)
      setTimeout(() => ((fromHistory.current = true), openSession(target)), SWAP_MS)
    }
    addEventListener("popstate", onPop)
    return () => removeEventListener("popstate", onPop)
  }, [])
}
