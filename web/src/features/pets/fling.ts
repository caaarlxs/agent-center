// A pet thrown like the ball: let go with speed, it flies, tumbling the way
// it goes, bounces off the floor and the edges of the window, rolls to a
// stop and lands. Pure: tested on its own.

export type Flight = { x: number; y: number; vx: number; vy: number; angle: number } // x, y: its feet; angle: degrees
type Box = { minX: number; maxX: number; minY: number; maxY: number }

const GRAVITY = 2100
const BOUNCE = 0.5
const MAX_SPEED = 2600
const THROW = 350 // slower than this, it was put down, not thrown

/** The throw a drag ends with, from its last moments (pointer samples, ms): null when let go slowly. */
export function flingOf(trail: { x: number; y: number; t: number }[]): { vx: number; vy: number } | null {
  const [first, last] = [trail[0], trail.at(-1)]
  if (!first || !last || last === first) return null
  const span = Math.max(16, last.t - first.t) / 1000
  let [vx, vy] = [(last.x - first.x) / span, (last.y - first.y) / span]
  const speed = Math.hypot(vx, vy)
  if (speed < THROW) return null
  if (speed > MAX_SPEED) [vx, vy] = [(vx / speed) * MAX_SPEED, (vy / speed) * MAX_SPEED]
  return { vx, vy }
}

/** One step of the flight; `landed` once it rests on the floor. */
export function flyStep(f: Flight, dt: number, box: Box): { flight: Flight; landed: boolean } {
  let { x, y, vx, vy, angle } = f
  const onFloor = y >= box.maxY - 0.5 && Math.abs(vy) < 1
  if (onFloor) vx *= Math.max(0, 1 - 3.2 * dt) // rolling
  else vy += GRAVITY * dt
  x += vx * dt
  y += vy * dt
  if (y > box.maxY) {
    y = box.maxY
    vy = Math.abs(vy) > 160 ? -vy * BOUNCE : 0
    vx *= 0.8
  }
  if (y < box.minY) [y, vy] = [box.minY, Math.abs(vy) * BOUNCE]
  if (x < box.minX) [x, vx] = [box.minX, Math.abs(vx) * BOUNCE]
  if (x > box.maxX) [x, vx] = [box.maxX, -Math.abs(vx) * BOUNCE]
  angle += vx * dt * (onFloor ? 0.9 : 0.6) // it rolls on the floor, tumbles in the air
  const landed = y >= box.maxY && vy === 0 && Math.abs(vx) < 25
  return { flight: { x, y, vx, vy, angle }, landed }
}
