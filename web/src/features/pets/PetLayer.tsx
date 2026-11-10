// The pet out on the board. It wanders the window, rests, says things; it
// gets hungry and tired (care.ts), naps when it runs out of energy and wakes
// when it is full of it again. A click opens its menu: feed it, pet it, put
// it to bed, set it to work with a session, let it notify you. Working, it
// walks to that session's card and sits on it at its laptop; when the
// session asks you something or finishes, it tells you (a toast here, a macOS
// notification when you are in another window). Dragged, it dangles and stays
// where it is dropped. Play ball with it: drag the ball and let go, it runs
// after it and brings it back. With reduced motion it does not wander.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { load, keep } from "@/lib/store"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { openSession } from "@/app/open-session"
import { canNotify, showNotice } from "@/features/alerts/prefs"
import { PetArt, RARITY_COLOR, petName } from "./art"
import { FOODS, careOf, cares, energyOf, fullnessOf, setCare } from "./care"
import { pets, rarityOf, watchPets } from "./pets"

type Mode = "idle" | "walk" | "sleep" | "drag" | "cheer" | "alert" | "eat" | "work" | "wait" | "fetch" | "carry"
const SIZE = 60
const SPEED = 52 // px a second
const RUSH = 150 // to its session's card
const CHASE = 270 // after the ball
// The ball: its size, how it falls, how much of a bounce it keeps, and how
// long the pet waits for a throw before it puts the ball away.
const BALL = 18
const GRAVITY = 2100
const BOUNCE = 0.58
const BORED_AFTER = 30_000
type Ball = { x: number; y: number; vx: number; vy: number; spin: number; state: "loose" | "held" | "carried"; isThrown: boolean; from: { x: number; y: number }; at: number }
const floorOf = () => innerHeight - 4 - BALL / 2
const IDLE_NAP = 90_000 // nobody moves the mouse: a nap
const LINES = ["Hi!", "♪ ♫", "Ship it!", "More pets, please", "Coffee?", "Any PRs to review?", "I'm helping!", "Bugs? Where?", "*happy noises*", "You got this"]
const WORK_LINES = ["Reading the logs…", "Hmm, interesting", "Compiling…", "Tests are running", "Typing very fast", "Almost there…", "LGTM so far", "Refactoring my tail"]

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!
const bounds = () => ({ minX: SIZE / 2 + 8, maxX: innerWidth - SIZE / 2 - 8, minY: SIZE + 64, maxY: innerHeight - 6 })
const clamp = (p: { x: number; y: number }) => {
  const b = bounds()
  return { x: Math.min(b.maxX, Math.max(b.minX, p.x)), y: Math.min(b.maxY, Math.max(b.minY, p.y)) }
}
// Where it sits to work: on the top right of the session's card, or in the
// corner when the card is not on screen.
function seatOf(cardId: string) {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(cardId)}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width && r.bottom > 70 && r.top < innerHeight - 20 && r.right > 0 && r.left < innerWidth) return { at: clamp({ x: r.right - 50, y: r.top + 16 }), isOnCard: true }
  }
  const b = bounds()
  return { at: { x: b.maxX - 30, y: b.maxY }, isOnCard: false }
}

export function PetLayer() {
  const state = pets.use()
  useEffect(watchPets, [])
  // A PR that brought the next pack nearer.
  const boosts = useRef<number | null>(null)
  useEffect(() => {
    if (!state) return
    if (boosts.current !== null && state.prBoosts > boosts.current) {
      const n = state.prBoosts - boosts.current
      toast(n > 1 ? `${n} PRs brought your next pack nearer` : "Your PR brought your next pack nearer", { icon: "📦", description: "Every PR you open takes a day off the wait" })
    }
    boosts.current = state.prBoosts
  }, [state])
  const active = state?.active
  if (!active || !state) return null
  return <Walker key={active} id={active} color={RARITY_COLOR[rarityOf(state, active)]} />
}

