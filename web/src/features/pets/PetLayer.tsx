// The pets out on the board. They ask nothing of you: what they do shows how
// your work goes (mood.ts). Their energy is what is left of your 5-hour
// limit: full, they run; nearly spent, they drag their feet; out of tokens,
// they sleep until the limit resets. They sleep at night too, and stay home
// at the weekend. A session that works has a pet at its laptop on its card;
// one that asks you something has a pet standing in front of it, looking.
// With nothing going on, the two play together: tag, a nap side by side,
// one on the other's head; a merged PR is a high five.
//
// The ball (ball.ts) is for both: thrown, the two race for it and the winner
// brings it back; handed to one of them (let go on it), the two throw it to
// each other. A pet can be dragged, and flung (fling.ts). A click opens its
// menu: pet it, play ball, your pets. Each grows with your work only
// (lib/pet-levels.ts): a turn its session finishes, a PR.
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "@/lib/notify"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { createStore, load, keep } from "@/lib/store"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { PACK_EVERY, STAGES, levelOf, stageOf } from "@server/pet-levels"
import { PetArt, RARITY_COLOR, nicknames, petName, realName, setNickname } from "./art"
import { turnsEnded } from "./board-sense"
import { BALL, type Ball, ball, floorOf, roll, throwTo } from "./ball"
import { type Post, type Rest, energyOf, isQuiet, postsOf, restOf } from "./mood"
import { Parade, useArrowCode } from "./Parade"
import { sizes } from "./size"
import { type Flight, flingOf, flyStep } from "./fling"
import { earn, pets, rarityOf, watchPets } from "./pets"

type Mode = "idle" | "walk" | "sleep" | "drag" | "cheer" | "alert" | "work" | "watch" | "fetch" | "carry" | "shoved" | "fly"
// What the two play at when nothing goes on; `it` chases, or climbs.
type Game = { game: "chase" | "nap" | "stack" | "five"; it: string; until: number; frozenUntil?: number }
const together = createStore<Game | null>(null)

// Where each pet out is, so the other can find it.
const where = new Map<string, { x: number; y: number }>()
const GROW: Record<string, number> = { baby: 0.84, young: 1, grown: 1.1, elite: 1.18, legend: 1.26, mythic: 1.32 }
const SIZE = 60
const SPEED = 52 // px a second
const RUSH = 150 // to its session's card
const CHASE = 270 // after the ball
const BORED_AFTER = 30_000 // the ball left lying: put away
const GAME_THROWS = 12 // a game of catch: this many throws, then it ends
const IDLE_NAP = 90_000 // nobody moves the mouse: a nap
const LINES = ["Hi!", "♪ ♫", "Ship it!", "Any PRs to review?", "I'm helping!", "Bugs? Where?", "*happy noises*", "You got this"]
const TIRED_LINES = ["*yawn*", "Easy on the tokens…", "So sleepy…", "Running low…"]
const WORK_LINES = ["Reading the logs…", "Hmm, interesting", "Compiling…", "Tests are running", "Typing very fast", "Almost there…", "LGTM so far"]
const WAKE_LINES: Record<Exclude<Rest, null>, string[]> = { night: ["Good morning!", "*stretches*"], spent: ["Tokens are back!", "Full of energy!"], weekend: ["Back to work!"] }
const SLEEP_LINES: Record<Exclude<Rest, null>, string> = { night: "Good night 💤", spent: "Out of tokens… zzz", weekend: "See you Monday!" }

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
// A session's panel open at the right is a wall: the pets stay out of it, and
// one in its way as it slides in is shoved aside, like by a drawer. Where its
// left edge is now (the window's, with no panel, or one that fills the window).
const wallX = () => {
  const r = document.querySelector("[data-panel]")?.getBoundingClientRect()
  return r && r.left > 240 ? Math.min(innerWidth, r.left) : innerWidth
}
const bounds = () => ({ minX: SIZE / 2 + 8, maxX: wallX() - SIZE / 2 - 8, minY: SIZE + 64, maxY: innerHeight - 6 })
const clamp = (p: { x: number; y: number }) => {
  const b = bounds()
  return { x: Math.min(b.maxX, Math.max(b.minX, p.x)), y: Math.min(b.maxY, Math.max(b.minY, p.y)) }
}
// Where it keeps a session company: at its laptop on the card's top right
// (working), or standing in front of it, looking (asking). Null when the
// card is not on screen: it wanders, with the session's name on its tag.
function seatOf(post: NonNullable<Post>) {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(post.cardId)}"]`)) {
    const r = el.getBoundingClientRect()
    if (!r.width || r.bottom < 70 || r.top > innerHeight - 20 || r.right < 0 || r.left > wallX()) continue
    return post.kind === "asking" ? clamp({ x: r.left + r.width / 2, y: r.bottom + SIZE * 0.9 }) : clamp({ x: r.right - 50, y: r.top + 16 })
  }
  return null
}

