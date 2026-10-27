// "Done", the band at the canvas's foot (canvas.js done-area): drop a card on
// it to mark it done; its cards sit in one row, dimmed, and one lifted out
// of it is reopened where it lands. Those with no room wait behind "+N more
// done", a list with Reopen and Archive. Archive all, with Undo.
import { Archive, Check, RotateCcw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { Card } from "@/lib/api-types"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { openSession, useOpenSession } from "@/app/open-session"
import { archiveAll, boardAct } from "@/features/board/act"
import { selected } from "@/features/board/state"
import { SessionCard } from "@/features/session/SessionCard"
import { ageOf } from "@/features/session/state"
import { CARD_W, GRID } from "./geometry"
import { DONE_H } from "./ZoomControl"
import { FOLD_EASE } from "./ZoneNode"

export const DONE_BAND = "done-band" // its id, for the drop test

// Whether the pointer is over the band (a card let go there is done).
export function isOverDone(e: { clientX: number; clientY: number }) {
  const r = document.getElementById(DONE_BAND)?.getBoundingClientRect()
  return !!r && e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right
}

// A done card: a click opens it; dragged out of the band, it is reopened
// where it lands (onLift); let go on the band, it slides back.
function DoneCard({ card, now, isOpen, onLift }: { card: Card; now: number; isOpen: boolean; onLift: (card: Card, rect: DOMRect) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isDragging, setDragging] = useState(false)
  const isPointed = selected.use() === card.id
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input")) return
    const el = ref.current!
    const start = { x: e.clientX, y: e.clientY }
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!moved && Math.hypot(dx, dy) < 4) return
      if (!moved) (moved = true), setDragging(true)
      el.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      if (!moved) return void (selected.set(card.id), openSession(card.id))
      setDragging(false)
      const rect = el.getBoundingClientRect()
      if (isOverDone(ev)) {
        const from = el.style.transform
        el.style.transform = ""
        el.animate([{ transform: from }, { transform: "none" }], { duration: 280, easing: FOLD_EASE })
        return
      }
      // It stays where it was let go until the canvas draws it there.
      setTimeout(() => el.isConnected && (el.style.transform = ""), 3000)
      onLift(card, rect)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  return (
    <div ref={ref} onPointerDown={onPointerDown} className={cn("relative flex-none", isDragging && "z-50")} style={{ width: CARD_W }}>
      <SessionCard card={card} now={now} isSelected={isPointed} isReading={isOpen} isDragging={isDragging} />
    </div>
  )
}

// The done sessions with no room in the row: open, reopen or archive each.
function DoneList({ cards, now, onClose }: { cards: Card[]; now: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-done-more]") && onClose()
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose())
    window.addEventListener("pointerdown", away, true)
    window.addEventListener("keydown", esc, true)
    return () => (window.removeEventListener("pointerdown", away, true), window.removeEventListener("keydown", esc, true))
  }, [onClose])
  const icon = "inline-flex size-7 flex-none items-center justify-center rounded-[7px] text-text-muted hover:bg-press hover:text-text active:scale-[0.92] [&_svg]:size-3.5"
  return (
    <div ref={ref} role="dialog" aria-label="More done sessions"
      className="absolute right-4 bottom-[calc(100%+8px)] z-60 flex max-h-[min(60vh,520px)] w-[min(420px,calc(100%-32px))] flex-col overflow-hidden rounded-[12px] border border-line bg-raised shadow-pop">
      <header className="flex flex-none items-center gap-[7px] border-b border-line px-3.5 py-2.5 text-xs font-bold tracking-[0.05em] text-text-muted uppercase"><Check className="size-[13px]" />{cards.length} more done</header>
      <ul className="m-0 list-none overflow-auto p-1.5">
        {cards.map(card => (
          <li key={card.id} className="flex items-center gap-0.5">
            <button className="flex min-w-0 flex-1 flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-hover" title="Open the conversation" onClick={() => (onClose(), openSession(card.id))}>
              <span className="max-w-full truncate text-[13px] text-text">{card.title}</span><small className="text-[11.5px] text-faint">{card.repo} · {ageOf(card, now)}</small>
            </button>
            <button className={icon} title="Reopen: back on the canvas" onClick={() => void boardAct(card, "undone")}><RotateCcw /></button>
            <button className={icon} title="Archive" onClick={() => void boardAct(card, "archive")}><Archive /></button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DoneBand({ cards, isTarget, onLift }: { cards: Card[]; isTarget: boolean; onLift: (card: Card, rect: DOMRect) => void }) {
  const now = useNow()
  const open = useOpenSession()
  const row = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [isMoreOpen, setMoreOpen] = useState(false)
  useEffect(() => {
    const el = row.current
    if (!el) return
    const obs = new ResizeObserver(() => setWidth(el.clientWidth))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  // One row, as many as the band is wide (newest first); the rest wait behind "+N more".
  const slots = Math.max(1, Math.floor((width - GRID) / (CARD_W + GRID)))
  const shown = cards.length > slots ? cards.slice(0, slots - 1) : cards
  const more = cards.slice(shown.length)
  useEffect(() => void (more.length || setMoreOpen(false)), [more.length])
  return (
    <section id={DONE_BAND} data-fly="done" data-group="done" style={{ height: DONE_H }}
      className={cn("absolute inset-x-0 bottom-0 z-10 border-t-[1.5px] border-dashed transition-[background-color,border-color] duration-150",
        isTarget ? "border-work bg-work-soft" : "border-line-strong bg-[color-mix(in_srgb,var(--side)_55%,transparent)]")}>
      <header className="flex h-10 items-center gap-2 px-4 text-xs font-bold tracking-[0.05em] text-text-muted uppercase">
        <Check className="size-3.5" />Done<span className="font-medium text-faint">{cards.length || ""}</span>
        <span className={cn("text-xs font-[450] tracking-normal normal-case", isTarget ? "text-work" : "text-faint")}>
          {cards.length ? "Drop a card here to mark it as done · lift it out to reopen it" : "Drop a card here to mark it as done"}
        </span>
        {cards.length > 0 && (
          <button onClick={() => void archiveAll(cards)} title="Archive all done sessions"
            className="ml-2 inline-flex h-6 items-center gap-[5px] rounded-md px-2 text-[11.5px] font-semibold tracking-normal text-text-muted normal-case hover:bg-press hover:text-text">
            <Archive className="size-[13px]" />Archive all
          </button>
        )}
      </header>
      <div ref={row} className="flex items-start gap-6 overflow-x-clip px-6 pt-0.5">
        {shown.map(card => <DoneCard key={card.id} card={card} now={now} isOpen={open?.id === card.id} onLift={onLift} />)}
        {more.length > 0 && (
          <button data-done-more aria-expanded={isMoreOpen} onClick={() => setMoreOpen(!isMoreOpen)} style={{ width: CARD_W }}
            className={cn("flex h-[72px] flex-none flex-col items-center justify-center gap-0.5 rounded-[12px] border-[1.5px] border-dashed text-[12.5px] text-text-muted hover:border-brand hover:bg-hover",
              isMoreOpen ? "border-brand text-text" : "border-line-strong")}>
            <b className="text-xl text-text tabular-nums">+{more.length}</b><span>more done</span>
          </button>
        )}
      </div>
      {isMoreOpen && <DoneList cards={more} now={now} onClose={() => setMoreOpen(false)} />}
    </section>
  )
}
