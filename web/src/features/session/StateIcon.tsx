// A session's state at a glance: a shape and a colour, the same on every view.
// While Claude works, an orb shows what it does now (thinking-orbs); where it
// is too small for one, a ring fills with the turn's task list (4 of 6 steps:
// two thirds), or turns with no list. Every other state but done has its orb too, on its colour:
// moving while it asks for you, still at rest.
import { AlertTriangle, Check, Clock, Eye, List, Lock, MessageCircleQuestion } from "lucide-react"
import { useEffect, useRef } from "react"
import { AskMark, useAskMoment } from "@/components/icona/marks"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { type StateKey, labelOf, stateOf } from "./state"
import { type OrbState, ThinkingOrb } from "thinking-orbs"
import { orbOf } from "@/features/conversation/session-events"

const ORB_FROM = 26 // smaller, the orb's dots blur: the plain icon
const REST_ORB: Partial<Record<StateKey, { orb: OrbState; moves: boolean }>> = {
  asking: { orb: "listening", moves: true },
  permission: { orb: "listening", moves: true },
  review: { orb: "searching", moves: false },
  pending: { orb: "breathing", moves: false },
  parked: { orb: "shaping", moves: false },
  stale: { orb: "solving", moves: false },
}

const ICON = { asking: MessageCircleQuestion, permission: Lock, review: Eye, pending: List, parked: Clock, done: Check, stale: AlertTriangle }
// Its colour first (the panel reads it), then its soft face.
export const TONE: Record<StateKey, string> = {
  asking: "text-ask bg-ask-soft",
  permission: "text-bad bg-bad-soft",
  review: "text-review bg-review-soft",
  working: "text-work bg-work-soft",
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
  // Working: the orb shows what it does now, on its green (the card breathes
  // around it); the step it is on, in the title.
  if (state === "working" && size >= ORB_FROM) {
    return (
      <span className={cn("relative inline-flex flex-none items-center justify-center rounded-full", TONE.working)} style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
        <ThinkingOrb state={orbOf(card.doing)} size={20} style={{ width: size * 0.68, height: size * 0.68 }} aria-hidden />
      </span>
    )
  }
  if (state === "working") {
    const pct = p ? p.done / p.total : 0.28
    return (
      <span className="relative inline-flex flex-none items-center justify-center rounded-full text-work" style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
        <svg viewBox="0 0 36 36" aria-hidden="true" className={cn("absolute inset-0 size-full -rotate-90 fill-none", !p && "animate-spin-ring")}>
          <circle cx="18" cy="18" r="15.5" strokeWidth="3.5" className="stroke-work-soft" />
          <circle cx="18" cy="18" r="15.5" strokeWidth="3.5" pathLength={100} strokeLinecap="round" className="stroke-work transition-[stroke-dasharray] duration-500 ease-(--ease-out)"
            strokeDasharray={`${Math.max(4, pct * 100)} 100`} />
        </svg>
        <i className="size-[7px] rounded-full bg-work" />
      </span>
    )
  }
  // Every other state but done: an orb on its colour. Only what asks for you
  // moves (a question, an approval); what rests stands still.
  const rest = REST_ORB[state]
  if (rest && size >= ORB_FROM) {
    return (
      <span className={cn("relative inline-flex flex-none items-center justify-center rounded-full", TONE[state])} style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
        <ThinkingOrb state={rest.orb} size={20} paused={!rest.moves} style={{ width: size * 0.68, height: size * 0.68 }} aria-hidden />
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
