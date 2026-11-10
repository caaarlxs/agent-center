// The arrow code (↑ ↑ ↓ ↓ ← → ← →, not while you type): your pets march
// across the bottom of the window, the rarest first, eight at most. Their
// sheets are loaded and decoded before the first step, and each moves by
// transform alone (the compositor's work), so the board keeps its frames.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { PetArt, isCommunity } from "./art"
import { ARROWS, arrowStep } from "./arrow-code"
import { rarityOf, type Pets } from "./pets"

const MAX = 8
const GAP_S = 0.55
const CROSS_S = 9
const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 } as const

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** Calls `onCode` when the arrows are pressed in order. */
export function useArrowCode(onCode: () => void) {
  useEffect(() => {
    let at = 0
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return void (at = 0)
      at = arrowStep(at, e.key)
      if (at === ARROWS.length) (at = 0), onCode()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCode])
}

const sheetOf = (id: string) => `/api/pets/community/${encodeURIComponent(id.slice("community:".length))}/sheet`

/** The pets that march: yours, with a sheet at home or drawn, the rarest first. */
export function marchers(state: Pets): string[] {
  const home = new Set(state.community.map(c => `community:${c.id}`))
  return Object.keys(state.owned)
    .filter(id => state.owned[id]! > 0 && (!isCommunity(id) || home.has(id)))
    .sort((a, b) => RANK[rarityOf(state, b)] - RANK[rarityOf(state, a)])
    .slice(0, MAX)
}

export function Parade({ state, onDone }: { state: Pets; onDone: () => void }) {
  const [list] = useState(() => marchers(state))
  const [isReady, setReady] = useState(false)
  useEffect(() => {
    if (!list.length) return onDone()
    let alive = true
    // Every sheet in memory before the first step: no stutter when one arrives late.
    void Promise.all(list.filter(isCommunity).map(id => {
      const img = new Image()
      img.src = sheetOf(id)
      return img.decode().catch(() => {})
    })).then(() => alive && setReady(true))
    return () => void (alive = false)
  }, [list, onDone])
  useEffect(() => {
    if (!isReady) return
    const t = setTimeout(onDone, (CROSS_S + list.length * GAP_S) * 1000 + 300)
    return () => clearTimeout(t)
  }, [isReady, list.length, onDone])
  if (!isReady) return null
  return createPortal(
    <div className="pet-parade" aria-hidden>
      {list.map((id, i) => (
        <div key={id} className="pet-parade-one" style={{ animationDelay: `${i * GAP_S}s`, animationDuration: `${CROSS_S}s` }}>
          <PetArt id={id} size={56} doing="walk" facing={1} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
