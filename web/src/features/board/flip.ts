// Cards and rows that move (motion.js useFlip): after each render, every
// [data-id] element that changed its group (column, lane, inbox section,
// tier) or its place in it travels from where it was (transform only). One
// that left flies to where it went (the Done button or band, a folded
// group), drops out of view when archived, or fades; a new one fades in.
// Nothing moves on the first render of a scope (another view, filter or
// grouping), nor with reduced motion. On the canvas only arrivals and
// departures animate: React Flow slides the cards itself.
import { type RefObject, useLayoutEffect, useRef } from "react"

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
const DROP_GAP_MS = 260 // how long the others wait while an archived card falls

// Cards that appear or leave with an animation of their own (a zone folding
// or unfolding, a card dropped into a folder): left alone, once.
const quiet = new Set<string>()
export function quietly(ids: string[]) {
  for (const id of ids) quiet.add(id)
  setTimeout(() => ids.forEach(id => quiet.delete(id)), 1000) // in case no render saw them
}

type Place = { group: string; index: number }
type Seen = { rect: DOMRect; unit: HTMLElement; unitRect: DOMRect; k: number; place: Place }

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

// Where an element sits: its group and its index among that group's items.
function placeOf(el: HTMLElement): Place {
  const group = el.closest<HTMLElement>("[data-group]") ?? el.parentElement
  const items = group ? [...group.querySelectorAll("[data-id]")] : []
  const lane = el.closest("[data-lane]")?.getAttribute("data-lane") ?? ""
  return { group: `${lane}|${group?.dataset.group ?? ""}`, index: items.indexOf(el) }
}

// What travels: the repo stack when the card is alone in it, else the card.
function unitOf(el: HTMLElement): HTMLElement {
  const stack = el.closest<HTMLElement>("[data-stack]")
  return stack && stack.querySelectorAll("[data-id]").length === 1 ? stack : el
}

// How much smaller than its own size an element is drawn (the canvas scales).
const shrinkOf = (el: HTMLElement) => (el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1)

// A copy of `node` pinned at `rect`, in a layer above everything, drawn at
// `k` of its size (CSS zoom also scales left, top and translate: divide by k).
function copyAt(node: HTMLElement, rect: { left: number; top: number; width: number; height: number }, k = 1) {
  const copy = node.cloneNode(true) as HTMLElement
  Object.assign(copy.style, {
    position: "fixed", left: `${rect.left / k}px`, top: `${rect.top / k}px`, width: `${rect.width / k}px`, height: `${rect.height / k}px`,
    zoom: String(k), margin: "0", zIndex: "60", pointerEvents: "none", transition: "none", boxSizing: "border-box", animation: "none",
  })
  document.body.append(copy)
  return copy
}

function once(fn: () => void) {
  let done = false
  return () => void (done || ((done = true), fn()))
}

