// The guide's catalogue (FEATURES.md at the repo's root): a section per
// "## {icon} Name" heading, a feature per "- {icon} **Title**: text" line;
// a line that ends in " · YYYY-MM-DD" is new from that day. Keys in the
// text go in backticks.

export type Feature = { icon: string; title: string; text: string; since: string | null }
export type Section = { name: string; icon: string; items: Feature[] }
export type Piece = { text: string } | { key: string }

const DATED = /\s+·\s+(\d{4}-\d{2}-\d{2})\s*$/
const ICON = /^\{([a-z0-9-]+)\}\s*/
const TITLE = /^\*\*(.+?)\*\*:?\s*/

export function catalogueOf(md: string): Section[] {
  const sections: Section[] = []
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      const head = line.slice(3).trim()
      sections.push({ name: head.replace(ICON, ""), icon: head.match(ICON)?.[1] ?? "", items: [] })
    } else if (line.startsWith("- ") && sections.length) {
      let rest = line.slice(2).trim()
      const since = rest.match(DATED)?.[1] ?? null
      rest = rest.replace(DATED, "")
      const icon = rest.match(ICON)?.[1] ?? ""
      rest = rest.replace(ICON, "")
      const title = rest.match(TITLE)?.[1] ?? ""
      const text = rest.replace(TITLE, "")
      sections.at(-1)!.items.push({ icon, title, text: text.charAt(0).toUpperCase() + text.slice(1), since })
    }
  }
  return sections
}

// A text as words and keys (what sits in backticks).
export const piecesOf = (text: string): Piece[] =>
  text.split(/(`[^`]+`)/).filter(Boolean).map(p => (p.startsWith("`") && p.endsWith("`") && p.length > 2 ? { key: p.slice(1, -1) } : { text: p }))

// The features with a word starting with each word typed ("con" finds
// conversation, not "icon"); a section's name counts for its features.
export function findIn(sections: Section[], query: string): Section[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return sections
  const starts = words.map(w => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"))
  const has = (text: string) => starts.every(re => re.test(text.toLowerCase()))
  return sections
    .map(s => ({ ...s, items: s.items.filter(f => has(`${s.name} ${f.title} ${f.text}`)) }))
    .filter(s => s.items.length)
}

// What is new after a day (YYYY-MM-DD), newest first, with its section.
/** The day to mark as seen: today, or the newest line's day if one is dated later, so closing "What's new" always clears it. */
export const seenUpTo = (sections: Section[], today: string) =>
  sections.flatMap(s => s.items.map(f => f.since ?? "")).reduce((top, d) => (d > top ? d : top), today)

export function newSince(sections: Section[], day: string): (Feature & { section: string })[] {
  return sections
    .flatMap(s => s.items.map(f => ({ ...f, section: s.name })))
    .filter(f => f.since && f.since > day)
    .sort((a, b) => b.since!.localeCompare(a.since!))
}
