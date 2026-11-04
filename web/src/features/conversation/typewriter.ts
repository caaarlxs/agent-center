// The answer being written arrives in pieces of a few words every ~130 ms,
// and after a tool run Claude Code often hands over its first part at once
// (two thousand letters in one piece); shown as they come, they jump.
// Instead its letters appear one after another, at the speed that shows
// what has arrived within CATCH_UP_MS: a big piece types in under a second,
// the steady flow keeps pace. A text that is not a continuation of the last
// (a new step of the turn) starts over; one whose first part moved into the
// conversation keeps its place; what was written before the conversation
// opened shows at once.
import { useEffect, useRef, useState } from "react"

const FRAME_MS = 33 // about 30 redraws a second: each one parses the markdown again
const CATCH_UP_MS = 800 // what has arrived is all shown within this

// Letters per millisecond to show what has arrived in CATCH_UP_MS, set each
// time more arrives.
export const speedFor = (shown: number, arrived: number) => Math.max(0, arrived - shown) / CATCH_UP_MS

// How many letters to show next, `ms` after the last step, at `speed`.
export function nextLength(shown: number, arrived: number, ms: number, speed: number) {
  if (shown >= arrived) return arrived
  return Math.min(arrived, shown + Math.max(1, Math.ceil(speed * ms)))
}

// Where the next text starts typing, `shown` letters into the last: on, if
// it grows; at the same letter, if its first part moved into the
// conversation (the text now starts later in the last); else from the start.
export function startOf(previous: string, shown: number, text: string) {
  if (text.startsWith(previous.slice(0, shown))) return shown
  // The blocks start after a blank line: the one where the new text begins.
  for (let at = previous.indexOf("\n\n"); at >= 0; at = previous.indexOf("\n\n", at + 2)) {
    const from = at + 2 + (previous.slice(at + 2).length - previous.slice(at + 2).trimStart().length)
    if (text.startsWith(previous.slice(from))) return Math.min(text.length, Math.max(0, shown - from))
  }
  return 0
}

export function useTypewriter(text: string | null) {
  const [length, setLength] = useState(0)
  const shown = useRef(0)
  const previous = useRef("")
  const isFresh = useRef(true) // what was written before the conversation opened shows at once
  useEffect(() => {
    if (!text) return void ((shown.current = 0), (previous.current = ""), setLength(0))
    shown.current = isFresh.current ? text.length : startOf(previous.current, shown.current, text)
    isFresh.current = false
    previous.current = text
    const speed = speedFor(shown.current, text.length)
    let last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      shown.current = nextLength(shown.current, text.length, now - last, speed)
      last = now
      setLength(shown.current)
      if (shown.current >= text.length) clearInterval(timer)
    }, FRAME_MS)
    return () => clearInterval(timer)
  }, [text])
  return text ? text.slice(0, length) : null
}