// `whereTo(id)`: the column a card that left went to ("archived" when gone).
export function useFlip(ref: RefObject<HTMLElement | null>, scope: string, whereTo: (id: string) => string, isOn = true) {
  const prev = useRef(new Map<string, Seen>())
  const lastScope = useRef<string | null>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !isOn) return void (lastScope.current = null)
    const isFresh = lastScope.current !== scope
    lastScope.current = scope
    const now = new Map<string, HTMLElement>()
    // React Flow marks its node boxes with data-id too: the cards inside them count.
    for (const el of root.querySelectorAll<HTMLElement>("[data-id]:not(.react-flow__node)")) now.set(el.dataset.id!, el)
    const isCanvas = !!root.querySelector(".react-flow")
    const settle = [...prev.current.keys()].some(id => !now.has(id) && whereTo(id) === "archived") ? DROP_GAP_MS : 0

    if (!isFresh && !reduced()) {
      for (const [id, el] of now) {
        const old = prev.current.get(id)
        if (!old) {
          if (quiet.delete(id)) continue
          unitOf(el).animate([{ opacity: 0, transform: "translateY(6px) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE })
          continue
        }
        const place = placeOf(el)
        if (place.group === old.place.group && (isCanvas || place.index === old.place.index)) continue
        if (place.group === old.place.group) {
          // Same group: a short slide in place.
          const rect = el.getBoundingClientRect()
          const dx = old.rect.left - rect.left
          const dy = old.rect.top - rect.top
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 320, delay: settle, easing: EASE, fill: "backwards" })
          continue
        }
        // Another group: a copy flies above the page in an arc, then the real one shows.
        const unit = unitOf(el)
        const to = unit.getBoundingClientRect()
        const from = old.unitRect
        const k = shrinkOf(unit)
        const copy = copyAt(unit, { left: from.left, top: from.top, width: to.width, height: to.height }, k)
        unit.style.opacity = "0"
        const dx = (to.left - from.left) / k
        const dy = (to.top - from.top) / k
        const duration = Math.min(620, 320 + Math.hypot(dx, dy) * 0.3)
        const land = once(() => {
          copy.remove()
          unit.style.opacity = ""
          unit.animate([{ transform: "scale(1.015)" }, { transform: "none" }], { duration: 180, easing: EASE })
        })
        copy.animate([
          { transform: "translate(0, 0) scale(1)", boxShadow: "0 1px 2px rgb(0 0 0 / 0.1)" },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 14}px) scale(1.03)`, boxShadow: "0 18px 40px rgb(0 0 0 / 0.35)", offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(1)`, boxShadow: "0 1px 2px rgb(0 0 0 / 0.1)" },
        ], { duration, easing: EASE }).finished.finally(land)
        setTimeout(land, duration + 250) // a hidden window pauses animations
      }

      for (const [id, old] of prev.current) {
        if (now.has(id) || !old.unit || quiet.delete(id)) continue
        const ghost = copyAt(old.unit, old.unitRect, old.k)
        const gone = once(() => ghost.remove())
        const goesTo = whereTo(id)
        // Archived: a small lift, then it drops out of the view, tilting as it falls.
        if (goesTo === "archived") {
          const fall = innerHeight - old.unitRect.top + 40
          ghost.animate([
            { transform: "none", opacity: 1 },
            { transform: "translateY(-8px) scale(1.02)", opacity: 1, offset: 0.18 },
            { transform: `translateY(${Math.min(fall, 260) / old.k}px) rotate(-4deg) scale(0.94)`, opacity: 0 },
          ], { duration: 460, easing: "cubic-bezier(0.55, 0, 0.75, 0.3)" }).finished.finally(gone)
          setTimeout(gone, 700)
          continue
        }
        // To a place that stands for its column ([data-fly]): it shrinks into it, and the place beats.
        const target = document.querySelector(`[data-fly="${goesTo}"]`)
        if (target) {
          const t = target.getBoundingClientRect()
          const dx = (t.left + t.width / 2 - (old.unitRect.left + old.unitRect.width / 2)) / old.k
          const dy = (t.top + Math.min(t.height, 40) / 2 - (old.unitRect.top + old.unitRect.height / 2)) / old.k
          ghost.animate([
            { transform: "none", opacity: 1 },
            { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(0.6)`, opacity: 0.9, offset: 0.6 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0 },
          ], { duration: 540, easing: "cubic-bezier(0.55, 0, 0.3, 1)" }).finished.finally(gone)
          const beat = target.querySelector<HTMLElement>("header") ?? target
          beat.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 260, delay: 420, easing: EASE })
          setTimeout(gone, 790)
        } else {
          ghost.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96) translateY(-4px)" }], { duration: 220, easing: EASE }).finished.finally(gone)
          setTimeout(gone, 470)
        }
      }
    }

    // Where everything is now, and the unit to copy for a later exit.
    const next = new Map<string, Seen>()
    for (const [id, el] of now) {
      const unit = unitOf(el)
      next.set(id, { rect: el.getBoundingClientRect(), unit, unitRect: unit.getBoundingClientRect(), k: shrinkOf(unit), place: placeOf(el) })
    }
    prev.current = next
  })
}
