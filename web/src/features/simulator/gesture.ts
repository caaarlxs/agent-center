// What the pointer did on the simulator's picture, as what a finger does on
// its screen (lib/simulator.ts commandFor): a click is a tap, a click held
// half a second a long press, a drag a swipe as long as the drag took. The
// picture is smaller than the screen; a touch counts in the screen's points.
export type Size = { width: number; height: number }
export type Sample = { x: number; y: number; at: number } // where the pointer was (client px), and when (ms)
export type Box = { left: number; top: number; width: number; height: number }
export type Gesture =
  | { kind: "tap"; x: number; y: number }
  | { kind: "hold"; x: number; y: number; seconds: number }
  | { kind: "swipe"; x: number; y: number; toX: number; toY: number; seconds: number }

const MOVED_PX = 8
const HOLD_MS = 500
const within = (v: number, max: number) => Math.round(Math.min(max, Math.max(0, v)))
const secondsOf = (ms: number) => Math.round(ms / 10) / 100

export function gestureOf(from: Sample, to: Sample, box: Box, screen: Size): Gesture {
  const point = (s: Sample) => ({ x: within(((s.x - box.left) / box.width) * screen.width, screen.width), y: within(((s.y - box.top) / box.height) * screen.height, screen.height) })
  const [a, b] = [point(from), point(to)]
  const took = to.at - from.at
  if (Math.hypot(to.x - from.x, to.y - from.y) > MOVED_PX) return { kind: "swipe", ...a, toX: b.x, toY: b.y, seconds: secondsOf(took) }
  return took >= HOLD_MS ? { kind: "hold", ...a, seconds: secondsOf(took) } : { kind: "tap", ...a }
}

/** The screen's points as the picture lies: turned when the simulator is on its side. */
export const oriented = (screen: Size, picture: Size): Size =>
  picture.width > picture.height === screen.width > screen.height ? screen : { width: screen.height, height: screen.width }
