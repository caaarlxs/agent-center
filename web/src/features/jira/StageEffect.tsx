// A stage's effect in the right third of a ticket's card (stage-effects.ts):
// a canvas that fades into the card from the left. It draws only while the
// card is on screen and the tab is visible; with reduced motion, one still frame.
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Stage } from "@server/pipeline"
import { DRAW, type Effect, type Scene } from "./stage-effects"

const TONE: Record<Effect, string> = { run: "var(--work)", wait: "var(--ask)", fail: "var(--bad)", off: "var(--work)" }
const GLITCH_MS = 220
const STILL_AT = 1.5

type Props = { stage: Stage; effect: Effect; scene: Scene }

// What the loop reads each frame, so that a new prop does not restart it.
type Live = Props & { t: number; failAt: number }

function fit(canvas: HTMLCanvasElement) {
  const box = canvas.getBoundingClientRect()
  const ratio = devicePixelRatio || 1
  if (canvas.width !== Math.round(box.width * ratio)) {
    canvas.width = Math.round(box.width * ratio)
    canvas.height = Math.round(box.height * ratio)
  }
  const x = canvas.getContext("2d")!
  x.setTransform(ratio, 0, 0, ratio, 0, 0)
  return { x, w: box.width, h: box.height }
}

// A failure shakes the picture sideways in a few bands, once.
function shake(canvas: HTMLCanvasElement, x: CanvasRenderingContext2D) {
  x.setTransform(1, 0, 0, 1, 0, 0)
  for (let i = 0; i < 5; i++) {
    const y = Math.random() * canvas.height
    const band = 2 + Math.random() * canvas.height * 0.08
    x.drawImage(canvas, 0, y, canvas.width, band, (Math.random() - 0.5) * 16, y, canvas.width, band)
  }
}

function paint(canvas: HTMLCanvasElement, live: Live, mem: Record<string, unknown>, now: number) {
  const { x, w, h } = fit(canvas)
  const style = getComputedStyle(canvas)
  x.clearRect(0, 0, w, h)
  x.globalAlpha = 1
  x.lineWidth = 1
  const ink = style.getPropertyValue("--ink").trim()
  DRAW[live.stage]({ x, w, h, t: live.t, scene: live.scene, mem, ink, mark: style.getPropertyValue("--mark").trim(), mono: style.getPropertyValue("--font-mono").trim() })
  if (live.effect === "fail" && now - live.failAt < GLITCH_MS) shake(canvas, x)
}

export function StageEffect({ stage, effect, scene }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef<Live>({ stage, effect, scene, t: STILL_AT, failAt: 0 })
  const kick = useRef<() => void>(() => {})
  const wasFailed = live.current.effect === "fail"
  Object.assign(live.current, { stage, effect, scene }, effect === "fail" && !wasFailed ? { failAt: performance.now() } : {})

  useEffect(() => {
    const el = canvas.current!
    const isStill = matchMedia("(prefers-reduced-motion: reduce)").matches
    const mem: Record<string, unknown> = {}
    let frame = 0
    let last = performance.now()
    let isSeen = true
    const tick = (now: number) => {
      const l = live.current
      if (l.effect === "run" && !isStill) l.t += (now - last) / 1000
      last = now
      paint(el, l, mem, now)
      const isMoving = !isStill && isSeen && !document.hidden && (l.effect === "run" || now - l.failAt < GLITCH_MS)
      frame = isMoving ? requestAnimationFrame(tick) : 0
    }
    kick.current = () => {
      if (!frame) frame = requestAnimationFrame(t => ((last = t), tick(t)))
    }
    const seen = new IntersectionObserver(([e]) => ((isSeen = !!e?.isIntersecting), isSeen && kick.current()))
    seen.observe(el)
    const onShow = () => kick.current()
    document.addEventListener("visibilitychange", onShow)
    kick.current()
    return () => (cancelAnimationFrame(frame), seen.disconnect(), document.removeEventListener("visibilitychange", onShow))
  }, [])

  useEffect(() => kick.current(), [stage, effect, scene])

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <canvas ref={canvas}
        className={cn("absolute top-0 right-0 h-full w-[42%] transition-opacity duration-300 ease-out [mask-image:linear-gradient(90deg,transparent,#000_55%)]", effect === "off" ? "opacity-0" : effect === "run" ? "opacity-75" : "opacity-50")}
        style={{ ["--ink" as string]: TONE[effect], ["--mark" as string]: "var(--ask)" }} />
    </span>
  )
}
