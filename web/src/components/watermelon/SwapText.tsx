// Adapted from Watermelon UI's copy-confirm (ui.watermelon.sh, MIT): when a
// label changes ("Copy" to "Copied"), its letters leave upwards and the new
// ones come in from below, one after the other. Ours keeps the board's type
// and colours; reduced motion keeps only the fade (MotionConfig at the root).
import { AnimatePresence, motion } from "motion/react"

const STEP_S = 0.02 // between letters

export function SwapText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex" }} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} style={{ display: "inline-flex" }}>
          {text.split("").map((char, i) => (
            <motion.span key={i} style={{ display: "inline-block", whiteSpace: char === " " ? "pre" : undefined }}
              initial={{ opacity: 0, y: 5, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 26, delay: i * STEP_S } }}
              exit={{ opacity: 0, y: -5, scale: 0.7, transition: { duration: 0.12 } }}>
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
