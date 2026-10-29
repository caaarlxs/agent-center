// The right-click menu of the whole page (items.ts says what it offers):
// it opens where you click, in the board's own menu look, and closes on a
// click elsewhere, Esc, a scroll or leaving the window. Arrows move through
// it, Enter picks. It always shows: some windows (an app's) have no menu of their own.
import { AnimatePresence, motion } from "motion/react"
import { ClipboardPaste, Copy, ExternalLink, ImageIcon, Link, Mail, Maximize2, RotateCw, Scissors, TextSelect, type LucideIcon } from "lucide-react"
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { showImage } from "@/components/common/Lightbox"
import { cn } from "@/lib/utils"
import { copyText } from "@/features/conversation/Markdown"
import { type Action, type Item, itemsFor } from "./items"

const ICON: Record<string, LucideIcon> = {
  "Open link in a new tab": ExternalLink, "Copy link": Link, "Write an email": Mail, "Copy email address": Copy,
  "See it large": Maximize2, "Copy image": ImageIcon, "Copy image address": Link, "Open image in a new tab": ExternalLink,
  Cut: Scissors, Copy, Paste: ClipboardPaste, "Select all": TextSelect, "Copy text": Copy, "Reload page": RotateCw,
}

// The word under the cursor: the text between spaces around the point clicked.
function wordAt(x: number, y: number) {
  const range = document.caretRangeFromPoint?.(x, y)
  const node = range?.startContainer
  if (!range || node?.nodeType !== Node.TEXT_NODE) return ""
  const text = node.textContent ?? ""
  let from = range.startOffset
  let to = range.startOffset
  while (from > 0 && !/\s/.test(text[from - 1]!)) from--
  while (to < text.length && !/\s/.test(text[to]!)) to++
  return text.slice(from, to)
}

// An image on the clipboard: the clipboard takes PNG, so any other is drawn into one.
async function copyImage(src: string) {
  const blob = await (await fetch(src)).blob()
  const png = blob.type === "image/png" ? blob : await new Promise<Blob>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight })
      c.getContext("2d")!.drawImage(img, 0, 0)
      c.toBlob(b => (b ? resolve(b) : reject(new Error("no image"))), "image/png")
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
}

// Into a field as if typed, so the page sees the change (undo keeps it too).
function typeInto(field: HTMLElement, text: string) {
  field.focus()
  if (!document.execCommand("insertText", false, text) && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    field.setRangeText(text, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length, "end")
    field.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

async function run(action: Action, selection: string) {
  try {
    switch (action.kind) {
      case "copy": return void (await copyText(action.text), toast("Copied"))
      case "open": return void window.open(action.url, "_blank", "noopener,noreferrer")
      case "image": return showImage(action.src)
      case "reload": return location.reload()
      case "copyImage": return void (await copyImage(action.src), toast("Image copied"))
      case "cut": return void (await copyText(selection), typeInto(action.field, ""))
      case "paste": return typeInto(action.field, await navigator.clipboard.readText())
      case "selectAll":
        action.field.focus()
        return action.field instanceof HTMLInputElement || action.field instanceof HTMLTextAreaElement ? action.field.select() : document.execCommand("selectAll")
    }
  } catch {
    toast(action.kind === "paste" ? "The browser keeps the clipboard to itself here: paste with ⌘V" : "The browser did not allow it")
  }
}

type Open = { x: number; y: number; items: Item[]; selection: string }
const row = "relative z-[1] flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text outline-none [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-text-muted"

// The row lit under the pointer or the keyboard: one highlight that glides
// from row to row (it appears in place the first time, then slides).
type Lit = { top: number; height: number; isFirst: boolean; of: unknown }
function useLit(menu: unknown) {
  const [lit, setLit] = useState<Lit | null>(null)
  const light = (el: HTMLElement) => setLit(l => ({ top: el.offsetTop, height: el.offsetHeight, isFirst: l?.of !== menu, of: menu }))
  return { lit: lit?.of === menu ? lit : null, light }
}

// Closes on a press elsewhere, Esc, a scroll, leaving the window or resizing it; arrows move between its rows.
function useDismiss(isOpen: boolean, box: React.RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return void (e.preventDefault(), e.stopImmediatePropagation(), close())
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      e.preventDefault()
      const rows = [...(box.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])]
      const i = rows.indexOf(document.activeElement as HTMLButtonElement)
      rows[(i + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus()
    }
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("scroll", close, true)
    window.addEventListener("blur", close)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("blur", close)
      window.removeEventListener("resize", close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
}

// Where it opens: at the cursor, flipped to its other side where it would
// not fit in the window; its first row takes the keyboard.
function usePlacement(open: Open | null, box: React.RefObject<HTMLDivElement | null>) {
  const [at, setAt] = useState({ x: 0, y: 0 })
  useLayoutEffect(() => {
    if (!open || !box.current) return
    const { width, height } = box.current.getBoundingClientRect()
    setAt({ x: open.x + width > innerWidth - 8 ? Math.max(8, open.x - width) : open.x, y: open.y + height > innerHeight - 8 ? Math.max(8, open.y - height) : open.y })
    box.current.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus({ preventScroll: true })
  }, [open, box])
  return at
}

export function ContextMenu() {
  const [open, setOpen] = useState<Open | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || box.current?.contains(e.target)) return
      const selection = window.getSelection()?.toString() ?? ""
      const items = itemsFor(e.target, selection, wordAt(e.clientX, e.clientY))
      if (!items.length) return setOpen(null)
      e.preventDefault()
      setOpen({ x: e.clientX, y: e.clientY, items, selection })
    }
    window.addEventListener("contextmenu", onMenu)
    return () => window.removeEventListener("contextmenu", onMenu)
  }, [])

  useDismiss(open !== null, box, () => setOpen(null))

  const at = usePlacement(open, box)
  const { lit, light } = useLit(open)

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div ref={box} key={`${open.x},${open.y}`} role="menu" aria-label="Actions"
          className="fixed z-[210] min-w-52 rounded-[10px] border border-line bg-raised p-[5px] shadow-pop"
          style={{ left: at.x, top: at.y, transformOrigin: `${at.x < open.x ? "right" : "left"} ${at.y < open.y ? "bottom" : "top"}` }}
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
          onContextMenu={e => e.preventDefault()}>
          {lit && <i aria-hidden className={cn("absolute inset-x-[5px] top-0 rounded-md bg-hover", !lit.isFirst && "transition-[transform,height] duration-150 ease-(--ease-out) motion-reduce:transition-none")}
            style={{ transform: `translateY(${lit.top}px)`, height: lit.height }} />}
          {open.items.map((item, i) => {
            const Icon = ICON[item.label] ?? Copy
            return (
              <Fragment key={item.label}>
                {i > 0 && open.items[i - 1]!.group !== item.group && <div role="separator" className="mx-1 my-[5px] h-px bg-line" />}
                <button type="button" role="menuitem" className={row} onFocus={e => light(e.currentTarget)} onMouseEnter={e => (light(e.currentTarget), e.currentTarget.focus({ preventScroll: true }))}
                  onClick={() => (setOpen(null), void run(item.action, open.selection))}>
                  <Icon /><span className="flex-1">{item.label}</span>{item.hint && <kbd className="font-sans text-[11.5px] text-faint">{item.hint}</kbd>}
                </button>
              </Fragment>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
