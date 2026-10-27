// The canvas's zoom (canvas.js zoomTo): steps of ×1.2, up to 150 %, down to
// 40 % (or less, when that is what fits). "Fit" is a stop: a zoom that
// crosses it stops on it. The choice is kept: null means "fit". Pure.
export const ZOOM = { max: 1.5, min: 0.4, step: 1.2 }

export const minZoomOf = (fit: number) => Math.min(fit, ZOOM.min)

// Where a zoom to `next` lands from `scale`: the scale, and what to keep
// (null: at fit).
export function zoomTarget(scale: number, next: number | null, fit: number, isAtFit: boolean): { scale: number; saved: number | null } {
  if (next === null) return { scale: fit, saved: null }
  const n = Math.min(ZOOM.max, Math.max(minZoomOf(fit), next))
  const crosses = !isAtFit && (scale - fit) * (n - fit) <= 0
  if (crosses || Math.abs(n - fit) < 0.01) return { scale: fit, saved: null }
  return { scale: n, saved: n }
}
