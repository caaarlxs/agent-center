// A session's state at a glance: a shape and a colour, the same on every view.
// While Claude works, a ring fills with the turn's task list.
import { AlertTriangle, Check, Clock, Eye, List, Lock, MessageCircleQuestion } from "lucide-react"
import { motion } from "motion/react"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { STATE_LABEL, type StateKey, stateOf } from "./state"

const ICON = { asking: MessageCircleQuestion, permission: Lock, review: Eye, pending: List, parked: Clock, done: Check, stale: AlertTriangle }
export const TONE: Record<StateKey, string> = {
  asking: "text-amber-400 bg-amber-400/12",
  permission: "text-rose-400 bg-rose-400/12",
  review: "text-sky-400 bg-sky-400/12",
  working: "text-emerald-400",
  pending: "text-zinc-400 bg-zinc-400/10",
  parked: "text-zinc-500 bg-zinc-500/10",
  done: "text-zinc-500 bg-zinc-500/10",
  stale: "text-orange-400 bg-orange-400/12",
}

export function StateIcon({ card, size = 22 }: { card: Card; size?: number }) {
  const state = stateOf(card)
  const label = STATE_LABEL[state]
  if (state === "working") {
    const p = card.progress
    const pct = p ? p.done / p.total : 0.3
    return (
      <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}
        title={p ? `${label}: step ${Math.min(p.done + 1, p.total)} of ${p.total}` : label}>
        <svg viewBox="0 0 36 36" className={cn("absolute inset-0 -rotate-90", !p && "animate-spin")}>
          <circle cx="18" cy="18" r="15" fill="none" className="stroke-emerald-400/20" strokeWidth="4" />
          <motion.circle cx="18" cy="18" r="15" fill="none" className="stroke-emerald-400" strokeWidth="4" strokeLinecap="round"
            initial={false} animate={{ pathLength: Math.max(0.06, pct) }} transition={{ type: "spring", duration: 0.8, bounce: 0 }} />
        </svg>
        <span className="size-1.5 rounded-full bg-emerald-400" />
      </span>
    )
  }
  const Icon = ICON[state]
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full", TONE[state])} style={{ width: size, height: size }} role="img" aria-label={label} title={label}>
      <Icon className="size-[58%]" />
    </span>
  )
}
