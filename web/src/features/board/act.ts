// The board's actions on a session, as the classic board does them
// (main.js act): shown at once, sent to the server, then a toast that names
// the session, with Undo (also Z) when it can be taken back.
import { toast } from "sonner"
import type { Card } from "@/lib/api-types"
import { undoable } from "@/lib/toast"
import { post } from "@/lib/api"
import { launch, stopTurn } from "@/features/session/actions"
import { patchOf } from "./overrides"
import { keepUnread } from "./seen"
import { overrides, selected, showDone } from "./state"
import type { Step } from "./columns"
import { ranksAt, type TierKey, tierOf, TIERS, toTier } from "./tiers"
import { archivedIcon } from "@/components/icona/marks"

export type Action = "pin" | "unpin" | "park" | "unpark" | "done" | "undone" | "archive" | "unarchive" | "seen" | "unseen" | "color" | "tier" | "rank"

const INVERSE: Partial<Record<Action, Action>> = { pin: "unpin", unpin: "pin", park: "unpark", done: "undone", archive: "unarchive", unseen: "seen" }
const MESSAGE: Partial<Record<Action, string>> = { done: "Marked as done", park: "Moved to Later", pin: "Pinned", unpin: "Unpinned", archive: "Archived", unseen: "Marked to review" }

const send = (id: string, action: string, payload: Record<string, unknown> = {}) => post(`/api/sessions/${encodeURIComponent(id)}/${action}`, payload)

// Undo drops the change shown at once, not waiting for it to run out.
function forget(ids: string[]) {
  const rest = { ...overrides.get() }
  for (const id of ids) delete rest[id]
  overrides.set(rest)
}

// The card the keyboard points at next when this one leaves the list.
let orderNow: Card[] = []
export const setOrder = (order: Card[]) => void (orderNow = order)

export async function boardAct(card: Card, action: Action, payload: Record<string, unknown> = {}) {
  if (selected.get() === card.id && ((action === "done" && !showDone.get()) || action === "park")) {
    const i = orderNow.findIndex(c => c.id === card.id)
    selected.set((orderNow[i + 1] ?? orderNow[i - 1])?.id ?? null)
  }
  if (action === "unseen") keepUnread(card.id)
  const patch = patchOf(action, payload)
  if (patch) overrides.set({ ...overrides.get(), [card.id]: { ...overrides.get()[card.id], ...patch, at: Date.now() } })
  try {
    await send(card.id, action, payload)
  } catch (err) {
    forget([card.id])
    return void toast((err as Error).message || "Could not save")
  }
  const inverse = INVERSE[action]
  const message = MESSAGE[action]
  if (!message) return
  const text = `${message}: ${card.title}`
  if (inverse) undoable(text, () => (forget([card.id]), void send(card.id, inverse).catch(() => {})), action === "archive" ? archivedIcon() : undefined)
  else toast(text)
}

// Several steps in a row (a drop on another tier).
export async function boardSteps(card: Card, steps: Step[]) {
  for (const [action, payload] of steps) await boardAct(card, action, payload)
}

// The tier list: a row up or down, or to the one named.
export async function moveToTier(card: Card, key: TierKey) {
  const steps = toTier(card, key)
  if (!steps) return
  await boardSteps(card, steps)
  if (key !== "paused") toast(`${TIERS.find(t => t.key === key)!.label}: ${card.title}`)
}

// A card put at `index` of a row (`row`: that row's cards, in order), from
// another row or from its own: moved there first, then given its place.
export async function placeInTier(card: Card, key: TierKey, row: Card[], index: number) {
  if (tierOf(card) !== key) await moveToTier(card, key)
  for (const [id, rank] of ranksAt(row, card.id, index)) await boardAct(row.find(c => c.id === id) ?? card, "rank", { rank })
}

// Archive all (Done): one toast, one Undo for all of them.
export async function archiveAll(list: Card[]) {
  const at = Date.now()
  overrides.set({ ...overrides.get(), ...Object.fromEntries(list.map(c => [c.id, { column: "archived", at }])) })
  await Promise.all(list.map(c => send(c.id, "archive").catch(() => {})))
  undoable(list.length === 1 ? "1 session archived" : `${list.length} sessions archived`, () => {
    forget(list.map(c => c.id))
    void Promise.all(list.map(c => send(c.id, "unarchive").catch(() => {})))
  }, archivedIcon())
}

// Ends the running turn, like Esc in the app; opens it in Claude desktop.
export { stopTurn as stopSession, launch as openInClaude }

