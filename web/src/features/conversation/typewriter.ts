// The answer being written arrives in pieces of a few words every ~130 ms;
// shown as they come it jumps. Instead its letters appear one after another,
// fast enough to catch up with what has arrived within about one piece's
// time, so it reads as typing and never falls behind. A text that is not a
// continuation of the last (a new step of the turn) starts over.
import { useEffect, useRef, useState } from "react"

const FRAME_MS = 33 // about 30 redraws a second: each one parses the markdown again
const CATCH_UP_MS = 160 // what has arrived is all shown within this

// Letters per millisecond to show what has arrived in CATCH_UP_MS, set each
// time more arrives.
export const speedFor = (shown: number, arrived: number) => Math.max(0, arrived - shown) / CATCH_UP_MS

// How many letters to show next, `ms` after the last step, at `speed`.
export function nextLength(shown: number, arrived: number, ms: number, speed: number) {
  if (shown >= arrived) return arrived
  return Math.min(arrived, shown + Math.max(1, Math.ceil(speed * ms)))
}

export function useTypewriter(text: string | null) {
  const [length, setLength] = useState(0)
  const shown = useRef(0)
  const previous = useRef("")
  useEffect(() => {
    if (!text) return void ((shown.current = 0), (previous.current = ""), setLength(0))
    if (!text.startsWith(previous.current.slice(0, shown.current))) shown.current = 0 // another step: from the start
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
