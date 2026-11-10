// A card's back peeled from its bottom-right corner, as a page is turned:
// the corner goes where the pointer is, the fold is the line halfway
// between them (square to it), the part of the back past the fold flips
// over onto it, mirrored, and what was under shows. Polygons in the card's
// own pixels, for clip-path; the shading's angle and the fold's place along
// it. Pure: tested on its own.

export type Pt = { x: number; y: number }

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y

// The part of a convex polygon where side(p) <= 0 (Sutherland–Hodgman, one edge).
function clip(poly: Pt[], side: (p: Pt) => number): Pt[] {
  const out: Pt[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!
    const [sa, sb] = [side(a), side(b)]
    if (sa <= 0) out.push(a)
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  })
  return out
}

export const area = (poly: Pt[]) => Math.abs(poly.reduce((s, a, i) => {
  const b = poly[(i + 1) % poly.length]!
  return s + a.x * b.y - b.x * a.y
}, 0)) / 2

export function peel(w: number, h: number, pointer: Pt) {
  const card = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
  const corner = { x: w, y: h }
  const d = sub(corner, pointer)
  const len = Math.hypot(d.x, d.y)
  if (len < 0.5) return { rest: card, flap: [] as Pt[], bare: [] as Pt[], angle: 135, foldAt: 1, foldAtIn: () => 1 }
  const n = { x: d.x / len, y: d.y / len } // from the fold toward the corner
  const mid = { x: (corner.x + pointer.x) / 2, y: (corner.y + pointer.y) / 2 }
  const side = (p: Pt) => dot(sub(p, mid), n)
  const rest = clip(card, side)
  const flap = clip(card, p => -side(p)).map(p => {
    const k = 2 * side(p)
    return { x: p.x - k * n.x, y: p.y - k * n.y }
  })
  // The shading runs from the fold toward the corner (CSS: 0deg is up, 90deg right).
  const angle = (Math.atan2(n.x, -n.y) * 180) / Math.PI
  const span = Math.abs(w * n.x) + Math.abs(h * n.y) // the gradient line's length
  const foldAt = dot(sub(mid, { x: w / 2, y: h / 2 }), n) / span + 0.5
  const bare = clip(card, p => -side(p)) // what the flap uncovered, where its shadow falls
  // The same place on a box `pad` larger on every side (the flap overhangs the card).
  const foldAtIn = (pad: number) => dot(sub(mid, { x: w / 2, y: h / 2 }), n) / (Math.abs((w + 2 * pad) * n.x) + Math.abs((h + 2 * pad) * n.y)) + 0.5
  return { rest: area(rest) < 0.5 ? [] : rest, flap: area(flap) < 0.5 ? [] : flap, bare, angle, foldAt, foldAtIn }
}

/** A polygon as clip-path, moved by `pad` (a box that large on every side); none left: clipped away whole. */
export const polygon = (poly: Pt[], pad = 0) =>
  poly.length ? `polygon(${poly.map(p => `${(p.x + pad).toFixed(1)}px ${(p.y + pad).toFixed(1)}px`).join(", ")})` : "polygon(0 0, 0 0, 0 0)"
