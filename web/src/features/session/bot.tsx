// Each session's bot (bot-avatars): a body of its own, picked from its id so
// it never changes, that hops while the session works, sleeps while its
// process is asleep (Sleep, or the app's own pause) and else looks around.
import { BotAvatar, type BotAvatarState, type BotAvatarType } from "bot-avatars"
import type { Card } from "@/lib/api-types"
import { type StateKey, stateOf } from "./state"

const BODIES: BotAvatarType[] = ["clover", "flower", "triangle", "square", "blob", "ghost", "circle", "drop", "star", "droid", "mech", "alien", "hexagon", "cat", "cloud", "pill", "pebble", "puddle"]

export function botOf(id: string): BotAvatarType {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return BODIES[h % BODIES.length]!
}

export const botState = (state: StateKey, isOpen: boolean): BotAvatarState => (state === "working" ? "working" : isOpen ? "default" : "sleeping")

export function SessionBot({ card, size }: { card: Card; size: number }) {
  return <BotAvatar type={botOf(card.id)} state={botState(stateOf(card), !!card.bridge?.isOpen)} size={size} className="shrink-0" aria-hidden />
}
