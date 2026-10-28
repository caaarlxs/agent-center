// A workspace's side (the Code tree, the changed files) opened to the left of
// the session panel, over the board, so the panel keeps its width when you
// switch tabs. Where the panel fills the window (a medium or narrow one) there
// is no room beside it: `useSideRoom` says so, and the workspace shows its
// side inside instead.
//
// It comes out from behind the panel's edge like a drawer: its left side is
// uncovered from the edge outward while it slides a little the same way, and
// it folds back the same way, faster, when `isOpen` turns false.
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { MEDIUM_MAX, useViewportWidth } from "./panel-width"

export const useSideRoom = () => useViewportWidth() > MEDIUM_MAX

const DRAWER = [0.32, 0.72, 0, 1] as const // iOS's drawer curve: quick to start, long to settle
const SHUT = "inset(0 0 0 100%)" // all of it behind the panel's edge
const OPEN = "inset(0 0 0 0%)"

export function SideFlyout({ label, isOpen = true, className, children }: { label: string; isOpen?: boolean; className?: string; children: ReactNode }) {
  // The panel itself: positioned, so the side hangs off its left edge.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.querySelector<HTMLElement>("[data-panel]")), [])
  const isStill = useReducedMotion()
  if (!host) return null
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.aside key="side" aria-label={label}
          className={cn("absolute inset-y-0 right-full flex w-[264px] flex-col border-r border-line bg-side shadow-pop will-change-[clip-path,transform]", className)}
          initial={isStill ? { opacity: 0 } : { clipPath: SHUT, x: 24 }}
          animate={isStill ? { opacity: 1 } : { clipPath: OPEN, x: 0 }}
          exit={isStill ? { opacity: 0 } : { clipPath: SHUT, x: 24, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: 0.36, ease: DRAWER }}>
          {children}
        </motion.aside>
      )}
    </AnimatePresence>,
    host,
  )
}
