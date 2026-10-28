// Adapted from Watermelon UI's inline-edit (ui.watermelon.sh, MIT): while a
// name is being edited, keep and drop rise in beside it. Ours uses the
// panel's small buttons; a press keeps the focus in the field, so its blur
// does not save before ✕ is read.
import { Check, X } from "lucide-react"
import { motion } from "motion/react"

const btn = "inline-grid size-7 shrink-0 place-items-center rounded-md transition-[background-color,transform] duration-[120ms] active:scale-[0.92] [&_svg]:size-3.5"
const RISE = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: [0.19, 1, 0.22, 1] } } as const

export function EditActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <motion.span className="flex gap-1" {...RISE}>
      <button type="button" className={`${btn} bg-brand text-brand-text hover:brightness-106`} title="Keep (↵)" onMouseDown={e => e.preventDefault()} onClick={onSave}><Check /></button>
      <button type="button" className={`${btn} text-text-muted hover:bg-press hover:text-text`} title="Drop (Esc)" onMouseDown={e => e.preventDefault()} onClick={onCancel}><X /></button>
    </motion.span>
  )
}
