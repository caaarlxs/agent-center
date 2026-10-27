// The server's side of the bridge mod (bridge/): messages for a session go to
// its outbox; the mod, running inside that session, submits them as the
// person's prompt and acknowledges them. Single writer per file:
//   outbox/<session>/<msg>.json  this server (writes; deletes once acknowledged
//                                or taken back)
//   control/<session>.json       this server: { stop } asks the mod to end the turn
//   acks/<session>.json          the mod: { delivered, stopped }
//   alive/<session>.json         the mod: { at, busy, v } (heartbeat every 2 s)
//   questions/<session>.json     the mod (v5): { id, questions } the question the session
//                                asks (AskUserQuestion) while it waits; id null once answered
//   answers/<session>.json       this server: { id, answers } the board's answer to it
//
// A message waits UNDO_MS before the mod may take it, and the mod (v2) holds
// it while a turn runs: until delivered, `unsend` takes it back.

import { readdir, unlink } from "node:fs/promises"
import { join } from "node:path"
import { CENTER_DIR } from "./config"
import { readJson, writeJsonAtomic } from "./files"

const BASE = CENTER_DIR
const ALIVE_MS = 10_000
const MAX_TEXT = 300_000 // about 75k tokens: a long paste fits; a file is better beyond
const UNDO_MS = 5000
// A message the session has not taken this long after it could have (sent and
// past its undo time, with the session already gone quiet): the server's
// tries to wake it (lib/wake.ts) did not work.
const STUCK_MS = 100_000

// lastSeen: the newest heartbeat, null when the mod never ran in the session.
// busy: a turn ran at that heartbeat (mod v2 and later; null before).
// version: the mod's protocol; 1 can neither hold messages nor stop a turn.
// limits: the account's rate-limit windows the mod last read (v3 and later).
export type Limits = { at: number; windows: { kind: string; percentUsed: number; resetsAt?: string }[] }
export type BridgeStatus = {
  isOpen: boolean
  pending: number
  lastSeen: number | null
  busy: boolean | null
  version: number
  limits: Limits | null
  settings: { id: string; results: Record<string, string> } | null // the mod's answer to the last change
  stuck: string[] // ids of messages waiting too long for a session that is not running
  failed: { id: string; reason: string }[] // messages the session refused (mod v6), still here to take back
  queued: { id: string; text: string }[] // the messages still waiting, oldest first
  question: Question | null // the question waiting for an answer, which the board can give
  permission: Permission | null // the tool approval the client asks for now (mod v7)
}

export type Permission = { id: string; tool: string; input: Record<string, unknown> }

export type Question = {
  id: string // the AskUserQuestion call
  questions: { question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string }[] }[]
}

const isId = (id: string) => /^[\w-]+$/.test(id)

// A turn ran at the last heartbeat, recently: the session works (a long tool
// run pauses the mod's timer, so no beat comes meanwhile), it is not asleep.
const BUSY_GRACE_MS = 15 * 60_000
export function isBusy(bridge: { busy: boolean | null; lastSeen: number | null }) {
  return bridge.busy === true && bridge.lastSeen !== null && Date.now() - bridge.lastSeen < BUSY_GRACE_MS
}

export async function send(sessionId: string, text: string) {
  if (!isId(sessionId)) throw new Error("invalid session")
  const body = text.trim()
  if (!body) throw new Error("the message is empty")
  if (body.length > MAX_TEXT) throw new Error(`the message is longer than ${MAX_TEXT.toLocaleString("en-GB")} characters: send it as a file`)
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  // The temp name does not end in .json: the mod never reads half a message.
  await writeJsonAtomic(join(BASE, "outbox", sessionId, `${id}.json`), { id, text: body, at: Date.now(), notBefore: Date.now() + UNDO_MS })
  return id
}

// The sessions with a message in their outbox (delivered or not).
export async function waitingSessions() {
  const out: string[] = []
  for (const id of await readdir(join(BASE, "outbox")).catch(() => [] as string[])) {
    if (!isId(id)) continue
    const names = await readdir(join(BASE, "outbox", id)).catch(() => [] as string[])
    if (names.some(n => n.endsWith(".json"))) out.push(id)
  }
  return out
}

// The board's answer to the question the session asks: question text -> the
// label picked (comma-joined when several) or the text typed.
export async function answer(sessionId: string, questionId: string, answers: Record<string, string>) {
  if (!isId(sessionId) || !/^[\w-]+$/.test(questionId)) throw new Error("invalid question")
  const current = (await status(sessionId)).question
  if (current?.id !== questionId) throw new Error("The question no longer waits for an answer")
  const clean: Record<string, string> = {}
  for (const q of current.questions) {
    const value = String(answers[q.question] ?? "").trim()
    if (!value) throw new Error(`Missing the answer to "${q.question}"`)
    clean[q.question] = value.slice(0, 2000)
  }
  await writeJsonAtomic(join(BASE, "answers", `${sessionId}.json`), { id: questionId, answers: clean, at: Date.now() })
}

// The board's allow or deny for the tool approval the client asks for.
export async function permit(sessionId: string, permissionId: string, decision: string) {
  if (!isId(sessionId) || !/^[\w-]+$/.test(permissionId)) throw new Error("invalid approval")
  if (decision !== "allow" && decision !== "deny") throw new Error("invalid decision")
  if ((await status(sessionId)).permission?.id !== permissionId) throw new Error("That approval no longer waits for an answer")
  await writeJsonAtomic(join(BASE, "permits", `${sessionId}.json`), { id: permissionId, decision, at: Date.now() })
}

