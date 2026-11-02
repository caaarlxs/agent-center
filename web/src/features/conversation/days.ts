// Where a new day starts in a conversation: before the first message of each
// day, "Today", "Yesterday", the weekday within a week, else the date. None
// when everything is from today.
const DAY_MS = 86_400_000

const dayOf = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function dayLabel(at: number, now: number): string {
  const days = Math.round((dayOf(now) - dayOf(at)) / DAY_MS)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  const d = new Date(at)
  if (days > 1 && days < 7) return d.toLocaleDateString("en-GB", { weekday: "long" })
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).replace(",", "")
}

// The items a day starts at, by key, with the day's name.
export function dayBreaks(items: { key: string; at?: string | null }[], now: number): Map<string, string> {
  const dated = items.flatMap(i => {
    const t = i.at ? Date.parse(i.at) : NaN
    return Number.isNaN(t) ? [] : [{ key: i.key, day: dayOf(t), at: t }]
  })
  const out = new Map<string, string>()
  if (dated.every(d => d.day === dayOf(now))) return out
  let last: number | null = null
  for (const d of dated) {
    if (d.day !== last) out.set(d.key, dayLabel(d.at, now))
    last = d.day
  }
  return out
}
