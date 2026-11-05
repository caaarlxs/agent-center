// Behind the canvas and the views: a field of dots, a shade off the page so
// it never competes with the cards, in the Dots style only (Settings › Look).
// Plain CSS and still: it was a WebGL shader drifting on every frame, which
// kept the GPU and the page's memory busy all day for a background.
import { useIsDots } from "@/lib/board-style"

export function Backdrop() {
  return useIsDots() ? <div aria-hidden className="dot-field pointer-events-none absolute inset-0" /> : null
}
