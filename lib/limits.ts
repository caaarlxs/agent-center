// The plan's limits are the account's, read by every session from its last
// answer from the API. A session that is idle keeps an old reading (the mod
// stamps it again with each write), and within a window the use only grows:
// the account's use of a window is the highest reading of it, among those
// whose window has not reset yet. Some sessions (Opus ones, it seems) read
// only a weekly window, with another value: readings with the 5-hour window
// win when there are any.

import type { Limits } from "./bridge"

type Window = Limits["windows"][number]

// A window's latest period, and the highest use read in it.
function highest(windows: Window[], now: number): Window {
  const live = windows.filter(w => !w.resetsAt || Date.parse(w.resetsAt) > now)
  const pool = live.length ? live : windows
  const latest = Math.max(...pool.map(w => Date.parse(w.resetsAt ?? "") || 0))
  return pool.filter(w => (Date.parse(w.resetsAt ?? "") || 0) === latest).reduce((a, w) => (w.percentUsed > a.percentUsed ? w : a))
}

export function accountLimits(readings: (Limits | null)[], now = Date.now()): Limits | null {
  const all = readings.filter((r): r is Limits => !!r?.windows?.length)
  const isLiveFull = (r: Limits) => r.windows.some(w => w.kind === "five_hour" && (!w.resetsAt || Date.parse(w.resetsAt) > now))
  const from = all.some(isLiveFull) ? all.filter(isLiveFull) : all
  if (!from.length) return null
  const kinds = [...new Set(from.flatMap(r => r.windows.map(w => w.kind)))]
  return {
    at: Math.max(...from.map(r => r.at)),
    windows: kinds.map(kind => highest(from.flatMap(r => r.windows.filter(w => w.kind === kind)), now)),
  }
}
