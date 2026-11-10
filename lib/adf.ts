// Markdown as Jira's document (ADF): what the agents write (bold, italics,
// code, links, lists, headings, rules, code blocks) shows in Jira as such,
// not as asterisks. Only what the team's tickets use; anything else is text.

type Mark = { type: "strong" | "em" | "code" } | { type: "link"; attrs: { href: string } }
type Inline = { type: "text"; text: string; marks?: Mark[] }
type Block = Record<string, unknown>

// **bold**, *italics* or _italics_, `code`, [text](url): in that order of precedence.
const INLINE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/g

export function inlineOf(text: string): Inline[] {
  const out: Inline[] = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > at) out.push({ type: "text", text: text.slice(at, m.index) })
    if (m[2]) out.push({ type: "text", text: m[2], marks: [{ type: "strong" }] })
    else if (m[4]) out.push({ type: "text", text: m[4], marks: [{ type: "code" }] })
    else if (m[6]) out.push({ type: "text", text: m[6], marks: [{ type: "link", attrs: { href: m[7]! } }] })
    else out.push({ type: "text", text: (m[9] ?? m[11])!, marks: [{ type: "em" }] })
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push({ type: "text", text: text.slice(at) })
  return out
}

const paragraph = (text: string): Block => ({ type: "paragraph", content: inlineOf(text) })
const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const FENCE = /^\s*```(\w*)\s*$/

// A list: its items, each a paragraph (a nested list flattens into it).
function listOf(lines: string[], at: number, pattern: RegExp, type: "bulletList" | "orderedList"): [Block, number] {
  const items: Block[] = []
  let i = at
  for (; i < lines.length && pattern.test(lines[i]!); i++) items.push({ type: "listItem", content: [paragraph(lines[i]!.match(pattern)![1]!)] })
  return [{ type, content: items }, i]
}

function codeOf(lines: string[], at: number): [Block, number] {
  const language = lines[at]!.match(FENCE)![1]
  let i = at + 1
  const body: string[] = []
  for (; i < lines.length && !FENCE.test(lines[i]!); i++) body.push(lines[i]!)
  return [{ type: "codeBlock", ...(language ? { attrs: { language } } : {}), content: body.length ? [{ type: "text", text: body.join("\n") }] : [] }, i + 1]
}

// One block from where it starts: what it is, and the line after it.
function blockAt(lines: string[], i: number): [Block | null, number] {
  const line = lines[i]!
  if (!line.trim()) return [null, i + 1]
  if (FENCE.test(line)) return codeOf(lines, i)
  if (RULE.test(line)) return [{ type: "rule" }, i + 1]
  const heading = line.match(HEADING)
  if (heading) return [{ type: "heading", attrs: { level: heading[1]!.length }, content: inlineOf(heading[2]!) }, i + 1]
  if (BULLET.test(line)) return listOf(lines, i, BULLET, "bulletList")
  if (ORDERED.test(line)) return listOf(lines, i, ORDERED, "orderedList")
  // A paragraph: its lines up to a blank one or the start of another block, joined.
  let end = i + 1
  while (end < lines.length && lines[end]!.trim() && ![FENCE, RULE, HEADING, BULLET, ORDERED].some(p => p.test(lines[end]!))) end++
  return [paragraph(lines.slice(i, end).join(" ")), end]
}

export function adfOf(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const content: Block[] = []
  for (let i = 0; i < lines.length; ) {
    const [block, next] = blockAt(lines, i)
    if (block) content.push(block)
    i = next
  }
  return { type: "doc", version: 1, content }
}
