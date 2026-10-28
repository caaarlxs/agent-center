// Adapted from Watermelon UI's continuous-tabs (ui.watermelon.sh, MIT): the
// session panel's tab row, its underline sliding to the tab you click. Ours
// keeps the thin underline in place of their pill, and a tab changed by a key
// (Esc back to the chat, ⌘⇧F) or another session (j/k) moves it at once.
import { LayoutGroup, motion } from "motion/react"
import { type ReactNode, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Tab } from "@/app/open-session"

const SLIDE = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 } as const
const AT_ONCE = { duration: 0 }

export type PanelTab = { key: Tab; label: string; icon: ReactNode; count?: ReactNode; onHover?: () => void }

export function PanelTabs({ id, tabs, tab, onPick }: { id: string; tabs: PanelTab[]; tab: Tab; onPick: (tab: Tab) => void }) {
  const byPointer = useRef(false) // set by a click; anything else moves it at once
  const transition = byPointer.current ? SLIDE : AT_ONCE
  useEffect(() => void (byPointer.current = false))
  return (
    <LayoutGroup id={`panel-tabs-${id}`}>
      <nav role="tablist" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-3 [scrollbar-width:none]">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} title={t.label} onPointerEnter={t.onHover}
            onClick={e => ((byPointer.current = e.detail > 0), onPick(t.key))}
            className={cn("relative flex items-center gap-1.5 px-2.5 py-[9px] text-[13px] font-[550] whitespace-nowrap text-text-muted transition-colors duration-[120ms] hover:text-text [&_svg]:size-3.5 [&_svg]:opacity-70",
              tab === t.key && "text-text")}>
            {t.icon}{t.label}{t.count}
            {tab === t.key && <motion.i layoutId="underline" transition={transition} className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm bg-text" />}
          </button>
        ))}
      </nav>
    </LayoutGroup>
  )
}
