// Behind the canvas and the views: a field of dots that drifts very slowly
// (Paper Shaders' dithering), a shade off the page so it never competes with
// the cards, in the Dots style only (Settings › Look). Light on purpose: it
// moves on 8 times a second, not on every frame (at its pace the eye cannot
// tell), renders at one pixel per point, and stops while the window is hidden
// (and, by the library, while it is off screen). With less motion it stands still.
import { Dithering } from "@paper-design/shaders-react"
import { useEffect, useMemo, useState } from "react"
import { theme } from "@/lib/theme"
import { useIsDots } from "@/lib/board-style"

const FPS = 8
const SPEED = 0.12 // of the shader's own clock, as it drifted before
const MAX_PIXELS = 1_500_000

// "#rrggbb" (or "#rgb") at `alpha`, as the shader reads a colour.
export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "")
  const full = h.length === 3 ? [...h].map(c => c + c).join("") : h.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function Backdrop() {
  return useIsDots() ? <Dots /> : null
}

// The shader's clock, moved on FPS times a second while the window shows.
function useSlowClock(isStill: boolean) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (isStill) return
    let timer: ReturnType<typeof setInterval> | undefined
    const run = () => {
      clearInterval(timer)
      timer = document.hidden ? undefined : setInterval(() => setFrame(f => f + (1000 / FPS) * SPEED), 1000 / FPS)
    }
    run()
    document.addEventListener("visibilitychange", run)
    return () => (clearInterval(timer), document.removeEventListener("visibilitychange", run))
  }, [isStill])
  return frame
}

function Dots() {
  const mode = theme.use()
  const colors = useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    return { back: css.getPropertyValue("--bg").trim(), front: withAlpha(css.getPropertyValue("--text").trim(), mode === "dark" ? 0.07 : 0.06) }
  }, [mode])
  const isStill = matchMedia("(prefers-reduced-motion: reduce)").matches
  const frame = useSlowClock(isStill)
  return (
    <Dithering aria-hidden className="pointer-events-none absolute inset-0" colorBack={colors.back} colorFront={colors.front}
      shape="warp" type="4x4" size={2} scale={1.4} speed={0} frame={frame} minPixelRatio={1} maxPixelCount={MAX_PIXELS} />
  )
}
