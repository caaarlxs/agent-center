// How the search palette shows a hit (search.js): the query's words, the
// quote that starts a little before the first match, and the words marked.

export const termsOf = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(t => t.length > 1)

// A quote that starts a few words before the first match, so the marked
// words show even when the line is cut.
export function quoteOf(text: string, terms: string[]): string {
  const clean = text.replace(/^…|…$/g, "").trim()
  const at = Math.min(...terms.map(t => clean.toLowerCase().indexOf(t)).filter(i => i >= 0))
  if (!isFinite(at) || at < 24) return clean
  const from = clean.lastIndexOf(" ", at - 16)
  return `…${clean.slice(from > 0 ? from + 1 : at - 16)}`
}

// The text in parts; the odd ones are the query's words.
export function markedParts(text: string, terms: string[]): string[] {
  if (!terms.length || !text) return [text]
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi")
  return text.split(re)
}

// Recaps and titles carry Markdown: keep the words, drop the syntax (util.js plain).
export const plain = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)(#{1,6}|>)\s/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
