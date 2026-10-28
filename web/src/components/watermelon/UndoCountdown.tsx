// Adapted from Watermelon UI's time-undo-action (ui.watermelon.sh, MIT): the
// Undo of a toast shows the time left to take it back, a ring that empties
// and the seconds rolling down. Ours sits in the toast's action, with Z; the
// count stops while the pointer is on the toasts, as Sonner stops their timer.
import { useEffect, useRef, useState } from "react"
import { Num } from "@/components/common/Num"
import { Kbd } from "@/components/ui/kbd"
import { leftAfter } from "./countdown"

const TICK_MS = 100
const R = 7
const LENGTH = 2 * Math.PI * R

export function UndoCountdown({ ms }: { ms: number }) {
  const [left, setLeft] = useState(ms)
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      const isPaused = document.hidden || !!el.current?.closest("[data-sonner-toaster]")?.matches(":hover")
      setLeft(l => leftAfter(l, now - last, isPaused))
      last = now
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [])
  return (
    <span ref={el} className="inline-flex items-center gap-1.5">
      <span className="relative inline-grid size-[18px] place-items-center">
        <svg viewBox="0 0 18 18" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="9" cy="9" r={R} fill="none" strokeWidth="1.75" className="stroke-current opacity-25" />
          <circle cx="9" cy="9" r={R} fill="none" strokeWidth="1.75" strokeLinecap="round" className="stroke-current transition-[stroke-dashoffset] duration-100 ease-linear"
            strokeDasharray={LENGTH} strokeDashoffset={LENGTH * (1 - left / ms)} />
        </svg>
        <Num value={Math.ceil(left / 1000)} className="text-[9.5px] font-bold" />
      </span>
      Undo <Kbd className="border-current/30 bg-transparent text-current">Z</Kbd>
    </span>
  )
}
