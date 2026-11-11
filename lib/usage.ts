// Context used and API-equivalent cost of a conversation, from the `usage`
// Claude Code records on each assistant row. Transcripts are append-only, so
// each pass reads only what was added since the last one.

import { readdir, stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { own, readAppended } from "./files"
import { transcriptPath } from "./transcript"

const WINDOW = 1_000_000 // every current model has a 1M-token context window

// $ per million tokens (Claude API list prices, cached 2026-10-06).
// read: cache read; cache writes are 1.25x input (5 min) or 2x (1 hour).
const PRICES: Record<string, { input: number; output: number; read: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, read: 0.25 },
  "claude-fable-5": { input: 10, output: 50, read: 1 },
  "claude-opus-5-5": { input: 4, output: 20, read: 0.2 },
  "claude-opus-5": { input: 5, output: 25, read: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, read: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, read: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, read: 0.01 },
}

// A model newer than the list (Fable 5.2) costs as its family's newest here.
export function priceOf(model: string) {
  const id = model.replace(/\[.*\]$/, "").replace(/-\d{8}$/, "")
  const family = /^claude-[a-z]+-/.exec(id)?.[0]
  const kin = family && Object.keys(PRICES).find(k => k.startsWith(family))
  return PRICES[id] ?? (kin ? PRICES[kin] : undefined) ?? PRICES["claude-opus-5-5"]!
}

export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
}

export function costOf(model: string, u: Usage) {
  const p = priceOf(model)
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const w5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0)
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_read_input_tokens ?? 0) * p.read +
      w5m * p.input * 1.25 +
      w1h * p.input * 2) /
    1_000_000
  )
}

type Scan = {
  offset: number
  // One entry per API response: streaming writes a row per content block,
  // each repeating the response's usage; the last one wins.
  messages: Map<string, { model: string; usage: Usage; isMain: boolean; at: number }>
  lastContext: number
  lastModel: string | null
  lastModelAt: number // when it last answered with lastModel
  // What it says of itself (lib/spend.ts): where it was started, its folder, your first words.
  entrypoint: string | null
  cwd: string | null
  firstText: string | null
  userAts: number[] // when you wrote each of your messages, for each turn's cost
}

const scans = new Map<string, Scan>()

const ENTRY = /"entrypoint":"([^"]{1,40})"/
const CWD = /"cwd":"((?:[^"\\]|\\.){1,400})"/
// Your first words in it: a message of yours, not a command, a summary or a tool's answer.
function firstWords(line: string): string | null {
  if (!line.includes('"type":"user"') || line.includes('"isMeta":true') || line.includes('"isCompactSummary":true') || line.includes('"tool_result"')) return null
  try {
    const c = JSON.parse(line).message?.content
    const text: string = typeof c === "string" ? c : Array.isArray(c) ? (c.find((b: any) => b?.type === "text")?.text ?? "") : ""
    const clean = text.replace(/\s+/g, " ").trim()
    return clean && !clean.startsWith("<") ? own(clean.slice(0, 80)) : null
  } catch {
    return null
  }
}

const TIMESTAMP = /"timestamp":"([^"]{10,40})"/
// One copy of each model's name, shared by all the responses that name it.
const models = new Map<string, string>()
const keepModel = (name: string) => {
  const copy = own(name)
  models.set(copy, copy)
  return copy
}
const isYours = (line: string) =>
  line.includes('"type":"user"') && !line.includes('"tool_result"') && !line.includes('"isMeta":true') && !line.includes('"isCompactSummary":true') && !line.includes('"isSidechain":true')

