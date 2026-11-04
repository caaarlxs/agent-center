// A stage's effect in the right part of a ticket's card (stage-effects.ts):
// a canvas that fades into the card from the left. It draws only while the
// card is on screen and the tab is visible; with reduced motion, one still frame.
// While a refinement has steps, they fall down the card instead, the latest on top.
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Stage } from "@server/pipeline"
import { DRAW, type Effect, type Scene } from "./stage-effects"

const TONE: Record<Effect, string> = { run: "var(--work)", wait: "var(--ask)", fail: "var(--bad)", done: "var(--faint)" }
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

// The agent's steps, the latest on top; each new one pushes the rest down and
// the oldest out of the card (index.css .fall-step).
function StepFall({ steps, effect }: { steps: string[]; effect: Effect }) {
  return (
    <ol aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 m-0 w-[42%] list-none overflow-hidden p-0 pl-4 [mask-image:linear-gradient(90deg,transparent,#000_14%),linear-gradient(transparent,#000_12%,#000_70%,transparent)] [mask-composite:intersect]", effect === "wait" ? "text-ask" : "text-text-muted")}>
      {steps.map((text, i) => (
        <li key={text} className="fall-step absolute top-0 right-3 left-4 truncate text-[11.5px] leading-[18px]" style={{ ["--y" as string]: `${10 + i * 19}px`, ["--o" as string]: String(Math.max(0, 1 - i * 0.15)) }}>{text}</li>
      ))}
    </ol>
  )
}

export function StageEffect({ stage, effect, scene }: Props) {
  if (stage === "refine" && scene.steps.length && (effect === "run" || effect === "wait")) return <StepFall steps={scene.steps} effect={effect} />
  return <CanvasEffect stage={stage} effect={effect} scene={scene} />
}

function CanvasEffect({ stage, effect, scene }: Props) {
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
        className={cn("absolute top-0 right-0 h-full w-[42%] transition-opacity duration-300 ease-out [mask-image:linear-gradient(90deg,transparent,#000_22%)]", effect === "run" ? "opacity-80" : effect === "done" ? "opacity-50" : "opacity-60")}
        style={{ ["--ink" as string]: TONE[effect], ["--mark" as string]: "var(--ask)" }} />
    </span>
  )
}
