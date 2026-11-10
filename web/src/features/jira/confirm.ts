// What the pipeline's section and its parts share: a click that asks once more,
// and the event that makes the section read the ticket again at once.
import { useEffect, useState } from "react"

const CONFIRM_MS = 4_000
export const CHANGED = "pipeline-changed"
export const changed = () => window.dispatchEvent(new Event(CHANGED))

// A click that asks once more (it turns red) before it does what it says.
export function useConfirm(): [boolean, (then: () => void) => void] {
  const [isAsking, setAsking] = useState(false)
  useEffect(() => {
    if (!isAsking) return
    const timer = setTimeout(() => setAsking(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [isAsking])
  return [isAsking, then => (isAsking ? (setAsking(false), then()) : setAsking(true))]
}
