// The conversation's map: a thin rail beside a long conversation, a mark for
// each of your messages, each question, each failed test run, each turn's
// changed files and each chapter, where it sits in the conversation, and a
// shade for the part you see. A click on a mark goes there; a click on the
// rail, to that point. Items mark themselves with `data-mark` (and
// `data-mark-label`, what the mark says on hover).
import { type RefObject, useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type MarkKind = "you" | "ask" | "fail" | "edit" | "chapter"
const LOOK: Record<MarkKind, string> = {
  you: "bg-brand",
  ask: "bg-ask",
  fail: "bg-bad",
  edit: "bg-work",
  chapter: "bg-text-muted",
}
const MIN_RATIO = 1.8 // shorter than this many screens: no map

type Mark = { kind: MarkKind; label: string; at: number; el: HTMLElement }
type View = { marks: Mark[]; top: number; size: number; isLong: boolean }

// Where an element sits in the scrolled box, as a share of its whole height.
const shareOf = (el: HTMLElement, box: HTMLElement) => (el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop) / box.scrollHeight

function read(box: HTMLElement): View {
  const isLong = box.scrollHeight > box.clientHeight * MIN_RATIO
  const marks = isLong
    ? [...box.querySelectorAll<HTMLElement>("[data-mark]")].map(el => ({ kind: el.dataset.mark as MarkKind, label: el.dataset.markLabel ?? "", at: shareOf(el, box), el }))
    : []
  return { marks, top: box.scrollTop / box.scrollHeight, size: box.clientHeight / box.scrollHeight, isLong }
}

export function ConversationMap({ box }: { box: RefObject<HTMLDivElement | null> }) {
  const [view, setView] = useState<View>({ marks: [], top: 0, size: 1, isLong: false })
  useEffect(() => {
    const el = box.current
    if (!el) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setView(read(el)))
    }
    update()
    const resized = new ResizeObserver(update)
    resized.observe(el)
    const changed = new MutationObserver(update)
    changed.observe(el, { childList: true, subtree: true })
    el.addEventListener("scroll", update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
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
    <div className="absolute top-2 right-1 bottom-2 z-[1] w-2.5 cursor-pointer rounded-full max-[860px]:hidden" onClick={jump} aria-label="Conversation map" role="navigation">
      <span className="pointer-events-none absolute inset-x-0 rounded-full bg-[color-mix(in_srgb,var(--text)_9%,transparent)]" style={{ top: `${view.top * 100}%`, height: `${Math.max(view.size * 100, 3)}%` }} />
      {view.marks.map((m, i) => (
        <button key={i} title={m.label} aria-label={m.label} onClick={() => goTo(m)}
          className={cn("absolute right-0 h-[3px] rounded-full opacity-80 transition-[opacity,transform] duration-150 hover:scale-y-[1.8] hover:opacity-100", LOOK[m.kind], m.kind === "chapter" ? "w-2.5" : "w-1.5")}
          style={{ top: `${m.at * 100}%` }} />
      ))}
    </div>
  )
}
