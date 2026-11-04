// Text selected in a conversation, as Claude desktop does it: a small bar
// over it, "Side chat" (a new session that knows this conversation, to ask
// about the selection) and "Reply" (the selection quoted in the reply box).
// It goes once the selection does, on a scroll or with Esc.
import { MessagesSquare, Reply } from "lucide-react"
import { type RefObject, useEffect, useState } from "react"
import { createPortal } from "react-dom"

type At = { x: number; y: number; text: string }

const button = "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-text transition-[background-color,transform] duration-[120ms] hover:bg-hover active:scale-[0.97] [&_svg]:size-3.5 [&_svg]:text-text-muted"

export function SelectionMenu({ box, onSideChat, onReply }: { box: RefObject<HTMLDivElement | null>; onSideChat: (text: string) => void; onReply: (text: string) => void }) {
  const [at, setAt] = useState<At | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => {
      const sel = getSelection()
      const text = sel?.toString().trim() ?? ""
      if (!sel || !text || !sel.rangeCount || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return setAt(null)
      const r = sel.getRangeAt(0).getBoundingClientRect()
      setAt({ x: r.left + r.width / 2, y: r.top, text })
    }
    const later = () => setTimeout(read, 0) // the selection settles after the press ends
    const gone = () => !getSelection()?.toString().trim() && setAt(null)
    const hide = () => setAt(null)
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" ? hide() : e.shiftKey && later())
    el.addEventListener("pointerup", later)
    el.addEventListener("keyup", onKey)
    el.addEventListener("scroll", hide, { passive: true })
    document.addEventListener("selectionchange", gone)
    return () => {
      el.removeEventListener("pointerup", later)
      el.removeEventListener("keyup", onKey)
      el.removeEventListener("scroll", hide)
      document.removeEventListener("selectionchange", gone)
    }
  }, [box])
  if (!at) return null
  const pick = (act: (text: string) => void) => () => (act(at.text), setAt(null), getSelection()?.removeAllRanges())
  return createPortal(
    // A press here keeps the selection (and the panel open: data-keeps-panel).
    <div data-keeps-panel role="toolbar" aria-label="Selected text" onPointerDown={e => e.preventDefault()}
      className="guide-in fixed z-50 flex -translate-x-1/2 -translate-y-full gap-0.5 rounded-[10px] border border-line bg-raised p-0.5 shadow-pop"
      style={{ left: at.x, top: at.y - 8 }}>
      <button type="button" className={button} onClick={pick(onSideChat)}><MessagesSquare />Side chat</button>
      <button type="button" className={button} onClick={pick(onReply)}><Reply />Reply</button>
    </div>,
    document.body,
  )
}
