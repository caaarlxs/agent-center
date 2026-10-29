// A workspace's side (the Code tree, the changed files) opened to the left of
// the session panel, over the board, so the panel keeps its width when you
// switch tabs. Where the panel fills the window (a medium or narrow one) there
// is no room beside it: `useSideRoom` says so, and the workspace shows its
// side inside instead.
//
// It comes out from behind the panel's edge like a drawer: a still frame
// beside the panel cuts it at that edge, and the side slides out of it to the
// left, so no part of it ever crosses the panel. It folds back the same way,
// faster, when `isOpen` turns false.
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { MEDIUM_MAX, useViewportWidth } from "./panel-width"

export const useSideRoom = () => useViewportWidth() > MEDIUM_MAX

const DRAWER = [0.32, 0.72, 0, 1] as const // iOS's drawer curve: quick to start, long to settle
// The frame lets the side's shadow out to the left, above and below, never onto the panel.
const FRAME = "inset(-48px 0 -48px -48px)"

export function SideFlyout({ label, isOpen = true, className, children }: { label: string; isOpen?: boolean; className?: string; children: ReactNode }) {
  // The panel itself: positioned, so the side hangs off its left edge.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.querySelector<HTMLElement>("[data-panel]")), [])
  const isStill = useReducedMotion()
  if (!host) return null
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div key="side" className="absolute inset-y-0 right-full w-[264px]" style={{ clipPath: FRAME }} exit={{ opacity: 1 }}>
          <motion.aside aria-label={label}
            className={cn("flex h-full w-full flex-col border-r border-line bg-side shadow-pop will-change-transform", className)}
            initial={isStill ? { opacity: 0 } : { x: "100%" }}
            animate={isStill ? { opacity: 1 } : { x: 0 }}
            exit={isStill ? { opacity: 0 } : { x: "100%", transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.36, ease: DRAWER }}>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    host,
  )
}
