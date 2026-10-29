// An image, large, over a dimmed page: a click outside it or Esc closes it.
// One for the whole page; any image opens it with showImage(src). It is a
// dialog, so a press on its backdrop does not close the session panel too.
import { AnimatePresence, motion } from "motion/react"
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { createStore } from "@/lib/store"

const shown = createStore<string | null>(null)
export const showImage = (src: string) => shown.set(src)
const close = () => shown.set(null)

const EASE_OUT = [0.23, 1, 0.32, 1] as const

export function Lightbox() {
  const src = shown.use()
  useEffect(() => {
    if (!src) return
    // Before the board's own Esc (which closes the panel).
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), e.stopImmediatePropagation(), close())
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [src])
  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div key="lightbox" role="dialog" aria-modal="true" aria-label="Image" onClick={close}
          className="fixed inset-0 z-[200] grid cursor-zoom-out place-items-center bg-black/75 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.14 } }} transition={{ duration: 0.18 }}>
          <motion.img src={src} alt="" onClick={e => e.stopPropagation()}
            className="block max-h-[90vh] max-w-[92vw] cursor-default rounded-xl object-contain shadow-pop"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ duration: 0.22, ease: EASE_OUT }} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
