// The arrow code (↑ ↑ ↓ ↓ ← → ← →, not while you type): your pets march
// across the bottom of the window, the rarest first, eight at most, hopping
// in a wave over a band of drifting colour and twinkling stars, each leaving
// sparks of its rarity behind, the first with a pennant; confetti falls as
// the last one reaches the middle, and a little march plays if the board's
// sound is on. Their sheets are loaded and decoded before the first step,
// and everything moves by transform and opacity alone (the compositor's
// work), so the board keeps its frames.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { sound } from "@/features/alerts/prefs"
import { PetArt, RARITY_COLOR, isCommunity } from "./art"
import { ARROWS, arrowStep } from "./arrow-code"
import { rarityOf, type Pets } from "./pets"

const MAX = 8
const GAP_S = 0.55
const CROSS_S = 9
const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 } as const
const TRAIL = 5 // sparks behind each pet
const STARS = 18
const CONFETTI = 46
const COLORS = ["#ffd45c", "#ff7ad9", "#7fe3ff", "#9dff8a", "#b98cff", "#fff3b0"]
const rand = (a: number, b: number) => a + Math.random() * (b - a)

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
  const total = CROSS_S + list.length * GAP_S
  useEffect(() => {
    if (!isReady) return
    march()
    const t = setTimeout(onDone, total * 1000 + 300)
    return () => clearTimeout(t)
  }, [isReady, total, onDone])
  const [stars] = useState(() => Array.from({ length: STARS }, () => ({ x: rand(2, 98), y: rand(30, 120), d: rand(0, 3), s: rand(0.6, 1.4) })))
  const finale = (list.length - 1) * GAP_S + CROSS_S / 2 // the last one in the middle
  const [confetti] = useState(() => Array.from({ length: CONFETTI }, () => ({ x: rand(0, 100), d: rand(2.2, 3.6), delay: finale + rand(0, 0.8), r: rand(0, 360), w: rand(5, 9), c: COLORS[Math.floor(Math.random() * COLORS.length)] })))
  if (!isReady) return null
  return createPortal(
    <>
      <div className="pet-parade" style={{ "--total": `${total}s` } as React.CSSProperties} aria-hidden>
        <div className="parade-aurora" />
        {stars.map((st, i) => <i key={i} className="parade-star" style={{ left: `${st.x}%`, bottom: st.y, animationDelay: `${st.d}s, 0s`, scale: st.s }} />)}
        {list.map((id, i) => (
          <div key={id} className="pet-parade-one" style={{ animationDelay: `${i * GAP_S}s`, animationDuration: `${CROSS_S}s`, "--rarity": RARITY_COLOR[rarityOf(state, id)] } as React.CSSProperties}>
            {Array.from({ length: TRAIL }, (_, k) => <i key={k} className="parade-trail" style={{ animationDelay: `${-(k / TRAIL) * 1.1}s`, "--dy": `${-6 - ((k * 7) % 20)}px` } as React.CSSProperties} />)}
            <div className="parade-hop" style={{ animationDelay: `${-i * 0.13}s` }}>
              <i className="parade-glow" />
              {i === 0 && <Pennant />}
              <PetArt id={id} size={56} doing="walk" facing={1} />
            </div>
          </div>
        ))}
      </div>
      <div className="parade-sky" aria-hidden>
        {confetti.map((c, i) => <i key={i} className="parade-confetti" style={{ left: `${c.x}%`, animationDuration: `${c.d}s`, animationDelay: `${c.delay}s`, width: c.w, height: c.w * 1.6, background: c.c, rotate: `${c.r}deg` }} />)}
      </div>
    </>,
    document.body,
  )
}

// The leader's pennant, waving.
function Pennant() {
  return (
    <svg className="parade-pennant" viewBox="0 0 22 30" width="20" height="27" aria-hidden>
      <path d="M2 2 V29" stroke="#c9a46a" strokeWidth="1.6" strokeLinecap="round" />
      <path className="parade-flag" d="M3 3 L20 7.5 L3 12 Z" fill="#ff5b7f" />
      <circle cx="2" cy="2" r="1.6" fill="#ffd45c" />
    </svg>
  )
}

// A little march, if the board's sound is on: a bright run up, a step, and a flourish.
function march() {
  if (sound.get() !== "on") return
  try {
    const ctx = new AudioContext()
    const notes: [number, number][] = [[523, 0], [659, 0.16], [784, 0.32], [1047, 0.48], [784, 0.72], [880, 0.88], [1047, 1.04], [1319, 1.3]]
    for (const [f, at] of notes) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = "triangle"
      o.frequency.value = f
      const t = ctx.currentTime + at
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.09, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, t + (at === 1.3 ? 0.9 : 0.2))
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 1)
    }
    setTimeout(() => void ctx.close(), 3000)
  } catch {
    // no sound, no matter
  }
}
