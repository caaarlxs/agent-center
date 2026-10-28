// A workspace's side (the Code tree, the changed files) opened to the left of
// the session panel, over the board, so the panel keeps its width when you
// switch tabs. Where the panel fills the window (a medium or narrow one) there
// is no room beside it: `useSideRoom` says so, and the workspace shows its
// side inside instead.
import { motion } from "motion/react"
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { MEDIUM_MAX, useViewportWidth } from "./panel-width"

export const useSideRoom = () => useViewportWidth() > MEDIUM_MAX

export function SideFlyout({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  // The panel itself: positioned, so the side hangs off its left edge.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.querySelector<HTMLElement>("[data-panel]")), [])
  if (!host) return null
  return createPortal(
    <motion.aside aria-label={label}
      className={cn("absolute inset-y-0 right-full flex w-[264px] flex-col border-r border-line bg-side shadow-pop", className)}
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
      {children}
    </motion.aside>,
    host,
  )
}
