// The file beside the panel (DocBeside): how wide it is, and the boxes to
// tick that a document writes as text ("[ ] Sí [ ] No").

export const MIN_W = 360
const DEFAULT_W = 760

// Your width (dragged) or the default, never wider than the board's room.
export const docWidth = (saved: number | null, room: number) => Math.round(Math.min(room, Math.max(MIN_W, saved ?? DEFAULT_W)))

// A line's text cut at its boxes: "[ ]" empty, "[x]" ticked.
export type BoxPart = string | { isTicked: boolean }
export function boxParts(text: string): BoxPart[] {
  return text.split(/(\[[ xX]\])/).filter(Boolean).map(p => (/^\[[ xX]\]$/.test(p) ? { isTicked: p !== "[ ]" } : p))
}

// The text with its nth box ticked or cleared, counting as the page draws
// them: not inside code (`…` or a ``` block).
export function toggleBox(text: string, n: number): string {
  let seen = 0
  return text.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`|\[([ xX])\]/g, (match, mark: string | undefined) => {
    if (mark === undefined || seen++ !== n) return match
    return mark === " " ? "[x]" : "[ ]"
  })
}

// A document cut into the blocks you edit one at a time: at its blank lines
// (which stay at the end of the block before them), never inside code.
// Joined back, they are the text, whole.
export function blocksOf(text: string): string[] {
  const blocks: string[] = []
  let block = ""
  let isFenced = false
  let hasGap = false // the block already ends in a blank line
  for (const line of text.split(/(?<=\n)/)) {
    const isBlank = !isFenced && !line.trim()
    if (!isBlank && hasGap) (blocks.push(block), (block = ""), (hasGap = false))
    if (/^\s*(```|~~~)/.test(line)) isFenced = !isFenced
    block += line
    if (isBlank && block.trim()) hasGap = true
  }
  if (block) blocks.push(block)
  return blocks
}

// The text with block i written anew, its blank lines after it kept.
export function withBlock(blocks: string[], i: number, edited: string): string {
  const gap = blocks[i]!.match(/\s*$/)![0]
  return blocks.map((b, n) => (n === i ? edited.replace(/\s+$/, "") + gap : b)).join("")
}
