// The pet out on the board. It wanders the window, rests, says things; it
// gets hungry and tired (care.ts), naps when it runs out of energy and wakes
// when it is full of it again. A click opens its menu: feed it, pet it, put
// it to bed, set it to work with a session, let it notify you. Working, it
// walks to that session's card and sits on it at its laptop; when the
// session asks you something or finishes, it tells you (a toast here, a macOS
// notification when you are in another window). Dragged, it dangles and stays
// where it is dropped. Play ball with it: drag the ball and let go, it runs
// after it and brings it back. With reduced motion it does not wander.
// Two can be out at once (the buddy greets the other now and then); when
// wandering they climb onto the cards. Each grows with your work
// (lib/pet-levels.ts): a turn its session finishes, a PR, being fed and
// played with; a level up is cheered, and a new stage changes how it looks
// (bigger, a glow, sparkles, a crown). "Bring me what waits" runs to the
// session that waits for you and opens it; "Focus 25 min" keeps you company
// for a block of work and tells you when to rest.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { load, keep } from "@/lib/store"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { openSession } from "@/app/open-session"
import { canNotify, showNotice } from "@/features/alerts/prefs"
import { STAGES, levelOf, stageOf } from "@server/pet-levels"
import { PetArt, RARITY_COLOR, petName } from "./art"
import { nextWaiting, turnsEnded } from "./board-sense"
import { FOODS, careOf, cares, energyOf, fullnessOf, setCare } from "./care"
import { Parade, useArrowCode } from "./Parade"
import { conditionOf, earn, pets, rarityOf, watchPets } from "./pets"

type Mode = "idle" | "walk" | "sleep" | "drag" | "cheer" | "alert" | "eat" | "work" | "wait" | "fetch" | "carry" | "deliver"
const FOCUS_MS = 25 * 60_000
// Where each pet out is, so the other can come and say hello.
const where = new Map<string, { x: number; y: number }>()
const GROW: Record<string, number> = { baby: 0.84, young: 1, grown: 1.1, elite: 1.18, legend: 1.26 }
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
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
// The time left, second by second.
function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <>{clock(until - now)}</>
}
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
      toast(n > 1 ? `${n} PRs brought your next pack nearer` : "Your PR brought your next pack nearer", { icon: "📦", description: "Every PR you open takes six hours off the wait" })
    }
    boosts.current = state.prBoosts
  }, [state])
  // A turn a session finished: XP for the pets out, more for the one working with it.
  const cards = useLive(l => l.snapshot?.cards)
  const columns = useRef<Map<string, string> | null>(null)
  useEffect(() => {
    if (!cards) return
    const before = columns.current
    columns.current = new Map(cards.map(c => [c.id, c.column]))
    if (!before || !state) return
    const minute = Math.floor(Date.now() / 60_000)
    for (const cardId of turnsEnded(before, cards))
      for (const pet of [state.active, state.buddy].filter((p): p is string => !!p)) {
        earn("turn", `turn:${cardId}:${minute}:${pet}`, pet)
        if (careOf(pet).focus === cardId) earn("focusTurn", `focusTurn:${cardId}:${minute}:${pet}`, pet)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])
  const [isParading, setParading] = useState(false)
  const startParade = useCallback(() => setParading(true), [])
  const endParade = useCallback(() => setParading(false), [])
  useArrowCode(startParade)
  const active = state?.active
  const buddy = state?.buddy
  return (
    <>
      {active && state && <Walker key={active} id={active} slot="active" other={buddy ?? null} color={RARITY_COLOR[rarityOf(state, active)]} />}
      {buddy && state && <Walker key={buddy} id={buddy} slot="buddy" other={active ?? null} color={RARITY_COLOR[rarityOf(state, buddy)]} />}
      {isParading && state && <Parade state={state} onDone={endParade} />}
    </>
  )
}

// A visible card on the board to climb onto: its top edge.
function perchOnCard() {
  const seen = [...document.querySelectorAll<HTMLElement>("article[data-id]")].map(el => el.getBoundingClientRect())
    .filter(r => r.width > 80 && r.top > 90 && r.bottom < innerHeight - 20 && r.left > 0 && r.right < innerWidth)
  if (!seen.length) return null
  const r = seen[Math.floor(Math.random() * seen.length)]!
  return clamp({ x: r.left + 30 + Math.random() * (r.width - 60), y: r.top + 2 })
}

