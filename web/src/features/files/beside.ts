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
