// The parade's flight, fitted to the window: in on foot from the left, a
// take-off, a loop-the-loop in the middle, a dive, a landing on the right
// and out on foot. Points along it with the heading (degrees, unwrapped so a
// loop turns all the way round), for keyframes. Pure: tested on its own.

export type Point = { x: number; y: number; a: number; offset: number }
type Seg = { at: (t: number) => [number, number]; weight: number; steps: number }

const bezier = (p0: number[], p1: number[], p2: number[], p3: number[]) => (t: number): [number, number] => {
  const u = 1 - t
  const c = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return [0, 1].map(k => c[0]! * p0[k]! + c[1]! * p1[k]! + c[2]! * p2[k]! + c[3]! * p3[k]!) as [number, number]
}

export function flightPath(w: number, h: number): Point[] {
  const ground = h - 46
  const r = Math.min(h * 0.17, w * 0.11)
  const [cx, cy] = [w * 0.5, h * 0.36]
  const bottom = [cx, cy + r]
  const segs: Seg[] = [
    { at: t => [-90 + t * (w * 0.2 + 90), ground], weight: 1.4, steps: 8 }, // in on foot
    { at: bezier([w * 0.2, ground], [w * 0.3, ground], [cx - r * 1.6, cy + r], bottom), weight: 1.6, steps: 14 }, // take-off
    { at: t => [cx + r * Math.sin(t * 2 * Math.PI), cy + r * Math.cos(t * 2 * Math.PI)], weight: 2.2, steps: 30 }, // the loop
    { at: bezier(bottom, [cx + r * 1.8, cy + r], [w * 0.66, ground], [w * 0.8, ground]), weight: 1.6, steps: 18 }, // the dive, landing level
    { at: t => [w * 0.8 + t * (w * 0.2 + 90), ground], weight: 1.2, steps: 8 }, // out on foot
  ]
  const total = segs.reduce((s, g) => s + g.weight, 0)
  const raw: { x: number; y: number; offset: number }[] = []
  let done = 0
  for (const [i, seg] of segs.entries()) {
    for (let k = i === 0 ? 0 : 1; k <= seg.steps; k++) {
      const [x, y] = seg.at(k / seg.steps)
      raw.push({ x, y, offset: (done + (seg.weight * k) / seg.steps) / total })
    }
    done += seg.weight
  }
  // The heading of each point, from its neighbours; never a jump of a full turn.
  let last = 0
  return raw.map((p, i) => {
    const [a, b] = [raw[Math.max(0, i - 1)]!, raw[Math.min(raw.length - 1, i + 1)]!]
    let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    while (deg - last > 180) deg -= 360
    while (deg - last < -180) deg += 360
    last = deg
    return { ...p, a: deg, offset: Math.min(1, p.offset) }
  })
}
