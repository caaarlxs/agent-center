// Behind the canvas: a field of dots that drifts very slowly (Paper Shaders'
// dithering), a shade off the page so it never competes with the cards. Its
// colours follow the theme; it stands still with less motion.
import { Dithering } from "@paper-design/shaders-react"
import { useMemo } from "react"
import { theme } from "@/lib/theme"

// "#rrggbb" (or "#rgb") at `alpha`, as the shader reads a colour.
export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "")
  const full = h.length === 3 ? [...h].map(c => c + c).join("") : h.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function Backdrop() {
  const mode = theme.use()
  const colors = useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    return { back: css.getPropertyValue("--bg").trim(), front: withAlpha(css.getPropertyValue("--text").trim(), mode === "dark" ? 0.07 : 0.06) }
  }, [mode])
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches
  return (
    <Dithering aria-hidden className="pointer-events-none absolute inset-0" colorBack={colors.back} colorFront={colors.front}
      shape="warp" type="4x4" size={2} scale={1.4} speed={still ? 0 : 0.12} />
  )
}
