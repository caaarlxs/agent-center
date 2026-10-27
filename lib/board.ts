// What the person decides on the board (pins, parks, done, archived, names,
// colours, tiers, canvas places, zones and notes), in data/board.json. This process is its
// only writer: every change goes through here and is saved at once.

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { DATA_DIR } from "./config"
import { writeJsonAtomic } from "./files"

const BOARD_PATH = join(DATA_DIR, "board.json")

export type BoardItem = {
  pinned?: boolean // absent: follow the star in the desktop app
  parked_at?: number
  parked_until?: number | null
  done_at?: number
  archived_at?: number // out of the board until the session moves again
  seen_at?: number // the person last looked at it (opened it in the reader)
  title?: string // the person's own name for it, on the board only
  color?: string // the person's own colour for it (CARD_COLORS), on every view
  tier?: string // its row on the tier list (TIERS); absent: the "other" row
  pos?: { x: number; y: number } // where it sits on the canvas view
}

// A named rectangle on the canvas; cards inside it belong to it by position.
// collapsed: folded into a folder tile on the canvas (its cards keep their places).
export type Zone = { id: string; name: string; x: number; y: number; w: number; h: number; collapsed?: boolean }
// A note attached to a card (cardId: the card's desktop id, or its session id)
// keeps x, y relative to that card, and moves with it.
export type Note = { id: string; text: string; x: number; y: number; w: number; h: number; color: string; cardId: string | null }
const NOTE_COLORS = ["yellow", "pink", "blue", "green"]
// The colours a card can wear (public/js/components.js draws them).
export const CARD_COLORS = ["lilac", "blue", "teal", "green", "yellow", "orange", "pink"]
// The rows of the tier list, most important first (public/js/tiers.js names
// them); its last row, "Close", is the done column and needs no tier.
export const TIERS = ["main", "fixes", "searches", "other"]

// A task a session suggested (spawn_task) and what the board did with it:
// the session it started, or when it was dismissed. Keyed by its task id;
// `from`: the session that suggested it.
export type Suggestion = { from: string; session?: string; dismissed_at?: number }

// seenEpoch: when "new since you looked" started; older activity is not new.
export type Board = {
  items: Record<string, BoardItem>; seenEpoch?: number; zones?: Zone[]; notes?: Note[]
  suggestions?: Record<string, Suggestion>
}

export let board: Board = { items: {} }

export async function loadBoard() {
  try {
    board = JSON.parse(await readFile(BOARD_PATH, "utf8"))
    board.items ??= {}
  } catch {
    board = { items: {} }
  }
  if (!board.seenEpoch) {
    board.seenEpoch = Date.now()
    await saveBoard()
  }
}

// One save at a time, each from its own temp file.
let saving: Promise<void> = Promise.resolve()
function saveBoard() {
  const job = saving.then(() => writeJsonAtomic(BOARD_PATH, board, { pretty: true }))
  saving = job.catch(() => {})
  return job
}

// The board item of a group: under its key, or (older items) a CLI id.
export function itemOf(key: string, ids: string[]): BoardItem {
  return board.items[key] ?? ids.map(id => board.items[id]).find(Boolean) ?? {}
}

const ACTIONS = new Set(["pin", "unpin", "park", "unpark", "done", "undone", "archive", "unarchive", "seen", "unseen", "move", "rename", "color", "tier"])
export const isBoardAction = (action: string) => ACTIONS.has(action)