function Walker({ id, color }: { id: string; color: string }) {
  const name = petName(id)
  const el = useRef<HTMLDivElement>(null)
  const pos = useRef(clamp(load("petPos", { x: innerWidth - 140, y: innerHeight - 12 })))
  const target = useRef<{ x: number; y: number } | null>(null)
  const facing = useRef(1)
  const [face, setFace] = useState(1) // for a community pet, whose sheet runs left or right
  const lastActive = useRef(Date.now())
  const [mode, setModeState] = useState<Mode>(careOf(id).isAsleep ? "sleep" : "idle")
  const modeRef = useRef<Mode>(mode)
  const [bubble, setBubble] = useState<string | null>(null)
  const [food, setFood] = useState<string | null>(null)
  const [isMenuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(false)
  const care = cares.use()[id] ?? careOf(id)
  const focus = care.focus
  const focusRef = useRef(focus)
  focusRef.current = focus
  const cards = useLive(l => l.snapshot?.cards) ?? []
  const focusCard = focus ? cards.find(c => c.id === focus) : undefined
  const [now, setNow] = useState(Date.now())
  const fullness = fullnessOf(care, now)
  const energy = energyOf(care, now)
  const isSad = fullness < 15 || energy < 12
  const timers = useRef<number[]>([])
  const ball = useRef<Ball | null>(null)
  const ballEl = useRef<HTMLDivElement>(null)
  const [hasBall, setHasBall] = useState(false)
  const isStill = matchMedia("(prefers-reduced-motion: reduce)").matches

  const setMode = (m: Mode) => ((modeRef.current = m), setModeState(m))
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
  const say = (text: string, ms = 2600) => {
    setBubble(text)
    later(ms, () => setBubble(b => (b === text ? null : b)))
  }
  // A moment of its own (joy, alarm), then back to what it did.
  const moment = (m: Mode, text: string, ms = 1800) => {
    target.current = null
    setMode(m)
    say(text, ms + 800)
    later(ms, () => modeRef.current === m && setMode(focusRef.current ? "wait" : "idle"))
  }
  // Something to tell you: said, and shown where you will see it.
  const notice = (text: string, cardId: string | null = null) => {
    say(text, 4000)
    if (!careOf(id).canNotify) return
    if (document.hidden && canNotify()) void showNotice(name, text, cardId)
    else if (!document.hidden) toast(`${name}: ${text}`, { icon: <PetArt id={id} size={26} />, action: cardId ? { label: "Open", onClick: () => openSession(cardId) } : undefined })
  }

  const place = () => {
    const node = el.current
    if (!node) return
    node.style.transform = `translate3d(${pos.current.x - SIZE / 2}px, ${pos.current.y - SIZE}px, 0)`
    node.style.setProperty("--face", String(facing.current))
  }
  const placeBall = () => {
    const b = ball.current
    if (b && ballEl.current) ballEl.current.style.transform = `translate3d(${b.x - BALL / 2}px, ${b.y - BALL / 2}px, 0) rotate(${b.spin}rad)`
  }
  const dropBall = () => {
    ball.current = null
    setHasBall(false)
  }

  // The walk: one frame at a time toward its target; at rest, now and then a
  // new one; working, its seat on the card, followed when the card moves.
  useEffect(() => {
    place()
    let frame = 0
    let last = performance.now()
    let restUntil = performance.now() + 1500
    let seatAt = 0
    // One step toward a point; answers whether it got there.
    const go = (to: { x: number; y: number }, speed: number, dt: number) => {
      const dx = to.x - pos.current.x
      const dy = to.y - pos.current.y
      const dist = Math.hypot(dx, dy)
      if (dist < 3) return true
      const move = Math.min(dist, speed * dt)
      pos.current = { x: pos.current.x + (dx / dist) * move, y: pos.current.y + (dy / dist) * move }
      if (Math.abs(dx) > 1 && (dx > 0 ? 1 : -1) !== facing.current) {
        facing.current = dx > 0 ? 1 : -1
        setFace(facing.current)
      }
      place()
      return false
    }
    // The ball on its own: it falls, bounces off the floor and the edges, rolls and stops.
    const roll = (b: Ball, dt: number) => {
      const floor = floorOf()
      if (b.y >= floor && Math.abs(b.vy) < 1) {
        b.vx *= Math.max(0, 1 - 2.6 * dt) // rolling
        if (Math.abs(b.vx) < 6) b.vx = 0
      } else b.vy += GRAVITY * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.y > floor) {
        b.y = floor
        b.vy = Math.abs(b.vy) > 140 ? -b.vy * BOUNCE : 0
        b.vx *= 0.86
      }
      if (b.y < BALL / 2) {
        b.y = BALL / 2
        b.vy = Math.abs(b.vy) * BOUNCE
      }
      if (b.x < BALL / 2) {
        b.x = BALL / 2
        b.vx = Math.abs(b.vx) * BOUNCE
      }
      if (b.x > innerWidth - BALL / 2) {
        b.x = innerWidth - BALL / 2
        b.vx = -Math.abs(b.vx) * BOUNCE
      }
      b.spin += (b.vx * dt) / (BALL / 2)
    }
    const step = (t: number) => {
      const rawDt = (t - last) / 1000
      const dt = Math.min(0.05, rawDt)
      last = t
      const m = modeRef.current
      const cardId = focusRef.current
      const b = ball.current
      if (b) {
        // in small steps, as much time as really went by (a slow frame does not slow the ball)
        if (b.state === "loose") for (let left = Math.min(0.25, rawDt); left > 0; left -= 0.016) roll(b, Math.min(0.016, left))
        else if (b.state === "carried") Object.assign(b, { x: pos.current.x + facing.current * 15, y: pos.current.y - SIZE * 0.42, spin: 0 })
        placeBall()
      }
      if (menuRef.current || m === "drag" || m === "sleep" || m === "eat" || m === "cheer" || m === "alert") {
        frame = requestAnimationFrame(step)
        return
      }
      // Playing: after the thrown ball, back with it, then waiting for the next throw.
      if (b && b.state !== "held") {
        if (b.state === "carried") {
          if (m !== "carry") setMode("carry")
          if (go(clamp(b.from), CHASE * 0.75, dt)) {
            b.state = "loose"
            b.isThrown = false
            b.at = Date.now()
            b.vx = facing.current * 60
            b.vy = -260
            setCare(id, { energy: Math.max(0, energyOf(careOf(id)) - 3) })
            moment("cheer", pick(["Again! Again!", "Throw it again!", "Here you go!", "One more?", "♥"]), 900)
          }
        } else if (b.isThrown) {
          if (m !== "fetch") setMode("fetch")
          const ground = clamp({ x: b.x, y: b.y + BALL / 2 })
          go(ground, CHASE, dt)
          if (Math.hypot(b.x - pos.current.x, b.y - (pos.current.y - BALL / 2)) < SIZE * 0.55) {
            b.state = "carried"
            if (Math.random() < 0.35) say(pick(["Got it!", "Mine!", "Hehe"]), 1200)
          }
        } else {
          if (m !== "idle") setMode("idle")
          const looking = b.x > pos.current.x ? 1 : -1
          if (looking !== facing.current) {
            facing.current = looking
            setFace(looking)
            place()
          }
          if (Date.now() - b.at > BORED_AFTER) {
            dropBall()
            say(pick(["That was fun!", "Good game!", "Play again later?"]))
          }
        }
        frame = requestAnimationFrame(step)
        return
      }
      if (cardId && t > seatAt) {
        seatAt = t + 400
        const seat = seatOf(cardId).at
        if (Math.hypot(seat.x - pos.current.x, seat.y - pos.current.y) > 6) {
          target.current = seat
          if (m !== "walk") setMode("walk")
        }
      }
      if (m === "walk" && target.current && !isStill) {
        const dx = target.current.x - pos.current.x
        const dy = target.current.y - pos.current.y
        const dist = Math.hypot(dx, dy)
        if (dist < 2) {
          target.current = null
          setMode(cardId ? "wait" : "idle")
          restUntil = t + 2000 + Math.random() * 6000
        } else {
          const speed = cardId ? RUSH : SPEED * (energyOf(careOf(id)) < 25 ? 0.55 : 1)
          const move = Math.min(dist, speed * dt)
          pos.current = { x: pos.current.x + (dx / dist) * move, y: pos.current.y + (dy / dist) * move }
          if (Math.abs(dx) > 1 && (dx > 0 ? 1 : -1) !== facing.current) {
            facing.current = dx > 0 ? 1 : -1
            setFace(facing.current)
          }
          place()
        }
      } else if (m === "walk" && isStill && target.current) {
        pos.current = target.current
        target.current = null
        place()
        setMode(cardId ? "wait" : "idle")
      } else if (m === "idle" && !cardId && !isStill) {
        if (Date.now() - lastActive.current > IDLE_NAP) setMode("sleep")
        else if (t > restUntil) {
          const b = bounds()
          const reach = 380
          target.current = clamp({ x: pos.current.x + (Math.random() - 0.5) * 2 * reach, y: Math.random() < 0.6 ? b.maxY - Math.random() * 30 : pos.current.y + (Math.random() - 0.5) * reach })
          setMode("walk")
          if (Math.random() < 0.12) say(pick(LINES))
        }
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    const wake = () => {
      lastActive.current = Date.now()
      // A nap for want of company ends with you; one for want of energy does not.
      if (modeRef.current === "sleep" && !careOf(id).isAsleep) moment("alert", pick(["!", "Oh, hi!", "*yawn*"]), 900)
    }
    const onResize = () => ((pos.current = clamp(pos.current)), place())
    window.addEventListener("pointermove", wake, { passive: true })
    window.addEventListener("keydown", wake)
    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", wake)
      window.removeEventListener("keydown", wake)
      window.removeEventListener("resize", onResize)
      timers.current.forEach(clearTimeout)
      keep("petPos", pos.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Its body, once a few seconds: hungry, tired (a nap), rested (awake).
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const c = careOf(id, t)
      const isHungry = fullnessOf(c, t) < 25
      // Told once each time it gets hungry, reloads or not.
      if (isHungry && !c.toldHungry) {
        setCare(id, { toldHungry: true }, t)
        notice(pick(["I'm hungry!", "Feed me, please 🥺", "My tummy is rumbling"]))
      }
      const e = energyOf(c, t)
      if (c.isAsleep && e >= 100) {
        setCare(id, { isAsleep: false }, t)
        setMode(focusRef.current ? "wait" : "idle")
        say(pick(["Good morning!", "I'm full of energy!", "What did I miss?"]))
      } else if (!c.isAsleep && e < 8 && ["idle", "wait"].includes(modeRef.current)) {
        setCare(id, { isAsleep: true }, t)
        setMode("sleep")
        say("So sleepy…")
      }
      if (modeRef.current === "work" && Math.random() < 0.06) say(pick(WORK_LINES), 2200)
      else if (isHungry && modeRef.current === "idle" && Math.random() < 0.03) say("I'm hungry…")
    }, 3000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Working: at the laptop while its session works, waiting with a coffee otherwise.
  useEffect(() => {
    if (!focus || !["work", "wait"].includes(modeRef.current)) return
    setMode(focusCard?.column === "working" ? "work" : "wait")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, focusCard?.column, mode])

  // What the sessions do. Its own session: it tells you. Any other: a hop or a cheer.
  const seen = useRef<Map<string, Card["column"]> | null>(null)
  useEffect(() => {
    const before = seen.current
    seen.current = new Map(cards.map(c => [c.id, c.column]))
    if (!before || modeRef.current === "drag") return
    const mine = focus ? cards.find(c => c.id === focus) : undefined
    if (focus && !mine && before.has(focus)) return void (setCare(id, { focus: null }), moment("cheer", "That session is gone. Back to wandering!"))
    if (mine && before.get(mine.id) !== mine.column) {
      if (careOf(id).isAsleep) setCare(id, { isAsleep: false })
      if (mine.column === "asking") return void (moment("alert", "", 2400), notice(`“${mine.title}” needs you!`, mine.id))
      if (before.get(mine.id) === "working" && mine.column !== "working") return void (moment("cheer", "", 1600), notice(`“${mine.title}” finished!`, mine.id))
      if (mine.column === "done") return void (setCare(id, { focus: null }), moment("cheer", "All done here!"))
    }
    if (modeRef.current === "sleep") return
    const asked = cards.some(c => c.column === "asking" && before.get(c.id) !== "asking")
    const finished = cards.some(c => before.get(c.id) === "working" && c.column !== "working")
    if (asked) moment(focus ? modeRef.current : "alert", "A session needs you!", 2000)
    else if (finished && !focus) moment("cheer", pick(["Done!", "Nice work!", "Another one!"]), 1600)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])

  // ---------- what you do to it ----------

  const closeMenu = () => ((menuRef.current = false), setMenuOpen(false))
  const feed = () => {
    closeMenu()
    if (fullnessOf(careOf(id)) > 90) return say("I'm full! Maybe later")
    const dish = pick(FOODS)
    setCare(id, { fedAt: Date.now(), isAsleep: false, toldHungry: false })
    setFood(dish)
    target.current = null
    setMode("eat")
    say("Nom nom nom", 2400)
    later(2600, () => (setFood(null), moment("cheer", pick(["Yum!", "Delicious!", "Thank you! ♥"]), 1200)))
  }
  const sleepOrWake = () => {
    closeMenu()
    if (careOf(id).isAsleep || modeRef.current === "sleep") {
      setCare(id, { isAsleep: false })
      moment("alert", pick(["I'm up!", "Five more minutes…", "*stretches*"]), 900)
    } else {
      setCare(id, { isAsleep: true })
      target.current = null
      setMode("sleep")
      say("Good night 💤")
    }
  }
  const work = (card: Card | null) => {
    closeMenu()
    setCare(id, { focus: card?.id ?? null, isAsleep: false })
    if (card) {
      setMode("walk")
      say(`On my way to “${card.title}”!`, 2600)
    } else moment("cheer", "Break time!", 1200)
  }

  // Play ball: a ball by its feet, waiting for you to throw it.
  const playBall = () => {
    closeMenu()
    if (careOf(id).isAsleep || modeRef.current === "sleep") return say("Zzz… later")
    if (energyOf(careOf(id)) < 10) return say("Too tired to play…")
    target.current = null
    ball.current = { x: pos.current.x + facing.current * 46, y: pos.current.y - BALL, vx: 0, vy: 0, spin: 0, state: "loose", isThrown: false, from: { ...pos.current }, at: Date.now() }
    setHasBall(true)
    setMode("idle")
    say("Throw it! Drag the ball and let go", 3200)
  }
  // The ball in your hand: it follows the pointer, and flies off as fast as
  // you let go of it (a click alone tosses it up).
  const onBallDown = (e: React.PointerEvent) => {
    const b = ball.current
    if (!b || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (b.state === "carried") say(pick(["Hey!", "That's mine!"]), 1000)
    b.state = "held"
    b.vx = b.vy = 0
    const node = e.currentTarget as HTMLElement
    node.setPointerCapture(e.pointerId)
    const trail: { x: number; y: number; t: number }[] = [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    const move = (ev: PointerEvent) => {
      b.x = Math.min(innerWidth - BALL / 2, Math.max(BALL / 2, ev.clientX))
      b.y = Math.min(floorOf(), Math.max(BALL / 2, ev.clientY))
      trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() })
      while (trail.length > 2 && trail[0]!.t < performance.now() - 90) trail.shift()
      placeBall()
    }
    const up = (ev: PointerEvent) => {
      node.removeEventListener("pointermove", move)
      node.removeEventListener("pointerup", up)
      node.removeEventListener("pointercancel", up)
      const first = trail[0]!
      const span = Math.max(0.016, (performance.now() - first.t) / 1000)
      let vx = (ev.clientX - first.x) / span
      let vy = (ev.clientY - first.y) / span
      const speed = Math.hypot(vx, vy)
      if (speed < 120) {
        // a click: up it goes
        vx = (Math.random() - 0.5) * 500
        vy = -750
      } else if (speed > 2600) {
        vx = (vx / speed) * 2600
        vy = (vy / speed) * 2600
      }
      Object.assign(b, { vx, vy, state: "loose", isThrown: true, from: { x: ev.clientX, y: ev.clientY }, at: Date.now() })
      lastActive.current = Date.now()
      if (Math.random() < 0.4) say(pick(["!", "Ooh!", "I'll get it!", "Wheee!"]), 1000)
    }
    node.addEventListener("pointermove", move)
    node.addEventListener("pointerup", up)
    node.addEventListener("pointercancel", up)
  }

  // A press: dragged once it moves, else its menu.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    const from = { ...pos.current }
    let isDragging = false
    const node = e.currentTarget as HTMLElement
    node.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!isDragging && Math.hypot(dx, dy) < 5) return
      if (!isDragging) {
        isDragging = true
        target.current = null
        if (ball.current?.state === "carried") Object.assign(ball.current, { state: "loose", isThrown: false, at: Date.now() }) // it lets go
        closeMenu()
        setMode("drag")
        setBubble(null)
      }
      pos.current = clamp({ x: from.x + dx, y: from.y + dy })
      place()
    }
    const up = () => {
      node.removeEventListener("pointermove", move)
      node.removeEventListener("pointerup", up)
      node.removeEventListener("pointercancel", up)
      lastActive.current = Date.now()
      if (isDragging) {
        keep("petPos", pos.current)
        if (focusRef.current) setCare(id, { focus: null }) // carried off its work
        setMode(careOf(id).isAsleep ? "sleep" : "idle")
        say(pick(["Wheee!", "Here?", "Nice view"]), 1600)
      } else {
        menuRef.current = !menuRef.current
        setMenuOpen(menuRef.current)
      }
    }
    node.addEventListener("pointermove", move)
    node.addEventListener("pointerup", up)
    node.addEventListener("pointercancel", up)
  }

  // The menu closes on a click elsewhere or Esc.
  useEffect(() => {
    if (!isMenuOpen) return
    const onDown = (e: PointerEvent) => !el.current?.contains(e.target as Node) && closeMenu()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu()
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey)
    return () => (window.removeEventListener("pointerdown", onDown, true), window.removeEventListener("keydown", onKey))
  }, [isMenuOpen])

  const isUp = pos.current.y < 330 // near the top: the menu opens below
  const shift = Math.min(innerWidth - 126, Math.max(126, pos.current.x)) - pos.current.x // and stays in the window
  return (
    <div ref={el} data-mode={mode} data-mood={isSad ? "sad" : undefined} className="pet-walker fixed top-0 left-0 z-[42] select-none" style={{ width: SIZE, height: SIZE }}>
      {bubble && !isMenuOpen && <div className="pet-bubble">{bubble}</div>}
      {mode === "sleep" && <div className="pet-zzz" aria-hidden><i>z</i><i>z</i><i>z</i></div>}
      {mode === "cheer" && <div className="pet-hearts" aria-hidden><i>♥</i><i>♥</i><i>♥</i></div>}
      {focus && !isMenuOpen && focusCard && <div className="pet-tag" title={focusCard.title}>{focusCard.title}</div>}
      <div className="pet-body-wrap cursor-pointer active:cursor-grabbing" title={`${name} · click for its menu, drag to move it`} onPointerDown={onPointerDown}>
        <PetArt id={id} size={SIZE} doing={mode === "fetch" || mode === "carry" ? "walk" : isSad && mode === "idle" ? "sad" : mode} facing={face} />
      </div>
      {(mode === "work" || mode === "wait") && <Desk isTyping={mode === "work"} />}
      {food && <div className="pet-food" aria-hidden>{food}</div>}
      {isMenuOpen && (
        <PetMenu name={name} color={color} fullness={fullness} energy={energy} isAsleep={mode === "sleep"} canNotify={care.canNotify} isUp={isUp} shift={shift}
          cards={cards} focus={focus} onFeed={feed} onSleep={sleepOrWake} onWork={work}
          onPet={() => (closeMenu(), moment("cheer", pick(["♥", "Hehe", "Purr…", "Again!", ...LINES]), 1200))}
          onNotify={() => (setCare(id, { canNotify: !care.canNotify }), say(care.canNotify ? "I'll keep quiet" : "I'll let you know!"))}
          onPets={() => (closeMenu(), openDialog({ kind: "pets" }))} onBall={hasBall ? () => (closeMenu(), dropBall(), say("Ball away")) : playBall} hasBall={hasBall} />
      )}
      {hasBall && createPortal(
        <div ref={el => {
          ballEl.current = el
          placeBall()
        }} className="pet-ball" onPointerDown={onBallDown} title="Drag it and let go to throw it">
          <TennisBall />
        </div>,
        document.body,
      )}
    </div>
  )
}