function ingest(scan: Scan, chunk: string) {
  for (const line of chunk.split("\n")) {
    if (!scan.entrypoint) scan.entrypoint = ENTRY.exec(line)?.[1] ? own(ENTRY.exec(line)![1]!) : null
    if (!scan.cwd) scan.cwd = CWD.exec(line)?.[1] ? own(JSON.parse(`"${CWD.exec(line)![1]}"`)) : null
    if (!scan.firstText) scan.firstText = firstWords(line)
    if (isYours(line)) {
      const at = Date.parse(TIMESTAMP.exec(line)?.[1] ?? "")
      if (at) scan.userAts.push(at)
    }
    if (!line.includes('"usage"') || !line.includes('"type":"assistant"')) continue
    let row: any
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const msg = row.message
    if (row.type !== "assistant" || !msg?.usage || msg.model === "<synthetic>") continue
    const isMain = !row.isSidechain
    // Copies of what it keeps: a string taken from the line would keep the whole line alive.
    const u: Usage = msg.usage
    const kept: Usage = { input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_input_tokens: u.cache_read_input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens,
      ...(u.cache_creation ? { cache_creation: { ephemeral_5m_input_tokens: u.cache_creation.ephemeral_5m_input_tokens, ephemeral_1h_input_tokens: u.cache_creation.ephemeral_1h_input_tokens } } : {}) }
    scan.messages.set(own(msg.id ?? row.uuid ?? ""), { model: models.get(msg.model) ?? keepModel(msg.model ?? ""), usage: kept, isMain, at: Date.parse(row.timestamp ?? "") || 0 })
    if (isMain) {
      const u: Usage = msg.usage
      scan.lastContext = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
      scan.lastModel = msg.model ? (models.get(msg.model) ?? keepModel(msg.model)) : scan.lastModel
      scan.lastModelAt = Date.parse(row.timestamp ?? "") || scan.lastModelAt
    }
  }
}

async function scanned(sessionId: string): Promise<Scan | null> {
  const path = await transcriptPath(sessionId)
  return path ? scannedAt(path) : null
}
export async function scannedAt(path: string): Promise<Scan> {
  const { size } = await stat(path)
  let scan = scans.get(path)
  if (!scan || size < scan.offset) {
    scan = { offset: 0, messages: new Map(), lastContext: 0, lastModel: null, lastModelAt: 0, entrypoint: null, cwd: null, firstText: null, userAts: [] }
    scans.set(path, scan)
  }
  scan.offset = await readAppended(path, scan.offset, size, text => ingest(scan, text))
  return scan
}

// What a conversation spent: its tokens by kind (input, output, read from
// and written to the cache), the model that answered most and the
// API-equivalent cost of it all.
export type Spend = { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; model: string | null }
export function spendOf(messages: Iterable<{ model: string; usage: Usage }>): Spend {
  const s: Spend = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, model: null }
  const answers = new Map<string, number>()
  for (const { model, usage: u } of messages) {
    s.input += u.input_tokens ?? 0
    s.output += u.output_tokens ?? 0
    s.cacheRead += u.cache_read_input_tokens ?? 0
    s.cacheWrite += u.cache_creation_input_tokens ?? 0
    s.cost += costOf(model, u)
    answers.set(model, (answers.get(model) ?? 0) + 1)
  }
  s.model = [...answers].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return s
}
// A session's spend with its subagents' (each in a transcript of its own).
export async function sessionSpend(id: string): Promise<Spend | null> {
  const path = await transcriptPath(id)
  if (!path) return null
  const dir = join(dirname(path), basename(path, ".jsonl"), "subagents")
  const helpers = (await readdir(dir).catch(() => [] as string[])).filter(n => n.endsWith(".jsonl")).map(n => join(dir, n))
  const scans = (await Promise.all([path, ...helpers].map(p => scannedAt(p).catch(() => null)))).filter((s): s is Scan => !!s)
  return spendOf(scans.flatMap(s => [...s.messages.values()]))
}

// recentCost: what it spent in the last 5 hours, the plan's short window.
// stepCost: what one more step costs it, its context read again from the cache.
export type SessionUsage = { context: number; window: number; cost: number; recentCost: number; model: string | null; modelAt: number; stepCost: number }
const RECENT_MS = 5 * 3600_000

// `current` is the CLI id running now (its last request is the live
// context); `ids` are every CLI id of the session, for the total cost.
export async function usageOf(current: string, ids: string[]): Promise<SessionUsage | null> {
  const scans = (await Promise.all(ids.map(id => scanned(id).catch(() => null)))).filter(Boolean) as Scan[]
  if (scans.length === 0) return null
  let cost = 0
  let recentCost = 0
  const since = Date.now() - RECENT_MS
  for (const scan of scans)
    for (const m of scan.messages.values()) {
      const c = costOf(m.model, m.usage)
      cost += c
      if (m.at >= since) recentCost += c
    }
  const live = (await scanned(current).catch(() => null)) ?? scans[0]!
  const stepCost = (live.lastContext * priceOf(live.lastModel ?? "").read) / 1_000_000
  return { context: live.lastContext, window: WINDOW, cost: Math.round(cost * 100) / 100, recentCost: Math.round(recentCost * 100) / 100, model: live.lastModel, modelAt: live.lastModelAt, stepCost: Math.round(stepCost * 1000) / 1000 }
}
