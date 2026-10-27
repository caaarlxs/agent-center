// What a message would meet now, said under the reply box (composer.js). The
// mod's heartbeat pauses while a tool runs: a recent beat with a turn running
// means busy. Pure: tested on its own.
import type { Bridge } from "@/lib/api-types"

export const BUSY_MS = 15 * 60_000

export type Reach = { tone: "on" | "busy" | "bad" | "off"; text: string }

export const isBusyNow = (bridge: Bridge | null, isWorking: boolean, now = Date.now()) =>
  isWorking && !!bridge?.lastSeen && now - bridge.lastSeen < BUSY_MS

// Only Claude desktop can help: archived, an untrusted folder, at its cap of
// sessions, or a wake that did not happen.
export const isStuckNow = (bridge: Bridge | null) =>
  !!bridge && (bridge.stuck.length > 0 || !!bridge.wake?.untrusted || !!bridge.wake?.atCap || bridge.isArchived)

export function reachOf(bridge: Bridge | null, isWorking: boolean, isWaking = false, now = Date.now()): Reach {
  if (!bridge) return { tone: "off", text: "Checking the session…" }
  if (bridge.isArchived) return { tone: "bad", text: "Archived in Claude: it does not wake until you unarchive it there (Open in Claude)" }
  if (bridge.wake?.untrusted) return { tone: "bad", text: "Claude does not trust this session's folder: open it in Claude and accept" }
  if (bridge.wake?.atCap && bridge.pending && !bridge.isOpen)
    return { tone: "bad", text: "Claude already runs as many sessions as this Mac's memory allows, so it does not wake this one in the background: write to it in Claude, or close sessions you are not using" }
  if (bridge.stuck.length) return { tone: "bad", text: "The session did not wake: open it in Claude" }
  if (bridge.isOpen) return { tone: "on", text: "Session open: it arrives in a few seconds" }
  if (isBusyNow(bridge, isWorking, now)) return { tone: "busy", text: "Busy: delivered when the turn ends" }
  if (bridge.pending || isWaking) return { tone: "busy", text: "Waking the session in the background…" }
  return { tone: "off", text: "Session asleep: when you send, it wakes in the background" }
}
