// The ball out on the board, one for both pets (BallLayer.tsx draws it and
// moves it): thrown by you, it is everybody's; given to one of them, the two
// throw it to each other. Its physics and the throw that lands where aimed.
import { createStore } from "@/lib/store"

export const BALL = 18
export const GRAVITY = 2100
const BOUNCE = 0.58

export type Point = { x: number; y: number }
// loose: on its own (thrown when isThrown: worth running after); carried: in
// a pet's mouth (holder); game: the two throw it to each other, holder next.
export type Ball = {
  x: number; y: number; vx: number; vy: number; spin: number
  state: "loose" | "held" | "carried" | "game"
  isThrown: boolean
  holder: string | null // who has it, or who it flies to in a game
  from: Point // where it was thrown from: where it is brought back
  at: number // when it last changed hands
  throws: number // in a game, how many so far
}

export const ball = createStore<Ball | null>(null)
export const floorOf = () => innerHeight - 4 - BALL / 2

/** A throw from `from` that lands at `to`: its speed and how long it flies (longer the farther, within limits). */
export function throwTo(from: Point, to: Point) {
  const time = Math.min(1.1, Math.max(0.55, Math.hypot(to.x - from.x, to.y - from.y) / 520))
  return { vx: (to.x - from.x) / time, vy: (to.y - from.y - 0.5 * GRAVITY * time * time) / time, time }
}

/** One small step of the ball on its own: it falls, bounces off the floor and the edges, rolls and stops. */
export function roll(b: Ball, dt: number, wall: number) {
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
  if (b.x > wall - BALL / 2) {
    b.x = wall - BALL / 2
    b.vx = -Math.abs(b.vx) * BOUNCE
  }
  b.spin += (b.vx * dt) / (BALL / 2)
}
