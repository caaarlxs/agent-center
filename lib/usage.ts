// Context used and API-equivalent cost of a conversation, from the `usage`
// Claude Code records on each assistant row. Transcripts are append-only, so
// each pass reads only what was added since the last one.

import { stat } from "node:fs/promises"
import { readAppended } from "./files"
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

function priceOf(model: string) {
  const id = model.replace(/\[.*\]$/, "").replace(/-\d{8}$/, "")
  return PRICES[id] ?? PRICES["claude-opus-5-5"]!
}

type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
}

function costOf(model: string, u: Usage) {
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
}

const scans = new Map<string, Scan>()

function ingest(scan: Scan, chunk: string) {
  for (const line of chunk.split("\n")) {
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
    scan.messages.set(msg.id ?? row.uuid, { model: msg.model ?? "", usage: msg.usage, isMain, at: Date.parse(row.timestamp ?? "") || 0 })
    if (isMain) {
      const u: Usage = msg.usage
      scan.lastContext = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
      scan.lastModel = msg.model ?? scan.lastModel
      scan.lastModelAt = Date.parse(row.timestamp ?? "") || scan.lastModelAt
    }
  }
}

async function scanned(sessionId: string): Promise<Scan | null> {
  const path = await transcriptPath(sessionId)
  if (!path) return null
  const { size } = await stat(path)
  let scan = scans.get(path)
  if (!scan || size < scan.offset) {
    scan = { offset: 0, messages: new Map(), lastContext: 0, lastModel: null, lastModelAt: 0 }
    scans.set(path, scan)
  }
  scan.offset = await readAppended(path, scan.offset, size, text => ingest(scan, text))
  return scan
}

// recentCost: what it spent in the last 5 hours, the plan's short window.
export type SessionUsage = { context: number; window: number; cost: number; recentCost: number; model: string | null; modelAt: number }
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
  return { context: live.lastContext, window: WINDOW, cost: Math.round(cost * 100) / 100, recentCost: Math.round(recentCost * 100) / 100, model: live.lastModel, modelAt: live.lastModelAt }
}
