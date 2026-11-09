// Back and forward (the mouse's side buttons, the window's arrows, ⌘[ ⌘])
// walk the places you have been, as a browser does: the view (Inbox,
// Canvas, Tickets…), the conversation open in the panel and its tab
// (Conversation, Commits, Files…). Each change is a history entry; going
// back puts the view back, and the panel closes, opens or slides from one
// conversation to the one before (main.js:339-362).
import { useEffect, useRef } from "react"
import { selected } from "@/features/board/state"
import { type Tab, openNow, openSession, showTab, useOpenSession } from "./open-session"
import { type View, view } from "./view-state"

// What a step through history does to the panel, from the session it shows
// (`now`) to the entry's (`target`). Pure: tested on its own.
export type Walk = "stay" | "close" | "open" | "swap"
export function walkTo(target: string | null, now: string | null): Walk {
  if (target === now) return "stay"
  if (!target) return "close"
  return now ? "swap" : "open"
}

// Where you are: the view, the session open (if any) and its tab.
export type Place = { view: View; reader: string | null; tab: Tab | null }
export const samePlace = (a: Place, b: Place) => a.view === b.view && a.reader === b.reader && (!a.reader || a.tab === b.tab)
// An entry's place (older entries kept the session only: their view is the one shown).
export function placeOf(state: { view?: View; reader?: string | null; tab?: Tab | null } | null, shown: View): Place {
  const reader = state?.reader ?? null
  return { view: state?.view ?? shown, reader, tab: reader ? (state?.tab ?? "chat") : null }
}

const SWAP_MS = 300 // the panel slides out before the other slides in

export function useHistoryWalk() {
  const open = useOpenSession()
  const shown = view.use()
  const here: Place = { view: shown, reader: open?.id ?? null, tab: open ? open.tab : null }
  // The place a step through history goes to: what changes on the way there
  // (the panel sliding out first) is not a new entry.
  const going = useRef<Place | null>(null)
  useEffect(() => {
    if (going.current) {
      if (samePlace(here, going.current)) going.current = null
      return
    }
    if (!samePlace(here, placeOf(history.state, shown))) history.pushState({ ...history.state, ...here }, "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here.view, here.reader, here.tab])
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const target = placeOf(e.state, view.get())
      const now = openNow()
      going.current = target
      setTimeout(() => going.current === target && (going.current = null), SWAP_MS + 700) // never stuck on a place it cannot reach
      if (target.view !== view.get()) view.set(target.view)
      const walk = walkTo(target.reader, now?.id ?? null)
      if (walk === "stay") return void (target.reader && target.tab !== now?.tab && showTab(target.tab!))
      if (walk === "close") return void (openSession(null), selected.set(null))
      if (walk === "open") return void openSession(target.reader, target.tab!)
      openSession(null)
      setTimeout(() => openSession(target.reader, target.tab!), SWAP_MS)
    }
    addEventListener("popstate", onPop)
    return () => removeEventListener("popstate", onPop)
  }, [])
}
