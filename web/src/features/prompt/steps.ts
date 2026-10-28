// The effort slider's arithmetic: which step a point on the track is, and
// where a key moves it. Steps run 0..count-1, evenly spread on the track.
export function stepAt(x: number, width: number, count: number): number {
  if (width <= 0 || count < 2) return 0
  const step = Math.round((x / width) * (count - 1))
  return Math.min(count - 1, Math.max(0, step))
}

export function stepByKey(key: string, step: number, count: number): number | null {
  const last = count - 1
  if (key === "ArrowRight" || key === "ArrowUp") return Math.min(last, step + 1)
  if (key === "ArrowLeft" || key === "ArrowDown") return Math.max(0, step - 1)
  if (key === "Home") return 0
  if (key === "End") return last
  return null
}

// A step's place on the track, as a share of its width.
export const shareOf = (step: number, count: number) => (count < 2 ? 0 : step / (count - 1))
