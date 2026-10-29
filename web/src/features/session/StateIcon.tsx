// A session's state at a glance: a shape and a colour, the same on every view.
// Every state but done is an orb (@yogesharc/thinking-orbs) drawn in its
// colour: while Claude works it shows what it does now, while it asks for
// you it waits, at rest it idles still (an unread one blinks), a stuck one
// holds on retrying. Done is a check. Where it is too small for an orb, the
// plain icon; a working one, a ring that fills with the turn's task list.
import { AlertTriangle, Check, Clock, Eye, List, Lock, MessageCircleQuestion } from "lucide-react"
import { useEffect, useRef } from "react"
import { Orb as OrbView } from "@yogesharc/thinking-orbs"
import { AskMark, useAskMoment } from "@/components/icona/marks"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { type StateKey, labelOf, stateOf } from "./state"
import { type Orb, orbOf } from "@/features/conversation/session-events"

const ORB_FROM = 18 // smaller, its dots run together: the plain icon
const ORB_FILL = 0.86
function restOrb(state: StateKey, isUnread: boolean): { look: Orb; moves: boolean } | null {
  if (state === "asking" || state === "permission") return { look: { state: "waiting", variant: "default" }, moves: true }
  if (state === "review" && isUnread) return { look: { state: "idle", variant: "blink" }, moves: true }
  if (state === "review" || state === "pending" || state === "parked") return { look: { state: "idle", variant: "default" }, moves: false }
  if (state === "stale") return { look: { state: "retrying", variant: "default" }, moves: false }
  return null
}

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
  // The orb in the state's colour (its text colour: TONE's first class).
  const orbIn = (look: Orb, paused = false) => (
    <span className={cn("relative inline-flex flex-none items-center justify-center", TONE[state].split(" ")[0])} style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
      <OrbView {...look} size={Math.round(size * ORB_FILL)} paused={paused} />
    </span>
  )
  // Working: what it does now (the card breathes green around it); the step
  // it is on, in the title.
  if (state === "working" && size >= ORB_FROM) return orbIn(orbOf(card.doing))
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
  // Every other state but done. Only what asks for you (or is new) moves.
  const rest = restOrb(state, card.isUnread)
  if (rest && size >= ORB_FROM) return orbIn(rest.look, !rest.moves)
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
