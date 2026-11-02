// The conversation's map: a thin rail beside a long conversation, a mark for
// each of your messages, each question, each failed test run, each turn's
// changed files and each chapter, where it sits in the conversation, and a
// shade for the part you see. Near it, the rail widens; over a mark, a card
// says what it is (and when, for your messages). A click on a mark goes
// there; a click on the rail, to that point. Items mark themselves with
// `data-mark`, `data-mark-label` (what the card says) and `data-mark-time`.
import { type RefObject, useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type MarkKind = "you" | "ask" | "fail" | "edit" | "chapter"
const NAME: Record<MarkKind, string> = { you: "You", ask: "Question", fail: "Tests failed", edit: "Files changed", chapter: "Chapter" }
const LOOK: Record<MarkKind, string> = {
  you: "bg-brand",
  ask: "bg-ask",
  fail: "bg-bad",
  edit: "bg-work",
  chapter: "bg-text-muted",
}
const MIN_RATIO = 1.8 // shorter than this many screens: no map

type Mark = { kind: MarkKind; label: string; time: string | null; at: number; el: HTMLElement }
type View = { marks: Mark[]; top: number; size: number; isLong: boolean }

// Where an element sits in the scrolled box, as a share of its whole height.
const shareOf = (el: HTMLElement, box: HTMLElement) => (el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop) / box.scrollHeight

function read(box: HTMLElement): View {
  const isLong = box.scrollHeight > box.clientHeight * MIN_RATIO
  const marks = isLong
    ? [...box.querySelectorAll<HTMLElement>("[data-mark]")].map(el => ({ kind: el.dataset.mark as MarkKind, label: el.dataset.markLabel ?? "", time: el.dataset.markTime ?? null, at: shareOf(el, box), el }))
    : []
  return { marks, top: box.scrollTop / box.scrollHeight, size: box.clientHeight / box.scrollHeight, isLong }
}

export function ConversationMap({ box }: { box: RefObject<HTMLDivElement | null> }) {
  const [view, setView] = useState<View>({ marks: [], top: 0, size: 1, isLong: false })
  const [hovered, setHovered] = useState<Mark | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    // Gathered, a little after the last change (not on a frame: a page in
    // the background draws none).
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setView(read(el)), 40)
    }
    update()
    const resized = new ResizeObserver(update)
    resized.observe(el)
    const changed = new MutationObserver(update)
    changed.observe(el, { childList: true, subtree: true })
    el.addEventListener("scroll", update, { passive: true })
    return () => {
      clearTimeout(timer)
      resized.disconnect()
      changed.disconnect()
      el.removeEventListener("scroll", update)
    }
  }, [box])
  if (!view.isLong) return null
  const goTo = (mark: Mark) => {
    mark.el.scrollIntoView({ block: "center", behavior: "smooth" })
    mark.el.animate([{ outline: "2px solid var(--brand)", outlineOffset: "3px" }, { outline: "2px solid transparent", outlineOffset: "3px" }], { duration: 1200, easing: "ease-out" })
  }
  const jump = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = box.current
    if (!el || e.target !== e.currentTarget) return
    const r = e.currentTarget.getBoundingClientRect()
    el.scrollTo({ top: ((e.clientY - r.top) / r.height) * el.scrollHeight - el.clientHeight / 2, behavior: "smooth" })
  }
  return (
    // A wider zone than the rail: the pointer near it is enough to widen it.
    <div className="group/map absolute top-2 right-0 bottom-2 z-[2] w-7 max-[860px]:hidden" onMouseLeave={() => setHovered(null)}>
      <div className="absolute inset-y-0 right-1 w-2.5 cursor-pointer rounded-full transition-[width,background-color] duration-150 ease-(--ease-out) group-hover/map:w-5 group-hover/map:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
        onClick={jump} aria-label="Conversation map" role="navigation">
        <span className="pointer-events-none absolute inset-x-0 rounded-full bg-[color-mix(in_srgb,var(--text)_9%,transparent)]" style={{ top: `${view.top * 100}%`, height: `${Math.max(view.size * 100, 3)}%` }} />
        {view.marks.map((m, i) => (
          <button key={i} aria-label={`${NAME[m.kind]}: ${m.label}`} onClick={() => goTo(m)} onMouseEnter={() => setHovered(m)} onFocus={() => setHovered(m)}
            className={cn("absolute right-0 h-[3px] -translate-y-1/2 rounded-full opacity-80 transition-[width,height,opacity] duration-150 ease-(--ease-out) group-hover/map:h-1 group-hover/map:opacity-100",
              LOOK[m.kind], m.kind === "chapter" ? "w-2.5 group-hover/map:w-5" : "w-1.5 group-hover/map:w-4", hovered === m && "!h-1.5 !w-5")}
            style={{ top: `${m.at * 100}%` }} />
        ))}
      </div>
      {hovered && (
        <div className="pointer-events-none absolute right-8 z-[3] w-[260px] -translate-y-1/2 rounded-[10px] border border-line bg-raised px-3 py-2 shadow-pop" style={{ top: `${hovered.at * 100}%` }}>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
            <i className={cn("size-2 rounded-full", LOOK[hovered.kind])} />{NAME[hovered.kind]}{hovered.time && <span className="ml-auto font-medium text-faint">{hovered.time}</span>}
          </div>
          <p className="m-0 line-clamp-3 text-[12.5px] text-text">{hovered.label}</p>
        </div>
      )}
    </div>
  )
}
