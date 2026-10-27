// Focus a field once it can take it: React Flow draws a new node hidden until
// it has measured it, and a hidden field takes no focus. Tries each frame, for
// about two seconds.
import { type RefObject, useEffect } from "react"

export function useFocusWhenShown(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, isOn: boolean) {
  useEffect(() => {
    if (!isOn) return
    let frame = 0
    let tries = 0
    const tryFocus = () => {
      ref.current?.focus()
      if (document.activeElement !== ref.current && ++tries < 120) frame = requestAnimationFrame(tryFocus)
      else if (ref.current instanceof HTMLInputElement) ref.current.select()
    }
    tryFocus()
    return () => cancelAnimationFrame(frame)
  }, [ref, isOn])
}