function TennisBall() {
  return (
    <svg viewBox="0 0 20 20" width={BALL} height={BALL} aria-hidden>
      <circle cx="10" cy="10" r="9.5" fill="#d4ee3a" />
      <circle cx="10" cy="10" r="9.5" fill="url(#pet-ball-shade)" />
      <path d="M3.2 3.6 C7.6 6.2 7.6 13.8 3.2 16.4 M16.8 3.6 C12.4 6.2 12.4 13.8 16.8 16.4" fill="none" stroke="#fffde8" strokeWidth="1.5" strokeLinecap="round" />
      <defs>
        <radialGradient id="pet-ball-shade" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.6" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// Its laptop when it works (the screen scrolls code), a coffee when it waits.
function Desk({ isTyping }: { isTyping: boolean }) {
  return (
    <svg className={cn("pet-desk", isTyping && "is-typing")} viewBox="0 0 40 26" width="32" height="21" aria-hidden>
      {isTyping ? (
        <>
          <path d="M6 2 h28 a2 2 0 0 1 2 2 v15 h-32 v-15 a2 2 0 0 1 2 -2 Z" fill="#2a2d36" />
          <rect x="7" y="4" width="26" height="13" rx="1" fill="#14161c" />
          <g className="pet-code">
            {[5, 8, 11, 14, 17, 20, 23].map((y, i) => <rect key={y} x={9 + (i % 3) * 2} y={y} width={8 + ((i * 7) % 12)} height="1.4" rx="0.7" fill={["#7fe3ff", "#c3e88d", "#ff9cac", "#ffcb6b"][i % 4]} />)}
          </g>
          <path d="M1 19 h38 l-3 4 h-32 Z" fill="#b9c0cc" />
          <circle cx="20" cy="2" r="0.6" fill="#666" />
        </>
      ) : (
        <>
          <path className="pet-steam" d="M17 4 q-2 3 0 5 q2 2 0 5 M23 4 q-2 3 0 5 q2 2 0 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
          <path d="M13 13 h14 v8 a4 4 0 0 1 -4 4 h-6 a4 4 0 0 1 -4 -4 Z" fill="#fff" stroke="#d6d2c8" strokeWidth="0.8" />
          <path d="M27 15 h2 a3 3 0 0 1 0 6 h-2" fill="none" stroke="#d6d2c8" strokeWidth="1.6" />
          <ellipse cx="20" cy="13.4" rx="6.6" ry="1.2" fill="#6b4226" />
        </>
      )}
    </svg>
  )
}

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="w-12 text-text-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-side"><i className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${value}%`, background: value < 25 ? "var(--bad)" : tone }} /></span>
      <span className="w-8 text-right text-faint tabular-nums">{Math.round(value)}%</span>
    </div>
  )
}

const menuBtn = "flex h-8 items-center gap-2 rounded-[7px] px-2 text-left text-[12.5px] text-text hover:bg-hover disabled:opacity-40"

function PetMenu(props: {
  name: string; color: string; fullness: number; energy: number; isAsleep: boolean; canNotify: boolean; isUp: boolean; shift: number
  cards: Card[]; focus: string | null
  onFeed: () => void; onPet: () => void; onSleep: () => void; onWork: (card: Card | null) => void; onNotify: () => void; onPets: () => void
  onBall: () => void; hasBall: boolean
}) {
  const [isPicking, setPicking] = useState(false)
  const open = props.cards.filter(c => c.column !== "done").sort((a, b) => Number(b.column === "working") - Number(a.column === "working")).slice(0, 10)
  const row = (icon: string, label: ReactNode, onClick: () => void, hint?: string) => (
    <button className={menuBtn} onClick={onClick} onPointerDown={e => e.stopPropagation()}>
      <span className="w-5 text-center text-[14px]">{icon}</span>{label}{hint && <span className="ml-auto text-[11px] text-faint">{hint}</span>}
    </button>
  )
  return (
    <div className={cn("pet-menu", props.isUp ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]")} style={{ marginLeft: props.shift }} onPointerDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <i className="size-2 rounded-full" style={{ background: props.color }} />
        <span className="text-[13px] font-[650]">{props.name}</span>
        <span className="ml-auto text-[11px] text-faint">{props.isAsleep ? "asleep" : props.focus ? "working" : props.fullness < 25 ? "hungry" : props.energy < 25 ? "tired" : "happy"}</span>
      </div>
      <div className="flex flex-col gap-1 px-1 pb-2">
        <Bar label="Food" value={props.fullness} tone="var(--work)" />
        <Bar label="Energy" value={props.energy} tone="var(--brand)" />
      </div>
      <div className="flex flex-col border-t border-line pt-1">
        {isPicking ? (
          <>
            {row("←", "Back", () => setPicking(false))}
            <div className="max-h-[220px] overflow-y-auto">
              {open.length === 0 && <p className="m-0 px-2 py-1.5 text-[12px] text-faint">No session open right now.</p>}
              {open.map(c => (
                <button key={c.id} className={cn(menuBtn, "w-full", props.focus === c.id && "bg-brand-soft")} onClick={() => props.onWork(c)} onPointerDown={e => e.stopPropagation()}>
                  <i className={cn("size-2 shrink-0 rounded-full", c.column === "working" ? "bg-work" : c.column === "asking" ? "bg-ask" : "bg-faint")} />
                  <span className="min-w-0 truncate">{c.title}</span>
                </button>
              ))}
            </div>
            {props.focus && row("☕", "Stop working", () => props.onWork(null))}
          </>
        ) : (
          <>
            {row("🍖", "Feed", props.onFeed, props.fullness > 90 ? "full" : undefined)}
            {row("♥", "Pet", props.onPet)}
            {row("🎾", props.hasBall ? "Put the ball away" : "Play ball", props.onBall)}
            {row(props.isAsleep ? "☀️" : "💤", props.isAsleep ? "Wake up" : "Go to sleep", props.onSleep)}
            {row("💻", props.focus ? "Working with…" : "Work with a session", () => setPicking(true), props.focus ? "change" : undefined)}
            {row(props.canNotify ? "🔔" : "🔕", props.canNotify ? "Notifications on" : "Notifications off", props.onNotify)}
            {row("🐾", "Your pets", props.onPets)}
          </>
        )}
      </div>
    </div>
  )
}