function Walker({ id, slot, other, color }: { id: string; slot: "active" | "buddy"; other: string | null; color: string }) {
  const name = petName(id)
  const el = useRef<HTMLDivElement>(null)
  const posKey = slot === "buddy" ? "petPos2" : "petPos"
  const pos = useRef(clamp(load(posKey, { x: innerWidth - (slot === "buddy" ? 230 : 140), y: innerHeight - 12 })))
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
  const otherRef = useRef(other)
  otherRef.current = other
  const greeting = useRef(false)
  const ball = useRef<Ball | null>(null)
  const ballEl = useRef<HTMLDivElement>(null)
  const [hasBall, setHasBall] = useState(false)
  const isStill = matchMedia("(prefers-reduced-motion: reduce)").matches
  // Its level and stage; a level up is cheered, a new stage more.
  const xp = pets.use()?.xp[id] ?? 0
  const lv = levelOf(xp)
  const lastLevel = useRef(lv.level)
  const [grew, setGrew] = useState(0) // a burst when it levels up
  // A session to bring you (Bring me what waits), and a focus block running.
  const deliverTo = useRef<string | null>(null)
  const focusUntil = care.focusUntil && care.focusUntil > now ? care.focusUntil : null
  const focusRef2 = useRef(focusUntil)
  focusRef2.current = focusUntil

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
    where.set(id, pos.current)
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
      // Bringing you a session: to its card, then it opens.
      if (deliverTo.current) {
        const to = deliverTo.current
        if (m !== "deliver") setMode("deliver")
        if (isStill || go(seatOf(to).at, RUSH * 1.4, dt)) {
          deliverTo.current = null
          openSession(to)
          earn("delivered", `delivered:${id}:${to}:${Math.floor(Date.now() / 60_000)}`, id)
          moment("cheer", pick(["Here it is!", "This one waits for you", "Found it!"]), 1200)
        }
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
            earn("fetched", `fetched:${id}:${Math.floor(Date.now() / 60_000)}`, id)
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
          if (greeting.current) {
            greeting.current = false
            const o = otherRef.current ? where.get(otherRef.current) : undefined
            if (o && Math.hypot(o.x - pos.current.x, o.y - pos.current.y) < 90) {
              facing.current = o.x > pos.current.x ? 1 : -1
              setFace(facing.current)
              place()
              moment("cheer", pick(["Hi buddy!", "♥", "Wanna play?", "Hey you!", "*boop*"]), 1400)
            }
          }
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
      } else if (m === "idle" && !cardId && !isStill && !focusRef2.current) {
        if (Date.now() - lastActive.current > IDLE_NAP) setMode("sleep")
        else if (t > restUntil) {
          const b = bounds()
          const reach = 380
          const roll = Math.random()
          const friend = otherRef.current ? where.get(otherRef.current) : undefined
          // Now and then to its buddy, to say hello; or onto a card, for the view.
          if (friend && roll < 0.18) {
            target.current = clamp({ x: friend.x + (friend.x > pos.current.x ? -46 : 46), y: friend.y })
            greeting.current = true
          } else target.current = (roll < 0.45 && perchOnCard()) || clamp({ x: pos.current.x + (Math.random() - 0.5) * 2 * reach, y: Math.random() < 0.6 ? b.maxY - Math.random() * 30 : pos.current.y + (Math.random() - 0.5) * reach })
          setMode("walk")
          if (!greeting.current && Math.random() < 0.12) say(pick(LINES))
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
      keep(posKey, pos.current)
      where.delete(id)
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
      // A focus block over: time for a break.
      if (c.focusUntil && c.focusUntil <= t) {
        setCare(id, { focusUntil: null }, t)
        earn("focusDone", `focusDone:${id}:${c.focusUntil}`, id)
        moment("cheer", "", 1600)
        notice(pick(["25 minutes done. Time for a break! ☕", "Great focus! Stretch a little", "Block done. Water, then back to it?"]))
      }
      if (modeRef.current === "work" && Math.random() < 0.06) say(pick(WORK_LINES), 2200)
      else if (isHungry && modeRef.current === "idle" && Math.random() < 0.03) say("I'm hungry…")
    }, 3000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // A level up: cheered; a new stage, more so (and you are told).
  useEffect(() => {
    if (lv.level <= lastLevel.current) return void (lastLevel.current = lv.level)
    const isNewStage = stageOf(lv.level).stage !== stageOf(lastLevel.current).stage
    lastLevel.current = lv.level
    setGrew(g => g + 1)
    moment("cheer", isNewStage ? `I'm ${stageOf(lv.level).name} now!` : `Level ${lv.level}!`, 2200)
    toast(isNewStage ? `${name} grew: ${stageOf(lv.level).name}, level ${lv.level}` : `${name} reached level ${lv.level}`, {
      icon: <PetArt id={id} size={26} />, description: lv.level % 5 === 0 ? "Every fifth level brings a pack 📦" : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lv.level])

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
    earn("fed", `fed:${id}:${Date.now()}`, id)
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

  // To the session that waits for you, and it opens.
  const bring = () => {
    closeMenu()
    const card = nextWaiting(cards)
    if (!card) return say(pick(["Nobody waits for you. Nice!", "All clear!"]))
    if (careOf(id).isAsleep) setCare(id, { isAsleep: false })
    if (focusRef.current) setCare(id, { focus: null })
    target.current = null
    deliverTo.current = card.id
    say(`To “${card.title}”!`, 1600)
  }
  // A focus block: it sits by you for 25 minutes, then tells you to rest.
  const toggleFocus = () => {
    closeMenu()
    if (focusUntil) return void (setCare(id, { focusUntil: null }), say("Focus stopped"))
    setCare(id, { focusUntil: Date.now() + FOCUS_MS, isAsleep: false })
    target.current = null
    setMode("idle")
    say("25 minutes. You got this!", 2400)
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
        keep(posKey, pos.current)
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
    <div ref={el} data-mode={mode === "deliver" ? "walk" : mode} data-mood={isSad ? "sad" : undefined} data-stage={lv.stage} className="pet-walker fixed top-0 left-0 z-[42] select-none"
      style={{ width: SIZE, height: SIZE, "--rarity": color, "--grow": GROW[lv.stage] } as React.CSSProperties}>
      <Evolution stage={lv.stage} />
      {grew > 0 && <div key={grew} className="pet-levelup" aria-hidden>{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />)}</div>}
      {bubble && !isMenuOpen && <div className="pet-bubble">{bubble}</div>}
      {mode === "sleep" && <div className="pet-zzz" aria-hidden><i>z</i><i>z</i><i>z</i></div>}
      {mode === "cheer" && <div className="pet-hearts" aria-hidden><i>♥</i><i>♥</i><i>♥</i></div>}
      {focus && !isMenuOpen && focusCard && <div className="pet-tag" title={focusCard.title}>{focusCard.title}</div>}
      {focusUntil && !focus && !isMenuOpen && <div className="pet-tag tabular-nums" title="Focus block">⏱ <Countdown until={focusUntil} /></div>}
      <div className="pet-body-wrap cursor-pointer active:cursor-grabbing" title={`${name} · click for its menu, drag to move it`} onPointerDown={onPointerDown}>
        <div className="pet-grow">{lv.stage === "legend" && <Crown />}<PetArt id={id} size={SIZE} doing={mode === "fetch" || mode === "carry" || mode === "deliver" ? "walk" : isSad && mode === "idle" ? "sad" : mode} facing={face} /></div>
      </div>
      {(mode === "work" || mode === "wait" || (focusUntil && mode === "idle")) && <Desk isTyping={mode === "work" || !!focusUntil} />}
      {food && <div className="pet-food" aria-hidden>{food}</div>}
      {isMenuOpen && (
        <PetMenu name={name} color={color} fullness={fullness} energy={energy} isAsleep={mode === "sleep"} canNotify={care.canNotify} isUp={isUp} shift={shift}
          cards={cards} focus={focus} onFeed={feed} onSleep={sleepOrWake} onWork={work}
          onPet={() => (closeMenu(), earn("petted", `petted:${id}:${Math.floor(Date.now() / 600_000)}`, id), moment("cheer", pick(["♥", "Hehe", "Purr…", "Again!", ...LINES]), 1200))}
          level={lv} condition={conditionOf(id)} waiting={nextWaiting(cards)} focusUntil={focusUntil} onBring={bring} onFocus={toggleFocus}
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

// How far it has grown, around it: a glow on the ground (grown), two sparks
// circling it (elite), and a crown (legend, drawn on its head).
function Evolution({ stage }: { stage: string }) {
  const at = STAGES.findIndex(s => s.stage === stage)
  if (at < 2) return null
  return (
    <div className="pet-evo" aria-hidden>
      <i className="pet-evo-glow" />
      {at >= 3 && <><i className="pet-evo-spark" /><i className="pet-evo-spark" style={{ animationDelay: "-1.6s" }} /></>}
    </div>
  )
}

function Crown() {
  return (
    <svg className="pet-crown" viewBox="0 0 24 14" width="22" height="13" aria-hidden>
      <path d="M2 12 L3.5 3 L8.5 8 L12 1.5 L15.5 8 L20.5 3 L22 12 Z" fill="#ffc83d" stroke="#d9931a" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="1.6" fill="#ff5b7f" /><circle cx="6.5" cy="10" r="1" fill="#5bc8ff" /><circle cx="17.5" cy="10" r="1" fill="#5bc8ff" />
    </svg>
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

const BY = { well: "×1.5 XP", ok: "", poorly: "×0.5 XP" } as const

function PetMenu(props: {
  name: string; color: string; fullness: number; energy: number; isAsleep: boolean; canNotify: boolean; isUp: boolean; shift: number
  cards: Card[]; focus: string | null
  onFeed: () => void; onPet: () => void; onSleep: () => void; onWork: (card: Card | null) => void; onNotify: () => void; onPets: () => void
  onBall: () => void; hasBall: boolean
  level: ReturnType<typeof levelOf>; condition: "well" | "ok" | "poorly"; waiting: Card | null; focusUntil: number | null
  onBring: () => void; onFocus: () => void
}) {
  const [isPicking, setPicking] = useState(false)
  const open = props.cards.filter(c => c.column !== "done").sort((a, b) => Number(b.column === "working") - Number(a.column === "working")).slice(0, 10)
  const row = (icon: string, label: ReactNode, onClick: () => void, hint?: ReactNode) => (
    <button className={menuBtn} onClick={onClick} onPointerDown={e => e.stopPropagation()}>
      <span className="w-5 text-center text-[14px]">{icon}</span>{label}{hint && <span className="ml-auto text-[11px] text-faint">{hint}</span>}
    </button>
  )
  return (
    <div className={cn("pet-menu", props.isUp ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]")} style={{ marginLeft: props.shift }} onPointerDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <i className="size-2 rounded-full" style={{ background: props.color }} />
        <span className="min-w-0 truncate text-[13px] font-[650]">{props.name}</span>
        <span className="ml-auto shrink-0 text-[11px] text-faint">{props.isAsleep ? "asleep" : props.focus ? "working" : props.fullness < 25 ? "hungry" : props.energy < 25 ? "tired" : "happy"}</span>
      </div>
      <div className="flex flex-col gap-1 px-1 pb-2">
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="w-12 font-semibold text-text">Lv {props.level.level}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-side"><i className="block h-full rounded-full transition-[width] duration-500" style={{ width: props.level.need ? `${(props.level.into / props.level.need) * 100}%` : "100%", background: props.color }} /></span>
          <span className="w-8 text-right text-faint">{stageOf(props.level.level).name}</span>
        </div>
        {props.condition !== "ok" && <span className={cn("self-end text-[10.5px]", props.condition === "well" ? "text-work" : "text-bad")}>{BY[props.condition]}</span>}
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
            {row("📬", "Bring me what waits", props.onBring, props.waiting ? (props.waiting.column === "asking" ? "asking" : "to review") : "none")}
            {row("⏱", props.focusUntil ? "Stop the focus" : "Focus 25 min", props.onFocus, props.focusUntil ? <Countdown until={props.focusUntil} /> : undefined)}
            {row(props.canNotify ? "🔔" : "🔕", props.canNotify ? "Notifications on" : "Notifications off", props.onNotify)}
            {row("🐾", "Your pets", props.onPets)}
          </>
        )}
      </div>
    </div>
  )
}
