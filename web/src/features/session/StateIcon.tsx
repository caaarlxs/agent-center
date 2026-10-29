// A session's state at a glance: a shape and a colour, the same on every view.
// While Claude works, a ring fills with the turn's task list (4 of 6 steps:
// two thirds), or turns with no list; inside, an orb shows what it does now
// (thinking-orbs). At rest, the orb stands still.
import { AlertTriangle, Check, Clock, Eye, List, Lock, MessageCircleQuestion } from "lucide-react"
import { useEffect, useRef } from "react"
import { AskMark, useAskMoment } from "@/components/icona/marks"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { type StateKey, labelOf, stateOf } from "./state"
import { ThinkingOrb } from "thinking-orbs"
import { orbOf } from "@/features/conversation/session-events"

const ORB_FROM = 26 // smaller, the orb's dots blur: the plain icon

const ICON = { asking: MessageCircleQuestion, permission: Lock, review: Eye, pending: List, parked: Clock, done: Check, stale: AlertTriangle }
// Its colour first (the panel reads it), then its soft face.
export const TONE: Record<StateKey, string> = {
  asking: "text-ask bg-ask-soft",
  permission: "text-bad bg-bad-soft",
  review: "text-review bg-review-soft",
  working: "text-work",
  pending: "text-[color-mix(in_srgb,var(--review)_55%,var(--faint))] bg-hover",
  parked: "text-faint bg-hover",
  done: "text-work bg-work-soft",
  stale: "text-faint bg-hover",
}

export function StateIcon({ card, size = 28 }: { card: Card; size?: number }) {
  const state = stateOf(card)
  const rang = useStartsAsking(card.id, state)
  const label = labelOf(card)
  const p = card.progress
  const title = p ? `${label}: step ${Math.min(p.done + 1, p.total)} of ${p.total}${p.current ? ` · ${p.current}` : ""}` : label
  if (state === "working") {
    const pct = p ? p.done / p.total : 0.28
    return (
      <span className="relative inline-flex flex-none items-center justify-center rounded-full text-work" style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
        <svg viewBox="0 0 36 36" aria-hidden="true" className={cn("absolute inset-0 size-full -rotate-90 fill-none", !p && "animate-spin-ring")}>
          <circle cx="18" cy="18" r="15.5" strokeWidth="3.5" className="stroke-work-soft" />
          <circle cx="18" cy="18" r="15.5" strokeWidth="3.5" pathLength={100} strokeLinecap="round" className="stroke-work transition-[stroke-dasharray] duration-500 ease-(--ease-out)"
            strokeDasharray={`${Math.max(4, pct * 100)} 100`} />
        </svg>
        {size >= ORB_FROM ? <ThinkingOrb state={orbOf(card.doing)} size={20} style={{ width: size * 0.62, height: size * 0.62 }} aria-hidden /> : <i className="size-[7px] rounded-full bg-work" />}
      </span>
    )
  }
  // At rest (to review, or read and waiting): the orb, still.
  if ((state === "review" || state === "pending") && size >= ORB_FROM) {
    return (
      <span className={cn("relative inline-flex flex-none items-center justify-center rounded-full", TONE[state])} style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
        <ThinkingOrb state={state === "review" ? "searching" : "breathing"} size={20} paused style={{ width: size * 0.68, height: size * 0.68 }} aria-hidden />
      </span>
    )
  }
  const Icon = ICON[state]
  return (
    <span className={cn("relative inline-flex flex-none items-center justify-center rounded-full", TONE[state])} style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
      <AskMark moment={rang} size={Math.round(size * 0.55)} idle={<Icon style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} />} />
    </span>
  )
}

// The bell rings once when this session starts asking you; the same icon
// showing another session (the panel on j/k) does not count.
function useStartsAsking(id: string, state: StateKey) {
  const rang = useAskMoment()
  const last = useRef({ id, state })
  useEffect(() => {
    const was = last.current
    last.current = { id, state }
    if (was.id === id && was.state !== "asking" && state === "asking") rang.play()
  }, [id, state, rang.play])
  return rang
}
