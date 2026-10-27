// The plan's rate-limit windows, worked out for the sidebar (sidebar.js
// Limits): how much is used, how much of the window's time has gone by,
// whether the use runs ahead of it, where it gets at this pace, and which
// sessions spent the most of the last 5 hours.
import type { Card, Limits } from "@/lib/api-types"

export const LIMIT_NAME: Record<string, string> = { five_hour: "5 hours", seven_day: "Week", seven_day_opus: "Week · Opus", seven_day_sonnet: "Week · Sonnet" }
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600_000, seven_day: 7 * 86400_000, seven_day_opus: 7 * 86400_000, seven_day_sonnet: 7 * 86400_000 }
export const STALE_MS = 30 * 60_000 // older data shows faded

export type Tone = "ok" | "ask" | "bad"
export type Pace = "under" | "even" | "over"
export const PACE_SHORT: Record<Pace, string> = { under: "under pace", even: "on pace", over: "over pace" }
export const toneOf = (pct: number): Tone => (pct >= 90 ? "bad" : pct >= 70 ? "ask" : "ok")

// Time left until a window resets: "34 min", "2 h 10 min", "2 h", "2 d 10 h", "2 d".
export function untilText(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return h % 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${Math.floor(h / 24)} d`
}

const timeOf = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

// A time later today ("14:20"), or with its day ("Wed 14:20").
export function clockOf(t: number, now: number): string {
  const d = new Date(t)
  return sameDay(t, now) ? timeOf(d) : `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${timeOf(d)}`
}

// When a window resets: "today at 14:20", "tomorrow at 9:00", "Monday at 9:00".
export function resetAt(t: number, now: number): string {
  const d = new Date(t)
  if (sameDay(t, now)) return `today at ${timeOf(d)}`
  if (sameDay(t, now + 86400_000)) return `tomorrow at ${timeOf(d)}`
  return `${d.toLocaleDateString("en-GB", { weekday: "long" })} at ${timeOf(d)}`
}

// Where a window gets at this pace: full before it resets (and when), or how
// much it will have used when it does. Too early in it to tell: null.
export function forecast(pct: number, reset: number, span: number, now: number): { fullAt: number } | { atReset: number } | null {
  const gone = span - (reset - now)
  if (pct < 3 || gone < span * 0.08) return null
  const rate = pct / gone
  const fullAt = now + (100 - pct) / rate
  return fullAt < reset ? { fullAt } : { atReset: Math.min(100, Math.round(pct + rate * (reset - now))) }
}

export type LimitRow = {
  kind: string
  label: string
  pct: number
  tone: Tone
  reset: number | null
  hasReset: boolean // the reset time is in the past: the window starts again at 0
  left: string | null
  elapsed: number | null // % of the window's time gone by
  pace: Pace | null
  ahead: ReturnType<typeof forecast>
}

export function limitRows(limits: Limits, now: number): LimitRow[] {
  return limits.windows.map(w => {
    const reset = w.resetsAt ? Date.parse(w.resetsAt) : null
    const hasReset = reset !== null && reset <= now
    const pct = hasReset ? 0 : Math.round(w.percentUsed)
    const span = WINDOW_MS[w.kind]
    const isLive = reset !== null && !!span && !hasReset
    const elapsed = isLive ? Math.min(100, Math.max(0, Math.round(100 - ((reset - now) / span) * 100))) : null
    return {
      kind: w.kind,
      label: LIMIT_NAME[w.kind] ?? w.kind,
      pct,
      tone: toneOf(pct),
      reset,
      hasReset,
      left: reset !== null && !hasReset ? untilText(reset - now) : null,
      elapsed,
      // Use against time gone by, with 5 points of slack.
      pace: elapsed === null ? null : pct > elapsed + 5 ? "over" : pct < elapsed - 5 ? "under" : "even",
      ahead: isLive ? forecast(w.percentUsed, reset, span, now) : null,
    }
  })
}

// The sessions that spent the most of the last 5 hours, with their share
// (API prices as the measure: the plan does not say what each one used).
export function topSpenders(cards: Card[]): { card: Card; share: number }[] {
  const spent = cards.filter(c => (c.usage?.recentCost ?? 0) > 0)
  const total = spent.reduce((sum, c) => sum + (c.usage?.recentCost ?? 0), 0)
  if (!total) return []
  return spent
    .sort((a, b) => (b.usage?.recentCost ?? 0) - (a.usage?.recentCost ?? 0))
    .slice(0, 3)
    .map(card => ({ card, share: Math.round(((card.usage?.recentCost ?? 0) / total) * 100) }))
}