// Takes a message back while the mod has not delivered it. False: too late.
export async function unsend(sessionId: string, messageId: string) {
  if (!isId(sessionId) || !/^[\w-]+$/.test(messageId)) return false
  try {
    if (((await readJson(join(BASE, "acks", `${sessionId}.json`))).delivered ?? []).includes(messageId)) return false
  } catch {}
  return unlink(join(BASE, "outbox", sessionId, `${messageId}.json`)).then(
    () => true,
    () => false,
  )
}

// The messages that wait for a session, taken out of its outbox, oldest first
// (past their undo time, not delivered nor refused): the board delivers them
// itself (lib/deliver.ts). `putBack` returns them when that did not work.
export type Message = { id: string; text: string; at: number; notBefore: number }
export async function takeQueued(sessionId: string): Promise<Message[]> {
  if (!isId(sessionId)) return []
  let done = new Set<string>()
  try {
    const acks = await readJson(join(BASE, "acks", `${sessionId}.json`))
    done = new Set([...(acks.delivered ?? []), ...(acks.failed ?? []).map((f: { id: string }) => f.id)])
  } catch {}
  const dir = join(BASE, "outbox", sessionId)
  const out: Message[] = []
  for (const name of (await readdir(dir).catch(() => [] as string[])).filter(n => n.endsWith(".json")).sort()) {
    const id = name.slice(0, -5)
    if (done.has(id)) continue
    try {
      const msg = (await readJson(join(dir, name))) as Message
      if (!msg.text || Date.now() < (msg.notBefore ?? 0)) continue
      await unlink(join(dir, name))
      out.push(msg)
    } catch {}
  }
  return out
}

export async function putBack(sessionId: string, messages: Message[]) {
  for (const m of messages) await writeJsonAtomic(join(BASE, "outbox", sessionId, `${m.id}.json`), m)
}

// Asks the session's mod (v4) to change its permission mode, model or effort.
// Answers the request id; status() reports the mod's results under `settings`.
export async function requestSettings(sessionId: string, changes: { mode?: string; model?: string; effort?: string }) {
  if (!isId(sessionId)) throw new Error("invalid session")
  const id = crypto.randomUUID()
  await writeJsonAtomic(join(BASE, "settings", `${sessionId}.json`), { id, ...changes, at: Date.now() })
  return id
}

// Asks the session's mod to end the running turn. It acts on its next tick or
// before the next tool call (its timer pauses while a tool runs).
export async function stop(sessionId: string) {
  if (!isId(sessionId)) throw new Error("invalid session")
  await writeJsonAtomic(join(BASE, "control", `${sessionId}.json`), { stop: crypto.randomUUID(), at: Date.now() })
}

// Whether the session's mod is running, and how many messages still wait.
// Also deletes the messages the mod has acknowledged.
export async function status(sessionId: string): Promise<BridgeStatus> {
  if (!isId(sessionId)) return { isOpen: false, pending: 0, lastSeen: null, busy: null, version: 0, limits: null, settings: null, stuck: [], failed: [], queued: [], question: null, permission: null }
  let lastSeen: number | null = null
  let busy: boolean | null = null
  let version = 0
  let limits: Limits | null = null
  try {
    const alive = await readJson(join(BASE, "alive", `${sessionId}.json`))
    lastSeen = alive.at ?? null
    busy = typeof alive.busy === "boolean" ? alive.busy : null
    version = alive.v ?? 1
    limits = alive.limits?.windows?.length ? alive.limits : null
  } catch {}
  const isOpen = lastSeen !== null && Date.now() - lastSeen < ALIVE_MS
  let delivered = new Set<string>()
  let refused = new Map<string, string>()
  let settings: BridgeStatus["settings"] = null
  try {
    const acks = await readJson(join(BASE, "acks", `${sessionId}.json`))
    delivered = new Set(acks.delivered ?? [])
    refused = new Map((acks.failed ?? []).map((f: { id: string; reason: string }) => [f.id, f.reason]))
    settings = acks.settings ?? null
  } catch {}
  const dir = join(BASE, "outbox", sessionId)
  let pending = 0
  const stuck: string[] = []
  const failed: BridgeStatus["failed"] = []
  const queued: { id: string; text: string }[] = []
  const isWorking = isBusy({ busy, lastSeen })
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith(".json")) continue
    const id = name.slice(0, -5)
    if (delivered.has(id)) {
      await unlink(join(dir, name)).catch(() => {})
      continue
    }
    try {
      queued.push({ id, text: String((await readJson(join(dir, name))).text ?? "") })
    } catch {}
    if (refused.has(id)) {
      failed.push({ id, reason: refused.get(id)! })
      continue
    }
    pending++
    const sentAt = Number(id.split("-")[0]) || 0
    const since = Math.max(sentAt + UNDO_MS, lastSeen ?? 0)
    if (!isOpen && !isWorking && Date.now() - since > STUCK_MS) stuck.push(id)
  }
  queued.sort((a, b) => a.id.localeCompare(b.id))
  // Only while the session lives: a closed one asks nothing any more.
  let question: Question | null = null
  if (isOpen) {
    try {
      const q = await readJson(join(BASE, "questions", `${sessionId}.json`))
      if (q.id && Array.isArray(q.questions)) question = { id: String(q.id), questions: q.questions }
    } catch {}
  }
  let permission: Permission | null = null
  if (isOpen) {
    try {
      const p = await readJson(join(BASE, "permissions", `${sessionId}.json`))
      if (p.id && p.tool) permission = { id: String(p.id), tool: String(p.tool), input: p.input ?? {} }
    } catch {}
  }
  return { isOpen, pending, lastSeen, busy, version, limits, settings, stuck, failed, queued, question, permission }
}
