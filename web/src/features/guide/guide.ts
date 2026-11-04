// The guide's catalogue (FEATURES.md at the repo's root): a group per "## "
// heading, a feature per "- " line; a line that ends in " · YYYY-MM-DD" is
// new from that day.

export type Feature = { text: string; since: string | null }
export type Group = { name: string; items: Feature[] }

const DATED = /\s+·\s+(\d{4}-\d{2}-\d{2})\s*$/

export function catalogueOf(md: string): Group[] {
  const groups: Group[] = []
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) groups.push({ name: line.slice(3).trim(), items: [] })
    else if (line.startsWith("- ") && groups.length) {
      const text = line.slice(2).trim()
      const since = text.match(DATED)?.[1] ?? null
      groups.at(-1)!.items.push({ text: text.replace(DATED, ""), since })
    }
  }
  return groups
}

// The lines with a word starting with each word typed ("pr" finds PRs, not
// "compress"); a group's name counts for its lines.
export function findIn(groups: Group[], query: string): Group[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return groups
  const starts = words.map(w => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"))
  const has = (text: string) => starts.every(re => re.test(text.toLowerCase()))
  return groups
    .map(g => ({ name: g.name, items: g.items.filter(i => has(`${g.name} ${i.text}`)) }))
    .filter(g => g.items.length)
}

// What is new after a day (YYYY-MM-DD), newest first.
export function newSince(groups: Group[], day: string): Feature[] {
  return groups.flatMap(g => g.items).filter(i => i.since && i.since > day).sort((a, b) => b.since!.localeCompare(a.since!))
}