export function PetLayer() {
  const state = pets.use()
  useEffect(watchPets, [])
  // A PR, or a Jira ticket that brought no pack of its own, that brought the next pack nearer.
  const boosts = useRef<number | null>(null)
  const tickets = useRef<number | null>(null)
  useEffect(() => {
    if (!state) return
    if (boosts.current !== null && state.prBoosts > boosts.current) {
      const n = state.prBoosts - boosts.current
      toast(n > 1 ? `${n} PRs brought your next pack nearer` : "Your PR brought your next pack nearer", { icon: "📦", description: "Every PR you open takes six hours off the wait" })
    }
    boosts.current = state.prBoosts
    const nearer = (state.ticketBoosts ?? 0) - (state.ticketPacks ?? 0)
    if (tickets.current !== null && nearer > tickets.current) {
      const n = nearer - tickets.current
      toast(n > 1 ? `${n} Jira tickets brought your next pack nearer` : "Your Jira ticket brought your next pack nearer", { icon: "🎟️", description: "Each ticket takes three hours off the wait, and one in eight brings a pack at once" })
    }
    tickets.current = nearer
  }, [state])

  const cards = useLive(l => l.snapshot?.cards) ?? []
  const limits = useLive(l => l.snapshot?.limits)
  const now = useNow()
  const energy = energyOf(limits, now)
  const rest = restOf(energy, new Date(now))
  const five = limits?.windows.find(w => w.kind === "five_hour")?.resetsAt
  const wakeAt = rest === "spent" && five ? `until ${hhmm(Date.parse(five))}` : rest === "night" ? "until 7:00" : null
  const active = state?.active ?? null
  const buddy = state?.buddy ?? null
  const out = [active, buddy].filter((p): p is string => !!p)
  const posts = postsOf(cards, rest ? [] : out)

  // A turn a session finished: XP for the pets out, more for the one that kept it company.
  const columns = useRef<Map<string, string> | null>(null)
  const postsRef = useRef(posts)
  postsRef.current = posts
  useEffect(() => {
    const before = columns.current
    columns.current = new Map(cards.map(c => [c.id, c.column]))
    if (!before || !out.length) return
    const minute = Math.floor(Date.now() / 60_000)
    for (const cardId of turnsEnded(before, cards))
      for (const pet of out) {
        earn("turn", `turn:${cardId}:${minute}:${pet}`, pet)
        if (postsRef.current.get(pet)?.cardId === cardId) earn("focusTurn", `focusTurn:${cardId}:${minute}:${pet}`, pet)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])

  // The two play when nothing goes on, now and then; they stop once a session works or asks, or the ball comes out.
  const quiet = isQuiet(cards)
  const hasBall = !!ball.use()
  const isTwo = !!active && !!buddy
  useEffect(() => {
    if (!isTwo || !quiet || rest || hasBall) return void (together.get()?.game !== "five" && together.set(null))
    const timer = setInterval(() => {
      const g = together.get()
      if (g && Date.now() < g.until) return
      if (g) return void together.set(null)
      if (document.hidden || Math.random() > 0.3) return
      const game = pick(["chase", "chase", "nap", "stack"] as const)
      together.set({ game, it: pick([active!, buddy!]), until: Date.now() + (game === "nap" ? 45_000 : 16_000 + Math.random() * 8000) })
    }, 5000)
    return () => clearInterval(timer)
  }, [isTwo, quiet, rest, hasBall, active, buddy])
  // A PR merged: a high five, when two are out and awake.
  const merges = state?.merges
  const lastMerges = useRef(merges)
  useEffect(() => {
    if (merges === undefined) return
    if (lastMerges.current !== undefined && merges > lastMerges.current && isTwo && !rest) together.set({ game: "five", it: active!, until: Date.now() + 9000 })
    lastMerges.current = merges
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merges])

  const [isParading, setParading] = useState(false)
  const startParade = useCallback(() => setParading(true), [])
  const endParade = useCallback(() => setParading(false), [])
  useArrowCode(startParade)
  if (!state) return null
  const isHome = rest !== "weekend"
  const walker = (id: string, slot: "active" | "buddy", other: string | null) => (
    <Walker key={id} id={id} slot={slot} other={other} color={RARITY_COLOR[rarityOf(state, id)]} energy={energy} rest={rest} wakeAt={wakeAt}
      post={posts.get(id) ?? null} postTitle={cards.find(c => c.id === posts.get(id)?.cardId)?.title ?? null} />
  )
  return (
    <>
      {isHome && active && walker(active, "active", buddy)}
      {isHome && buddy && walker(buddy, "buddy", active)}
      {isHome && hasBall && <BallLayer pets={out} />}
      {isParading && <Parade state={state} onDone={endParade} />}
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

type WalkerProps = { id: string; slot: "active" | "buddy"; other: string | null; color: string; energy: number; rest: Rest; wakeAt: string | null; post: Post; postTitle: string | null }

function Walker({ id, slot, other, color, energy, rest, wakeAt, post, postTitle }: WalkerProps) {
  nicknames.use()
  const name = petName(id)
  const el = useRef<HTMLDivElement>(null)
  const posKey = slot === "buddy" ? "petPos2" : "petPos"
  const pos = useRef(clamp(load(posKey, { x: innerWidth - (slot === "buddy" ? 230 : 140), y: innerHeight - 12 })))
  const target = useRef<{ x: number; y: number } | null>(null)
  const facing = useRef(1)
  const [face, setFace] = useState(1) // for a community pet, whose sheet runs left or right
  const lastActive = useRef(Date.now())
  const [mode, setModeState] = useState<Mode>(rest ? "sleep" : "idle")
  const modeRef = useRef<Mode>(mode)
  const [bubble, setBubble] = useState<string | null>(null)
  const [isMenuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(false)
  const timers = useRef<number[]>([])
  const flight = useRef<Flight | null>(null) // thrown: in the air, or rolling to a stop
  // What it reads from the board, kept current for the walk.
  const live = useRef({ other, energy, rest, post })
  live.current = { other, energy, rest, post }
  const greeting = useRef(false)
  const onTop = useRef(false) // sitting on the other's head
  // Shoved by the panel: its speed sideways, its hop, how it leans, and what it did before.
  const shove = useRef<{ vx: number; hop: number; vh: number; tilt: number; was: Mode } | null>(null)
  const isStill = matchMedia("(prefers-reduced-motion: reduce)").matches
  const hasBall = !!ball.use()
  const game = together.use()
  // Its level and stage; a level up is cheered, a new stage more.
  const xp = pets.use()?.xp[id] ?? 0
  const size = sizes.use()[id] ?? 1 // as you set it in Your pets
  const lv = levelOf(xp)
  const lastLevel = useRef(lv.level)
  const [grew, setGrew] = useState(0) // a burst when it levels up
  const [isTransforming, setTransforming] = useState(false) // a new stage from elite on: its aura flares

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
    if (text) say(text, ms + 800)
    later(ms, () => modeRef.current === m && setMode("idle"))
  }

  const place = () => {
    const node = el.current
    if (!node) return
    const s = shove.current
    node.style.transform = `translate3d(${pos.current.x - SIZE / 2}px, ${pos.current.y - SIZE - (s?.hop ?? 0)}px, 0) rotate(${s?.tilt ?? flight.current?.angle ?? 0}deg)`
    node.style.zIndex = onTop.current ? "43" : ""
    where.set(id, pos.current)
    node.style.setProperty("--face", String(facing.current))
  }
  const look = (x: number) => {
    const dir = x > pos.current.x ? 1 : -1
    if (dir === facing.current) return
    facing.current = dir
    setFace(dir)
    place()
  }

  // The walk: one frame at a time. First what it cannot help (flung, shoved,
  // asleep), then the ball, then a game with the other, then its session,
  // then wandering.
  useEffect(() => {
    place()
    let frame = 0
    let last = performance.now()
    let restUntil = performance.now() + 1500
    let seatAt = 0
    let seat: { x: number; y: number } | null = null // its session's card, read again now and then
    let wall = wallX()
    // One step toward a point; answers whether it got there.
    const go = (to: { x: number; y: number }, speed: number, dt: number) => {
      const dx = to.x - pos.current.x
      const dy = to.y - pos.current.y
      const dist = Math.hypot(dx, dy)
      if (dist < 3 || isStill) {
        if (isStill) pos.current = to
        place()
        return true
      }
      const move = Math.min(dist, speed * dt)
      pos.current = { x: pos.current.x + (dx / dist) * move, y: pos.current.y + (dy / dist) * move }
      if (Math.abs(dx) > 1) look(to.x)
      place()
      return false
    }
    // Its pace: as much as your limit has left.
    const pace = () => (live.current.energy < 25 ? 0.55 : live.current.energy > 75 ? 1.25 : 1)
    const mouth = () => ({ x: pos.current.x + facing.current * 15, y: pos.current.y - SIZE * 0.42 })
    const idle = () => modeRef.current !== "idle" && setMode("idle")

    // The ball: watched in your hand, raced for once thrown, brought back, or thrown between the two.
    const playBall = (b: Ball, dt: number) => {
      const m = modeRef.current
      const other = live.current.other
      const now = Date.now()
      if (b.state === "held") return look(b.x), idle(), true
      if (b.state === "carried") {
        if (b.holder !== id) {
          if (m === "fetch") moment("alert", pick(["Aww!", "No fair!", "Next time!"]), 900)
          else idle()
          look(b.x)
          return true
        }
        Object.assign(b, mouth(), { spin: 0 })
        if (m !== "carry") setMode("carry")
        if (go(clamp(b.from), CHASE * 0.75 * pace(), dt)) {
          Object.assign(b, { state: "loose", isThrown: false, holder: null, at: now, vx: facing.current * 60, vy: -260 })
          moment("cheer", pick(["Again! Again!", "Throw it again!", "Here you go!", "One more?", "♥"]), 900)
        }
        return true
      }
      if (b.state === "game") {
        if (b.holder !== id) return look(b.x), idle(), true
        Object.assign(b, mouth(), { spin: 0 })
        idle()
        const partner = other ? where.get(other) : undefined
        if (partner) look(partner.x)
        if (now - b.at < 650) return true
        if (!partner || b.throws >= GAME_THROWS) {
          Object.assign(b, { state: "loose", isThrown: false, holder: null, at: now, vx: facing.current * 60, vy: -200 })
          moment("cheer", partner ? pick(["Good game!", "That was fun!", "Again later?"]) : pick(["Thanks!", "For me? ♥"]), 1200)
          return true
        }
        const aim = throwTo(mouth(), { x: partner.x - facing.current * 6, y: partner.y - SIZE * 0.45 })
        Object.assign(b, { state: "loose", isThrown: true, holder: other, vx: aim.vx, vy: aim.vy, at: now, throws: b.throws + 1 })
        if (Math.random() < 0.3) say(pick(["Catch!", "Yours!", "Hup!"]), 900)
        return true
      }
      // Loose: lying there, or thrown to the other.
      if (!b.isThrown || (b.holder && b.holder !== id)) return look(b.x), idle(), true
      const isMine = b.holder === id // thrown to me in a game: wait for it while it flies
      if (isMine && b.y < floorOf() - 2) look(b.x), idle()
      else {
        if (m !== "fetch") setMode("fetch")
        go(clamp({ x: b.x, y: b.y + BALL / 2 }), CHASE * pace(), dt)
      }
      const at = mouth()
      if (Math.hypot(b.x - at.x, b.y - at.y) < SIZE * 0.6 || Math.hypot(b.x - pos.current.x, b.y - (pos.current.y - BALL / 2)) < SIZE * 0.55) {
        if (isMine) Object.assign(b, { state: "game", holder: id, at: now, vx: 0, vy: 0 })
        else {
          Object.assign(b, { state: "carried", holder: id, at: now, vx: 0, vy: 0 })
          if (Math.random() < 0.5) say(pick(["Got it!", "Mine!", "Hehe"]), 1200)
        }
      }
      return true
    }

    // A game with the other: tag, a nap side by side, one on the other's head, a high five.
    const playTogether = (g: Game, dt: number) => {
      const other = live.current.other
      const o = other ? where.get(other) : undefined
      if (!other || !o) return false
      const m = modeRef.current
      const floor = bounds().maxY
      if (g.game === "chase") {
        if (m !== "walk") setMode("walk")
        if (g.it !== id) {
          const box = bounds()
          let away = pos.current.x + (pos.current.x >= o.x ? 170 : -170)
          if (away < box.minX + 20 || away > box.maxX - 20) away = o.x + (pos.current.x >= o.x ? -220 : 220) // cornered: past it
          go(clamp({ x: away, y: floor }), SPEED * 2 * pace(), dt)
          return true
        }
        if ((g.frozenUntil ?? 0) > Date.now()) return true
        go({ x: o.x, y: o.y }, SPEED * 2.1 * pace(), dt)
        if (Math.hypot(o.x - pos.current.x, o.y - pos.current.y) < 34) {
          together.set({ ...g, it: other, frozenUntil: Date.now() + 1300 })
          moment("cheer", pick(["Tag!", "You're it!", "Gotcha!"]), 700)
        }
        return true
      }
      if (g.game === "nap" || g.game === "five") {
        if (m === "sleep" || m === "cheer") return true
        if (m !== "walk") setMode("walk")
        const spot = clamp({ x: (pos.current.x + o.x) / 2 + (pos.current.x <= o.x ? -24 : 24), y: floor })
        if (go(spot, SPEED * 1.5 * pace(), dt) && Math.abs(o.x - pos.current.x) < 70) {
          look(o.x)
          if (g.game === "nap") setMode("sleep")
          else {
            moment("cheer", "High five! ✋", 1500)
            later(1700, () => together.get() === g && together.set(null))
          }
        }
        return true
      }
      // stack: the one who climbs, and the one who holds still under it.
      if (g.it !== id) return idle(), true
      if (onTop.current) {
        pos.current = { x: o.x, y: o.y - SIZE * 0.62 }
        place()
        return true
      }
      if (m !== "walk") setMode("walk")
      if (go({ x: o.x, y: o.y }, SPEED * 1.6, dt) || Math.hypot(o.x - pos.current.x, o.y - pos.current.y) < 16) {
        onTop.current = true
        moment("cheer", pick(["Look how tall!", "Up here!", "Hehe, comfy"]), 1300)
      }
      return true
    }

    const step = (t: number) => {
      frame = requestAnimationFrame(step)
      const rawDt = (t - last) / 1000
      const dt = Math.min(0.05, rawDt)
      last = t
      const m = modeRef.current
      // The panel's edge, and how fast it comes (px a second; below zero, it opens).
      const nowWall = wallX()
      const wallV = (nowWall - wall) / Math.max(0.001, rawDt)
      wall = nowWall
      // Thrown: it flies, in small steps, and gets up where it stops.
      const fl = flight.current
      if (fl) {
        const box = bounds()
        let next = fl
        let landed = false
        for (let left = Math.min(0.25, rawDt); left > 0 && !landed; left -= 0.016) ({ flight: next, landed } = flyStep(next, Math.min(0.016, left), box))
        flight.current = landed ? null : next
        pos.current = { x: next.x, y: next.y }
        place()
        if (landed) {
          keep(posKey, pos.current)
          moment(Math.random() < 0.5 ? "cheer" : "alert", pick(["Again! Again!", "Whoa…", "*dizzy*", "I can fly!", "That was fun!", "Ouch… again?"]), 1300)
        }
        return
      }
      // The panel against it: pushed out, and while the panel slides in, sent flying.
      const edge = wall - SIZE / 2 - 8
      if (m !== "drag" && pos.current.x > edge) {
        pos.current = { ...pos.current, x: Math.max(SIZE / 2 + 8, edge) }
        if (wallV < -60) {
          const push = Math.min(-900, Math.max(-1600, wallV * 1.2))
          if (!shove.current) {
            shove.current = { vx: push, hop: 0, vh: 560, tilt: 0, was: m }
            target.current = null
            onTop.current = false
            if (menuRef.current) closeMenu()
            setMode("shoved")
            if (facing.current !== 1) (facing.current = 1), setFace(1)
          } else shove.current.vx = Math.min(shove.current.vx, push)
        }
        place()
      }
      const s = shove.current
      if (s && m === "drag") shove.current = null
      else if (s) {
        // Sliding away from the panel, hopping, leaning back, until it stops.
        s.vx *= Math.exp(-2.6 * dt)
        const minX = SIZE / 2 + 8
        pos.current = { ...pos.current, x: Math.min(edge, pos.current.x + s.vx * dt) }
        if (pos.current.x < minX) (pos.current.x = minX), (s.vx = Math.abs(s.vx) * 0.35)
        s.vh -= 2200 * dt
        s.hop += s.vh * dt
        if (s.hop <= 0) (s.hop = 0), (s.vh = s.vh < -260 ? -s.vh * 0.42 : 0)
        s.tilt = Math.max(-38, Math.min(38, -s.vx / 32))
        place()
        if (Math.abs(s.vx) < 18 && s.hop === 0 && s.vh === 0) {
          shove.current = null
          place()
          if (s.was === "sleep") (setMode("sleep"), say("Zzz…?", 1600))
          else moment("alert", pick(["Hey!", "Whoa!", "Rude!", "I was here first!", "Ouch!", "Watch it!"]), 1000)
        }
        return
      }
      if (menuRef.current || m === "drag" || m === "cheer" || m === "alert") return
      // Night, out of tokens: asleep, whatever else goes on.
      if (live.current.rest) {
        if (m !== "sleep") (target.current = null), (onTop.current = false), setMode("sleep")
        return
      }
      const b = ball.get()
      if (b && playBall(b, dt)) return
      const g = together.get()
      if (g && !b && playTogether(g, dt)) return
      if (onTop.current) (onTop.current = false), place()
      if (m === "sleep" && Date.now() - lastActive.current < IDLE_NAP) setMode("idle") // the nap of a game, over
      // Its session: at its laptop on the card, or in front of it, looking.
      const post = live.current.post
      if (post && t > seatAt) (seatAt = t + 400), (seat = seatOf(post))
      if (post && seat) {
        if (go(seat, RUSH * pace(), dt)) {
          const want: Mode = post.kind === "working" ? "work" : "watch"
          if (m !== want) setMode(want)
        } else if (m !== "walk") setMode("walk")
        return
      }
      if (m === "work" || m === "watch") (target.current = null), setMode("idle")
      if (modeRef.current === "walk" && target.current) {
        if (go(target.current, SPEED * pace(), dt)) {
          target.current = null
          setMode("idle")
          restUntil = t + 2000 + Math.random() * 6000
          if (greeting.current) {
            greeting.current = false
            const o = live.current.other ? where.get(live.current.other) : undefined
            if (o && Math.hypot(o.x - pos.current.x, o.y - pos.current.y) < 90) (look(o.x), moment("cheer", pick(["Hi buddy!", "♥", "Wanna play?", "Hey you!", "*boop*"]), 1400))
          }
        }
      } else if (modeRef.current === "walk") setMode("idle")
      else if (modeRef.current === "idle" && !isStill) {
        if (Date.now() - lastActive.current > IDLE_NAP) setMode("sleep")
        else if (t > restUntil) {
          const box = bounds()
          const reach = 380
          const dice = Math.random()
          const friend = live.current.other ? where.get(live.current.other) : undefined
          // Now and then to its buddy, to say hello; or onto a card, for the view.
          if (friend && dice < 0.18) {
            target.current = clamp({ x: friend.x + (friend.x > pos.current.x ? -46 : 46), y: friend.y })
            greeting.current = true
          } else target.current = (dice < 0.45 && perchOnCard()) || clamp({ x: pos.current.x + (Math.random() - 0.5) * 2 * reach, y: Math.random() < 0.6 ? box.maxY - Math.random() * 30 : pos.current.y + (Math.random() - 0.5) * reach })
          setMode("walk")
          if (!greeting.current && Math.random() < 0.12) say(pick(live.current.energy < 25 ? TIRED_LINES : LINES))
        }
      }
    }
    frame = requestAnimationFrame(step)
    const wake = () => {
      lastActive.current = Date.now()
      // A nap for want of company ends with you; one at night, out of tokens or with the other does not.
      if (modeRef.current === "sleep" && !live.current.rest && together.get()?.game !== "nap") moment("alert", pick(["!", "Oh, hi!", "*yawn*"]), 900)
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

  // To sleep, and up again: said once each time.
  const lastRest = useRef(rest)
  useEffect(() => {
    const was = lastRest.current
    lastRest.current = rest
    if (rest && rest !== was) say(SLEEP_LINES[rest], 3200)
    else if (!rest && was) moment("cheer", pick(WAKE_LINES[was]), 1400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest])
  // Now and then, at work.
  useEffect(() => {
    const timer = setInterval(() => modeRef.current === "work" && Math.random() < 0.06 && say(pick(WORK_LINES), 2200), 3000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // A session that asks you: it hurries there, and wonders.
  const lastPost = useRef(post?.cardId)
  useEffect(() => {
    if (post?.cardId !== lastPost.current && post?.kind === "asking") say("?", 1800)
    lastPost.current = post?.cardId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.cardId])

  // A level up: cheered; a new stage, more so (and you are told).
  useEffect(() => {
    if (lv.level <= lastLevel.current) return void (lastLevel.current = lv.level)
    const isNewStage = stageOf(lv.level).stage !== stageOf(lastLevel.current).stage
    lastLevel.current = lv.level
    setGrew(g => g + 1)
    if (isNewStage && STAGES.findIndex(s => s.stage === lv.stage) >= 3) {
      setTransforming(true)
      later(1700, () => setTransforming(false))
    }
    moment("cheer", isNewStage ? `I'm ${stageOf(lv.level).name} now!` : `Level ${lv.level}!`, 2200)
    toast(isNewStage ? `${name} grew: ${stageOf(lv.level).name}, level ${lv.level}` : `${name} reached level ${lv.level}`, {
      icon: <PetArt id={id} size={26} />, description: lv.level % PACK_EVERY === 0 ? "A pack for this level 📦" : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lv.level])

  // ---------- what you do to it ----------

  const closeMenu = () => ((menuRef.current = false), setMenuOpen(false))
  const playBallOut = () => {
    closeMenu()
    if (live.current.rest) return say("Zzz… later")
    target.current = null
    ball.set({ x: pos.current.x + facing.current * 46, y: pos.current.y - BALL, vx: 0, vy: 0, spin: 0, state: "loose", isThrown: false, holder: null, from: { ...pos.current }, at: Date.now(), throws: 0 })
    setMode("idle")
    say(live.current.other ? "Throw it, or hand it to one of us!" : "Throw it! Drag the ball and let go", 3200)
  }

  // A press: dragged once it moves, else its menu.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (flight.current) (flight.current = null), place() // caught in the air
    onTop.current = false
    const start = { x: e.clientX, y: e.clientY }
    const from = { ...pos.current }
    const trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }] // the last moments of the drag, for a throw
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
        const b = ball.get()
        if (b && b.holder === id && (b.state === "carried" || b.state === "game")) Object.assign(b, { state: "loose", isThrown: false, holder: null, at: Date.now() }) // it lets go
        closeMenu()
        setMode("drag")
        setBubble(null)
      }
      pos.current = clamp({ x: from.x + dx, y: from.y + dy })
      place()
      trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() })
      while (trail.length > 2 && trail[0]!.t < performance.now() - 90) trail.shift()
    }
    const up = () => {
      node.removeEventListener("pointermove", move)
      node.removeEventListener("pointerup", up)
      node.removeEventListener("pointercancel", up)
      lastActive.current = Date.now()
      const throw_ = isDragging && !isStill ? flingOf(trail, performance.now()) : null
      if (throw_) {
        flight.current = { ...pos.current, ...throw_, angle: 0 }
        setMode("fly")
        say(pick(["Wheee!", "Aaaah!", "Weee!"]), 900)
      } else if (isDragging) {
        keep(posKey, pos.current)
        setMode(live.current.rest ? "sleep" : "idle")
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
  const isTired = energy < 20 && !rest
  // What it does, in a few words, for its menu.
  const status = rest === "night" ? "Asleep: it is night" : rest === "spent" ? "Asleep: out of tokens" : post?.kind === "working" ? `With “${postTitle ?? "a session"}”` : post?.kind === "asking" ? `Waiting with you for “${postTitle ?? "a session"}”`
    : hasBall ? "Playing ball" : game ? (game.game === "nap" ? "Napping together" : "Playing") : isTired ? "Tired" : "Happy"
  const tag = rest && wakeAt ? `💤 ${wakeAt}` : post && postTitle ? postTitle : null
  return (
    <div ref={el} data-mode={mode === "watch" ? "idle" : mode} data-mood={isTired ? "sad" : undefined} data-stage={lv.stage} className={cn("pet-walker fixed top-0 left-0 z-[42] select-none", isTransforming && "is-transforming")}
      style={{ width: SIZE, height: SIZE, "--rarity": color, "--grow": GROW[lv.stage], "--size": size } as React.CSSProperties}>
      <Evolution stage={lv.stage} />
      {isTransforming && <i className="pet-transform-flash" aria-hidden />}
      {grew > 0 && <div key={grew} className="pet-levelup" aria-hidden>{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />)}</div>}
      {bubble && !isMenuOpen && <div className="pet-bubble">{bubble}</div>}
      {mode === "sleep" && <div className="pet-zzz" aria-hidden><i>z</i><i>z</i><i>z</i></div>}
      {mode === "cheer" && <div className="pet-hearts" aria-hidden><i>♥</i><i>♥</i><i>♥</i></div>}
      {tag && !isMenuOpen && <div className="pet-tag" title={tag}>{tag}</div>}
      <div className="pet-body-wrap cursor-pointer active:cursor-grabbing" title={`${name} · click for its menu, drag to move it, fling it to throw it`} onPointerDown={onPointerDown}>
        <div className="pet-grow">{(lv.stage === "legend" || lv.stage === "mythic") && <Crown />}<PetArt id={id} size={SIZE} doing={mode === "fetch" || mode === "carry" ? "walk" : mode === "shoved" || mode === "watch" ? "alert" : mode === "fly" ? "cheer" : isTired && mode === "idle" ? "sad" : mode} facing={face} /></div>
      </div>
      {mode === "work" && <Desk isTyping />}
      {isMenuOpen && (
        <PetMenu name={name} ownName={realName(id)} color={color} energy={energy} status={status} level={lv} isUp={isUp} shift={shift}
          onRename={n => (setNickname(id, n), say(n.trim() && n.trim() !== realName(id) ? `I'm ${n.trim()} now!` : "Back to my own name", 1800))}
          onPet={() => (closeMenu(), moment("cheer", pick(["♥", "Hehe", "Purr…", "Again!", ...LINES]), 1200))}
          onPets={() => (closeMenu(), openDialog({ kind: "pets" }))} hasBall={hasBall}
          onBall={hasBall ? () => (closeMenu(), ball.set(null), say("Ball away")) : playBallOut} />
      )}
    </div>
  )
}

// The ball, for both pets: it moves on its own when loose (a pet carries it
// otherwise), and you throw it: drag it and let go. Let go on a pet, slowly,
// and it is that pet's: with two out, they throw it to each other.
function BallLayer({ pets: out }: { pets: string[] }) {
  const node = useRef<HTMLDivElement>(null)
  const outRef = useRef(out)
  outRef.current = out
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const step = (t: number) => {
      frame = requestAnimationFrame(step)
      const rawDt = (t - last) / 1000
      last = t
      const b = ball.get()
      if (!b) return
      // in small steps, as much time as really went by (a slow frame does not slow the ball)
      if (b.state === "loose") for (let left = Math.min(0.25, rawDt); left > 0; left -= 0.016) roll(b, Math.min(0.016, left), wallX())
      // left lying: put away after a while
      if (b.state === "loose" && !b.isThrown && Date.now() - b.at > BORED_AFTER) return void ball.set(null)
      if (node.current) node.current.style.transform = `translate3d(${b.x - BALL / 2}px, ${b.y - BALL / 2}px, 0) rotate(${b.spin}rad)`
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The pet the ball was let go on, if any: within its body's box.
  const petAt = (x: number, y: number) => outRef.current.find(p => {
    const at = where.get(p)
    return at && Math.abs(x - at.x) < SIZE * 0.55 && y < at.y + 4 && y > at.y - SIZE * 1.05
  })

  // The ball in your hand: it follows the pointer, and flies off as fast as
  // you let go of it (a click alone tosses it up; on a pet, slowly, it is theirs).
  const onDown = (e: React.PointerEvent) => {
    const b = ball.get()
    if (!b || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    Object.assign(b, { state: "held", holder: null, vx: 0, vy: 0 })
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const trail: { x: number; y: number; t: number }[] = [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    let moved = false
    const move = (ev: PointerEvent) => {
      b.x = Math.min(innerWidth - BALL / 2, Math.max(BALL / 2, ev.clientX))
      b.y = Math.min(floorOf(), Math.max(BALL / 2, ev.clientY))
      moved ||= Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 6
      trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() })
      while (trail.length > 2 && trail[0]!.t < performance.now() - 90) trail.shift()
    }
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      el.removeEventListener("pointercancel", up)
      const first = trail[0]!
      const span = Math.max(0.016, (performance.now() - first.t) / 1000)
      let vx = (ev.clientX - first.x) / span
      let vy = (ev.clientY - first.y) / span
      const speed = Math.hypot(vx, vy)
      const pet = moved && speed < 260 ? petAt(ev.clientX, ev.clientY) : undefined
      if (pet) return void Object.assign(b, { state: "game", holder: pet, at: Date.now(), throws: 0, isThrown: false })
      if (speed < 120) {
        // a click: up it goes
        vx = (Math.random() - 0.5) * 500
        vy = -750
      } else if (speed > 2600) {
        vx = (vx / speed) * 2600
        vy = (vy / speed) * 2600
      }
      Object.assign(b, { vx, vy, state: "loose", isThrown: true, holder: null, from: { x: ev.clientX, y: innerHeight - 6 }, at: Date.now() })
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
  }
  return createPortal(
    <div ref={node} className="pet-ball" onPointerDown={onDown} title="Drag it and let go to throw it, or let go on a pet to hand it over">
      <TennisBall />
    </div>,
    document.body,
  )
}

// How far it has grown, around and behind it: a glow on the ground (grown);
// a blue aura of energy, embers rising and two sparks circling (elite); the aura gold and larger, a pulse of power now and then
// (legend); violet and crackling with lightning, the pet floating
// (mythic). All transform and opacity, under the pet.
function Evolution({ stage }: { stage: string }) {
  const at = STAGES.findIndex(s => s.stage === stage)
  if (at < 2) return null
  return (
    <div className="pet-evo" aria-hidden>
      <i className="pet-evo-glow" />
      {at >= 3 && (
        <>
          <div className="pet-aura">{[0, 1, 2].map(k => <i key={k} className="pet-flame" style={{ animationDelay: `${-k * 0.17}s`, "--x": `${(k - 1) * 8}px` } as React.CSSProperties} />)}</div>
          {[0, 1, 2, 3, 4].map(k => <i key={k} className="pet-ember" style={{ left: `${16 + k * 7}px`, animationDelay: `${-k * 0.31}s`, "--dx": `${(k % 2 ? 1 : -1) * (4 + k * 2)}px` } as React.CSSProperties} />)}
          <i className="pet-evo-spark" /><i className="pet-evo-spark" style={{ animationDelay: "-1.6s" }} />
        </>
      )}
      {at >= 4 && <i className="pet-power-ring" />}
      {at >= 5 && (
        <svg className="pet-bolts" viewBox="0 0 80 90" width="80" height="90">
          <path d="M14 18 L22 34 L15 38 L26 56" /><path d="M66 22 L57 40 L65 44 L53 62" />
        </svg>
      )}
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

const menuBtn = "flex h-8 items-center gap-2 rounded-[7px] px-2 text-left text-[12.5px] text-text hover:bg-hover disabled:opacity-40"

// Its menu: who it is, how it is, and the three things to do with it.
function PetMenu(props: {
  name: string; ownName: string; onRename: (name: string) => void; color: string; energy: number; status: string; isUp: boolean; shift: number
  level: ReturnType<typeof levelOf>; onPet: () => void; onBall: () => void; hasBall: boolean; onPets: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null) // its new name, being typed
  const rename = () => {
    if (draft !== null && draft.trim() !== props.name) props.onRename(draft)
    setDraft(null)
  }
  const row = (icon: string, label: string, onClick: () => void) => (
    <button className={menuBtn} onClick={onClick} onPointerDown={e => e.stopPropagation()}>
      <span className="w-5 text-center text-[14px]">{icon}</span>{label}
    </button>
  )
  return (
    <div className={cn("pet-menu", props.isUp ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px+var(--lift))]")} style={{ marginLeft: props.shift }} onPointerDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-1 pb-0.5">
        <i className="size-2 shrink-0 rounded-full" style={{ background: props.color }} />
        {draft !== null ? (
          <input autoFocus onFocus={e => e.target.select()} value={draft} maxLength={40} placeholder={props.ownName} onChange={e => setDraft(e.target.value)} onBlur={rename}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === "Enter") rename()
              if (e.key === "Escape") (e.nativeEvent.stopImmediatePropagation(), setDraft(null))
            }}
            className="h-6 min-w-0 flex-1 rounded-[6px] border border-brand bg-surface px-1.5 text-[13px] font-[650] outline-none" />
        ) : (
          <button className="group flex min-w-0 items-center gap-1 rounded-[5px] text-left hover:text-brand" title={props.name !== props.ownName ? `${props.ownName} · click to rename` : "Click to rename"}
            onClick={() => setDraft(props.name)}>
            <span className="min-w-0 truncate text-[13px] font-[650]">{props.name}</span>
            <span className="text-[11px] opacity-0 transition-opacity group-hover:opacity-70" aria-hidden>✏️</span>
          </button>
        )}
      </div>
      <p className="m-0 truncate px-1 pb-1.5 pl-5 text-[11.5px] text-text-muted" title={props.status}>{props.status}</p>
      <div className="flex flex-col gap-1 px-1 pb-2">
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="w-12 font-semibold text-text">Lv {props.level.level}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-side"><i className="block h-full rounded-full transition-[width] duration-500" style={{ width: props.level.need ? `${(props.level.into / props.level.need) * 100}%` : "100%", background: props.color }} /></span>
          <span className="w-12 text-right text-faint">{stageOf(props.level.level).name}</span>
        </div>
        <div className="flex items-center gap-2 text-[11.5px]" title="What is left of your 5-hour limit">
          <span className="w-12 text-text-muted">Energy</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-side"><i className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${props.energy}%`, background: props.energy < 25 ? "var(--bad)" : "var(--brand)" }} /></span>
          <span className="w-12 text-right text-faint tabular-nums">{props.energy}%</span>
        </div>
      </div>
      <div className="flex flex-col border-t border-line pt-1">
        {row("♥", "Pet", props.onPet)}
        {row("🎾", props.hasBall ? "Put the ball away" : "Play ball", props.onBall)}
        {row("🐾", "Your pets", props.onPets)}
      </div>
    </div>
  )
}
