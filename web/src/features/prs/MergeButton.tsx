// Adapted from Watermelon UI's split-button (ui.watermelon.sh, MIT): Merge
// and its method in one button. The left part merges (after the confirm);
// the right part opens the methods in its place, and picking one closes
// them. Ours uses the board's button look and a short spring.
import { ChevronDown, ChevronLeft } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { cn } from "@/lib/utils"

const SPRING = { type: "spring", bounce: 0.2, duration: 0.35 } as const
const part = "inline-flex h-[30px] items-center gap-1 px-3 text-[13px] font-medium transition-[filter,background-color] duration-[120ms] disabled:opacity-50"

export function MergeButton<M extends string>({ label, method, methods, isDisabled, onMerge, onMethod }: {
  label: string; method: M; methods: Record<M, string>; isDisabled: boolean; onMerge: () => void; onMethod: (m: M) => void
}) {
  const [isOpen, setOpen] = useState(false)
  const pick = (m: M) => (onMethod(m), setOpen(false))
  return (
    <span className="inline-flex" onKeyDown={e => e.key === "Escape" && isOpen && (e.stopPropagation(), setOpen(false))}>
      <AnimatePresence mode="popLayout" initial={false}>
        {isOpen ? (
          <motion.span key="methods" className="inline-flex gap-1" initial={{ opacity: 0, scaleX: 0.6, filter: "blur(4px)" }}
            animate={{ opacity: 1, scaleX: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scaleX: 0.6, filter: "blur(4px)" }} transition={SPRING} style={{ originX: 0 }}>
            <button type="button" className={cn(part, "rounded-md border border-line-strong px-2 text-text-muted hover:bg-hover hover:text-text")} onClick={() => setOpen(false)} title="Back" aria-label="Back">
              <ChevronLeft className="size-3.5" />
            </button>
            {(Object.keys(methods) as M[]).map(m => (
              <button key={m} type="button" autoFocus={m === method} onClick={() => pick(m)}
                className={cn(part, "rounded-md border", m === method ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-text hover:bg-hover")}>
                {methods[m]}
              </button>
            ))}
          </motion.span>
        ) : (
          <motion.span key="merge" className="inline-flex overflow-hidden rounded-md bg-brand text-brand-text" initial={{ opacity: 0, scaleX: 1.2, filter: "blur(4px)" }}
            animate={{ opacity: 1, scaleX: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scaleX: 1.2, filter: "blur(4px)" }} transition={SPRING}>
            <button type="button" className={cn(part, "hover:brightness-106")} disabled={isDisabled} onClick={onMerge}>{label}</button>
            <button type="button" className={cn(part, "border-l border-brand-text/25 pr-2 pl-2.5 text-[12.5px] hover:brightness-106")} onClick={() => setOpen(true)}
              title="Merge method" aria-haspopup="true">
              {methods[method]}<ChevronDown className="size-3.5" />
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
