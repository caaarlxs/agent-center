// Where the session panel lives (main.js:318-336, 663-686; styles.css:170-177,
// 1106-1114, 1356-1364): fixed at the right, over the page. It slides in and,
// when closed, slides out with its content still drawn. Its width follows
// panel-width.ts; its left edge drags to a width of yours (double-click: back
// to the default), off in a medium window, where it is a 640px sheet.
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { type Open, WORKSPACES } from "@/app/open-session"
import { sideFolded } from "@/app/Sidebar"
import { cn } from "@/lib/utils"
import { MEDIUM_MAX, NARROW_MAX, clampWidth, isWide, needsRoom, panelWidth, savedWidth } from "./panel-width"
import { SessionPanel } from "./SessionPanel"

const EASE = [0.25, 1, 0.5, 1] as const
const SLIDE = { duration: 0.42, ease: EASE }

function useViewportWidth() {
  const [vw, setVw] = useState(window.innerWidth)
  useEffect(() => {
    const on = () => setVw(window.innerWidth)
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
  return vw
}

export function PanelSlot({ open }: { open: Open }) {
  const vw = useViewportWidth()
  const saved = savedWidth.use()
  const wide = isWide.use()
  const room = needsRoom.use()
  const isSlim = sideFolded.use()
  const [dragged, setDragged] = useState<number | null>(null) // the width while the edge is dragged
  const isWorkspace = !!open && WORKSPACES.has(open.tab)
  const sideW = vw <= NARROW_MAX ? 0 : isSlim ? 60 : 256
  const width = dragged ?? panelWidth({ vw, saved, isWide: wide || room, isWorkspace, sideW })
  const canResize = vw > MEDIUM_MAX && !isWorkspace

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const at = (x: number) => clampWidth(window.innerWidth - x, window.innerWidth)
    const move = (ev: PointerEvent) => setDragged(at(ev.clientX))
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      document.documentElement.classList.remove("resizing")
      isWide.set(false)
      savedWidth.set(at(ev.clientX))
      setDragged(null)
    }
    document.documentElement.classList.add("resizing")
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="panel" data-panel
          className={cn("fixed inset-y-0 right-0 z-40 flex shadow-pop", dragged === null && "transition-[width] duration-[420ms] ease-[cubic-bezier(0.25,1,0.5,1)]")}
          style={{ width }}
          initial={{ x: "104%" }} animate={{ x: 0 }} exit={{ x: "104%" }} transition={SLIDE}>
          {canResize && (
            <div data-panel-edge onPointerDown={startDrag} onDoubleClick={() => savedWidth.set(null)} title="Drag to change the width · double-click: default width"
              className={cn("absolute inset-y-0 left-0 z-[5] w-[7px] cursor-col-resize transition-colors duration-[120ms] hover:bg-[color-mix(in_srgb,var(--brand)_45%,transparent)]",
                dragged !== null && "bg-[color-mix(in_srgb,var(--brand)_45%,transparent)]")} />
          )}
          <motion.div className="flex min-w-0 flex-1" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }}
            transition={{ x: SLIDE, opacity: { duration: 0.32, ease: "easeOut" } }}>
            <SessionPanel key={open.id} id={open.id} tab={open.tab} file={open.file} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
