// The effort as a stepped slider: a dot per level, the track filled in the
// brand colour up to a round white thumb that snaps with a short spring. A
// click on the track or a dot, a drag, or the arrows (Home, End) pick it.
// Locked, it shows the level and takes nothing.
import { motion } from "motion/react"
import { useRef } from "react"
import { cn } from "@/lib/utils"
import { shareOf, stepAt, stepByKey } from "./steps"

const SNAP = { type: "spring", stiffness: 600, damping: 38, mass: 0.6 } as const

export function EffortSlider({ step, labels, isLocked, onStep }: { step: number; labels: readonly string[]; isLocked?: boolean; onStep: (step: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const count = labels.length
  const pickAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect()
    if (!box) return
    const next = stepAt(clientX - box.left, box.width, count)
    if (next !== step) onStep(next)
  }
  const share = `${shareOf(Math.max(0, step), count) * 100}%`
  return (
    <div role="slider" tabIndex={isLocked ? -1 : 0} aria-label="Effort" aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={step}
      aria-valuetext={labels[step]} aria-disabled={isLocked || undefined}
      className={cn("relative h-6 touch-none rounded-full outline-none focus-visible:shadow-[0_0_0_3px_var(--brand-soft)]", isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}
      onKeyDown={e => {
        if (isLocked) return
        const next = stepByKey(e.key, step, count)
        if (next === null) return
        e.preventDefault()
        if (next !== step) onStep(next)
      }}
      onPointerDown={e => {
        if (isLocked) return
        e.currentTarget.setPointerCapture(e.pointerId)
        pickAt(e.clientX)
      }}
      onPointerMove={e => !isLocked && e.currentTarget.hasPointerCapture(e.pointerId) && pickAt(e.clientX)}>
      <div ref={track} className="absolute inset-x-2.5 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line-strong">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-brand" initial={false} animate={{ width: share }} transition={SNAP} />
        {labels.map((label, i) => (
          <i key={label} className={cn("absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full", i <= step ? "bg-brand-text/70" : "bg-faint")}
            style={{ left: `${shareOf(i, count) * 100}%` }} />
        ))}
        <motion.span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] ring-1 ring-black/10"
          initial={false} animate={{ left: share }} transition={SNAP} />
      </div>
    </div>
  )
}