// Applies one of ACTIONS to a group's item (`key`: the group's board key,
// `ids`: its CLI ids, whose older items fold into the key's). Answers an
// error message, or null when it was saved.
export async function applyAction(key: string, ids: string[], action: string, body: Record<string, unknown>) {
  if (!ACTIONS.has(action)) return `unknown action: ${action}`
  let pos: { x: number; y: number } | undefined
  if (action === "move") {
    const x = Number(body.x)
    const y = Number(body.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "invalid position"
    pos = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) }
  }
  // An empty colour takes it off.
  const color = action === "color" ? String(body.color ?? "") : ""
  if (color && !CARD_COLORS.includes(color)) return `unknown colour: ${color}`
  // An empty tier, or "other", puts it back in the default row.
  const tier = action === "tier" ? String(body.tier ?? "") : ""
  if (tier && !TIERS.includes(tier)) return `unknown tier: ${tier}`
  if (!board.items[key]) {
    const legacy = itemOf(key, ids)
    if (Object.keys(legacy).length) board.items[key] = { ...legacy }
  }
  for (const old of ids) if (old !== key) delete board.items[old]
  const item = (board.items[key] ??= {})
  const now = Date.now()
  switch (action) {
    case "pin":
      item.pinned = true
      break
    case "unpin":
      item.pinned = false
      break
    case "park":
      item.parked_at = now
      item.parked_until = typeof body.until === "number" ? body.until : null
      break
    case "unpark":
      delete item.parked_at
      delete item.parked_until
      break
    case "done":
      item.done_at = now
      delete item.parked_at
      delete item.parked_until
      break
    case "undone":
      delete item.done_at
      break
    case "archive":
      item.archived_at = now
      item.done_at ??= now
      delete item.parked_at
      delete item.parked_until
      break
    case "unarchive":
      delete item.archived_at
      break
    case "seen":
      item.seen_at = now
      break
    case "unseen":
      // Back to "To review", as if never opened since its last change.
      item.seen_at = 0
      break
    case "move":
      item.pos = pos
      break
    case "rename": {
      const title = String(body.title ?? "").replace(/\s+/g, " ").trim().slice(0, 140)
      if (title) item.title = title
      else delete item.title
      break
    }
    case "color":
      if (color) item.color = color
      else delete item.color
      break
    case "tier":
      if (tier && tier !== "other") item.tier = tier
      else delete item.tier
      break
  }
  if (Object.keys(item).length === 0) delete board.items[key]
  await saveBoard()
  return null
}

export const isTaskId = (id: unknown): id is string => typeof id === "string" && /^task_[\w-]{1,64}$/.test(id)

// A suggested task started from here (`session`), dismissed, or back again.
export async function setSuggestion(taskId: string, from: string, change: { session: string } | { isDismissed: boolean }) {
  const all = (board.suggestions ??= {})
  if ("session" in change) all[taskId] = { from, session: change.session }
  else if (change.isDismissed) all[taskId] = { ...all[taskId], from, dismissed_at: Date.now() }
  else if (all[taskId]) {
    delete all[taskId].dismissed_at
    if (!all[taskId].session) delete all[taskId]
  }
  await saveBoard()
}

// Zones and notes come back whole after each change, cleaned to safe values.
export async function setZones(raw: unknown[]) {
  board.zones = raw
    .map((z: any) => ({
      id: String(z?.id ?? crypto.randomUUID()).slice(0, 40),
      name: String(z?.name ?? "Zone").replace(/\s+/g, " ").trim().slice(0, 60) || "Zone",
      x: Math.max(0, Math.round(Number(z?.x) || 0)),
      y: Math.max(0, Math.round(Number(z?.y) || 0)),
      w: Math.max(160, Math.round(Number(z?.w) || 320)),
      h: Math.max(120, Math.round(Number(z?.h) || 220)),
      ...(z?.collapsed === true ? { collapsed: true } : {}),
    }))
    .slice(0, 50)
  await saveBoard()
  return board.zones
}

export async function setNotes(raw: unknown[]) {
  board.notes = raw
    .map((n: any) => {
      const cardId = typeof n?.cardId === "string" && /^[\w-]{1,80}$/.test(n.cardId) ? n.cardId : null
      // Relative to the card when attached, so it may be negative.
      const coord = (v: unknown) => (cardId ? Math.max(-1600, Math.min(1600, Math.round(Number(v) || 0))) : Math.max(0, Math.round(Number(v) || 0)))
      return {
        id: String(n?.id ?? crypto.randomUUID()).slice(0, 40),
        text: String(n?.text ?? "").slice(0, 4000),
        cardId,
        x: coord(n?.x),
        y: coord(n?.y),
        w: Math.min(800, Math.max(144, Math.round(Number(n?.w) || 216))),
        h: Math.min(800, Math.max(96, Math.round(Number(n?.h) || 144))),
        color: NOTE_COLORS.includes(n?.color) ? n.color : "yellow",
      }
    })
    .slice(0, 100)
  await saveBoard()
  return board.notes
}
