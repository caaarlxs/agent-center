// Every keyboard shortcut of the board (main.js:552-658), in one handler
// added once; it reads the newest state from a ref, so two keys pressed
// between renders both see what the first one did. The canvas adds its own
// (+ − 0, Space, Esc on what is picked: Canvas.tsx).
import { useEffect, useMemo, useRef } from "react"
import { useLive } from "@/lib/live"
import { isTyping } from "@/lib/keys"
import { undoLast } from "@/lib/toast"
import { openDialog } from "@/app/open-dialog"
import { WORKSPACES, openNow, openSession, showTab, useOpenSession } from "@/app/open-session"
import { repoFilter } from "@/app/view-state"
import { boardAct, moveToTier, openInClaude, setOrder, stopSession } from "@/features/board/act"
import { useShownView } from "@/features/board/MainView"
import { stepFrom, walkOrder } from "@/features/board/order"
import { groupBy, menu, selected, setView, showDone, useBoardCards } from "@/features/board/state"
import { tierStep } from "@/features/board/tiers"
import { CARD_COLORS, PARK_OPTIONS } from "@/features/session/parts"
import { helpOpen } from "./help-state"
import { startRename } from "@/features/session/SessionPanel"

// Enter keeps its own job on these (press, pick, tick, unfold): it opens the
// selected conversation only from elsewhere.
const ENTER_KEEPS = "button, a[href], summary, [role=button], [role=option], [role=radio], [role=checkbox], [role=tab], [role=menuitem], [role=menuitemradio]"
const VIEWS = { "1": "inbox", "2": "board", "3": "canvas", "4": "tiers" } as const

// A card on screen: brought into view, and focused when the focus was on a card.
function reveal(id: string) {
  const hadFocus = !!(document.activeElement as HTMLElement | null)?.closest?.("[data-id]")
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
    if (hadFocus) el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: "nearest" })
  })
}

// The reply box of the open panel, once it is there.
const focusReply = () => setTimeout(() => document.querySelector<HTMLElement>("aside[aria-label=Session] textarea")?.focus(), 80)

export function useBoardKeys({ nextUp, toggleSearch, openSearch, isSearching }: { nextUp: () => void; toggleSearch: () => void; openSearch: () => void; isSearching: boolean }) {
  const view = useShownView()
  const all = useBoardCards()
  const repo = repoFilter.use()
  const isDone = showDone.use()
  const by = groupBy.use()
  const repos = useLive(l => l.snapshot?.repos)
  const open = useOpenSession()
  const cards = useMemo(() => (repo ? all.filter(c => c.repoRoot === repo) : all), [all, repo])
  const order = useMemo(() => walkOrder(view, cards, isDone, by, repos ?? []), [view, cards, isDone, by, repos])
  setOrder(order)
  const latest = useRef({ cards, order, view, nextUp, toggleSearch, openSearch, isSearching, open })
  latest.current = { cards, order, view, nextUp, toggleSearch, openSearch, isSearching, open }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { cards, order, view, nextUp, toggleSearch, openSearch, isSearching } = latest.current
      const typing = isTyping(e.target)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return void (e.preventDefault(), toggleSearch())
      if (isSearching || helpOpen.get() || document.querySelector("[role=dialog]")) return // a dialog handles its own keys
      // "?" arrives as Shift+/ on some layouts and drivers.
      if (!typing && (e.key === "?" || (e.code === "Slash" && e.shiftKey))) return void (e.preventDefault(), helpOpen.set(true))
      if (e.key === "/" && !typing) return void (e.preventDefault(), openSearch())
      if (e.key === "Escape") {
        const panel = openNow()
        if (typing) (e.target as HTMLElement).blur()
        else if (menu.get()) menu.set(null)
        // A workspace (Changes, Code, Files) goes back to the conversation first.
        else if (panel && WORKSPACES.has(panel.tab)) showTab("chat")
        else if (panel) (openSession(null), selected.set(null))
        else return void selected.set(null) // the canvas lets go of what is picked too
        return void e.preventDefault()
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const id = selected.get()
      const card = cards.find(c => c.id === id)
      const m = menu.get()
      if (m?.kind === "park" && card?.id === m.id) {
        const option = PARK_OPTIONS.find(o => o.key === e.key)
        if (option) return void (e.preventDefault(), menu.set(null), boardAct(card, "park", { until: option.until() }))
      }
      if (m?.kind === "color" && card?.id === m.id && /^[0-7]$/.test(e.key)) {
        // 1–7 pick a colour, 0 takes it off; the views' 1 2 3 4 wait.
        e.preventDefault()
        menu.set(null)
        return void boardAct(card, "color", { color: e.key === "0" ? "" : CARD_COLORS[Number(e.key) - 1].key })
      }
      const move = (step: 1 | -1) => {
        e.preventDefault()
        const next = stepFrom(order, id, step)
        if (!next) return
        selected.set(next.id)
        menu.set(null)
        const panel = openNow()
        if (panel) openSession(next.id, panel.tab)
        reveal(next.id)
      }
      switch (e.key) {
        case "j": case "ArrowDown": return move(1)
        case "k": case "ArrowUp": return move(-1)
        case "Enter":
          if (id && !e.defaultPrevented && !(e.target as HTMLElement).closest?.(ENTER_KEEPS)) (e.preventDefault(), openSession(id))
          return
        case "o": if (id) void openInClaude(id); return
        case "t":
          if (!id) return
          e.preventDefault()
          if (openNow()?.id !== id) openSession(id)
          // The panel starts editing its title (the classic board's event).
          setTimeout(startRename, 50)
          return
        case "r":
          if (!id) return
          e.preventDefault()
          openSession(id)
          return void focusReply()
        case "p": if (card) void boardAct(card, card.pinned ? "unpin" : "pin"); return
        case "a":
          if (!card) return
          if (card.column === "parked") void boardAct(card, "unpark")
          else if (card.column !== "done") menu.set(m?.kind === "park" ? null : { kind: "park", id: card.id })
          return
        case "e": if (card) void boardAct(card, card.column === "done" ? "undone" : "done"); return
        case "c": if (card) menu.set(m?.kind === "color" ? null : { kind: "color", id: card.id }); return
        case "z": undoLast(); return
        case "g": return groupBy.set(groupBy.get() === "repo" ? "none" : "repo")
        case "1": case "2": case "3": case "4": return setView(VIEWS[e.key])
        case "[": case "]": {
          // On the tier list: the selected card one row up ([) or down (]).
          if (!card || view !== "tiers") return
          const key = tierStep(card, e.key === "[" ? -1 : 1)
          if (key) (e.preventDefault(), void moveToTier(card, key))
          return
        }
        case "n": e.preventDefault(); return openDialog({ kind: "new" })
        case "f": e.preventDefault(); return nextUp()
        case "d": e.preventDefault(); return openDialog({ kind: "digest" })
        case "s": if (card?.column === "working") void stopSession(card); return
        case "u": if (card?.column === "pending") void boardAct(card, "unseen"); return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
