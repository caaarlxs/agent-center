// A turn of a session on one timeline (the "Trace" tab): from your message to
// Claude's last word, each model call (from what it waited on to its last
// block), each tool call (from the call to its result), each subagent, and
// each wait for you (a question, a plan to approve), with the tokens and the
// errors. Read from the transcript's tail; the turns it holds can be picked.

import { open, stat } from "node:fs/promises"
import { actionOf, isPersonPrompt, transcriptPath, withoutReminders } from "./transcript"

export type SpanKind = "model" | "tool" | "agent" | "wait"
export type Span = {
  id: string
  kind: SpanKind
  name: string
  detail: string | null
  startMs: number // from the turn's start
  durationMs: number
  isFailed: boolean
  isRunning: boolean
  tokensOut: number | null
}
export type Turn = {
  at: number
  prompt: string
  durationMs: number
  spans: Span[]
  tokens: { input: number; cached: number; output: number }
  isRunning: boolean
}
export type TurnSummary = { at: number; prompt: string; durationMs: number }

const WINDOW = 6 * 1024 * 1024
const MAX_TURNS = 40
const WAITS = new Set(["AskUserQuestion", "ExitPlanMode"])
const AGENTS = new Set(["Task", "Agent"])

const timeOf = (row: any) => Date.parse(row?.timestamp ?? "") || 0
const promptOf = (row: any) => {
  const c = row.message?.content
  const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b: any) => b?.type === "text").map((b: any) => b.text).join(" ") : ""
  return withoutReminders(text).replace(/\s+/g, " ").trim().slice(0, 140)
}

// The turns in some rows: each from a message you wrote to the next one.
export function turnsOf(rows: any[]): any[][] {
  const turns: any[][] = []
  for (const row of rows) {
    if (row.isSidechain) continue
    if (isPersonPrompt(row)) turns.push([row])
    else turns.at(-1)?.push(row)
  }
  return turns
}

// The tool calls in a row of Claude's, each a span from that moment.
function callsIn(row: any, t: number, start: number): Span[] {
  const content = Array.isArray(row.message?.content) ? row.message.content : []
  return content.filter((b: any) => b?.type === "tool_use").map((block: any): Span => {
    const name = String(block.name ?? "")
    const action = actionOf(name, block.input)
    const kind: SpanKind = AGENTS.has(name) ? "agent" : WAITS.has(name) ? "wait" : "tool"
    const label = kind === "wait" ? (name === "ExitPlanMode" ? "Waiting for you: the plan" : "Waiting for you: a question") : action.title ?? action.tool
    return { id: String(block.id), kind, name: label, detail: action.detail || null, startMs: t - start, durationMs: 0, isFailed: false, isRunning: true, tokensOut: null }
  })
}

// What a turn's model calls read and wrote, added up.
function tokensOf(usage: Iterable<any>) {
  const tokens = { input: 0, cached: 0, output: 0 }
  for (const u of usage) {
    tokens.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
    tokens.cached += u.cache_read_input_tokens ?? 0
    tokens.output += u.output_tokens ?? 0
  }
  return tokens
}

// A turn's spans, as its rows come: a model call grows with each block of
// its message, a tool call ends at its result.
class Timeline {
  spans: Span[] = []
  usage = new Map<string, any>()
  private models = new Map<string, Span>()
  private tools = new Map<string, Span>()
  private cursor: number // when Claude last had what it waited for
  end: number
  constructor(readonly start: number) {
    this.cursor = start
    this.end = start
  }
  claude(row: any, t: number) {
    const id = String(row.message?.id ?? row.uuid)
    let model = this.models.get(id)
    if (!model) {
      model = { id, kind: "model", name: "Claude", detail: row.message?.model ?? null, startMs: this.cursor - this.start, durationMs: 0, isFailed: false, isRunning: false, tokensOut: null }
      this.models.set(id, model)
      this.spans.push(model)
    }
    model.durationMs = Math.max(0, t - this.start - model.startMs)
    if (row.message?.usage) this.usage.set(id, row.message.usage)
    model.tokensOut = this.usage.get(id)?.output_tokens ?? null
    if (row.isApiErrorMessage) model.isFailed = true
    for (const span of callsIn(row, t, this.start)) (this.tools.set(span.id, span), this.spans.push(span))
  }
  results(row: any, t: number) {
    for (const block of Array.isArray(row.message?.content) ? row.message.content : []) {
      const span = block?.type === "tool_result" ? this.tools.get(String(block.tool_use_id)) : undefined
      if (!span) continue
      span.durationMs = Math.max(0, t - this.start - span.startMs)
      span.isRunning = false
      span.isFailed = !!block.is_error
      this.cursor = Math.max(this.cursor, t)
    }
  }
}

// One turn's spans. `now`: the end of what still runs (a live turn).
export function turnOf(rows: any[], now = Date.now()): Turn {
  const line = new Timeline(timeOf(rows[0]))
  for (const row of rows.slice(1)) {
    const t = timeOf(row)
    if (!t) continue
    line.end = Math.max(line.end, t)
    if (row.type === "assistant") line.claude(row, t)
    else if (row.type === "user") line.results(row, t)
  }
  const isRunning = line.spans.some(s => s.isRunning)
  const end = isRunning ? Math.max(line.end, now) : line.end
  for (const s of line.spans) if (s.isRunning) s.durationMs = Math.max(0, end - line.start - s.startMs)
  return {
    at: line.start, prompt: promptOf(rows[0]), durationMs: end - line.start,
    spans: line.spans.sort((a, b) => a.startMs - b.startMs), tokens: tokensOf(line.usage.values()), isRunning,
  }
}

async function tailRows(id: string): Promise<any[]> {
  const path = await transcriptPath(id)
  if (!path) return []
  const { size } = await stat(path)
  const from = Math.max(0, size - WINDOW)
  const handle = await open(path, "r")
  let text = ""
  try {
    const buf = Buffer.alloc(size - from)
    await handle.read(buf, 0, buf.length, from)
    text = buf.toString("utf8")
  } finally {
    await handle.close()
  }
  const lines = text.split("\n")
  if (from > 0) lines.shift() // a line cut in two
  const rows = []
  for (const line of lines) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
    try {
      rows.push(JSON.parse(line))
    } catch {}
  }
  return rows
}

// The turns a session's transcript tail holds (newest first), and one of
// them whole: the one that started at `at`, else the last.
export async function traceOf(id: string, at?: number): Promise<{ turns: TurnSummary[]; turn: Turn | null }> {
  const turns = turnsOf(await tailRows(id)).slice(-MAX_TURNS)
  const whole = turns.map(rows => turnOf(rows))
  const picked = (at && whole.find(t => t.at === at)) || whole.at(-1) || null
  return { turns: whole.map(t => ({ at: t.at, prompt: t.prompt, durationMs: t.durationMs })).reverse(), turn: picked }
}
