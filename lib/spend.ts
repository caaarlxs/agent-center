// Where the account's tokens go: every conversation of the last week (the
// app's, the ones the board runs, the pipeline's, the terminal's, with their
// subagents), priced as lib/usage.ts prices them, split by kind of token,
// origin, model, project and session, for the plan's 5-hour window or the
// week. And what each turn of a conversation cost. Transcripts are read as
// usage.ts reads them: once, then only what they add.

import { readdir, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { PROJECTS_DIR } from "./config"
import { latestState } from "./live"
import { costOf, priceOf, scannedAt, type Usage } from "./usage"

// yours: your conversations (Claude desktop starts them through its SDK too,
// so its own and the ones the board runs look alike); pipeline: its stages;
// terminal: `claude` you ran; helpers: the board's suggestions and digests.
export type Origin = "yours" | "pipeline" | "terminal" | "helpers"
type Message = { model: string; usage: Usage; at: number; isMain: boolean }
type Session = { id: string; title: string; project: string; origin: Origin; lastContext: number; messages: Iterable<Message> }
type Share = { key: string; cost: number }

// A pipeline stage runs in the board's data folder, under its ticket: …/pipeline/PP-2815/work.
const PIPELINE = /[/\\]pipeline[/\\-]([A-Z][A-Z0-9]*-\d+)/

/** The project a session is in: its folder's name, or the ticket a pipeline stage works on. */
export const projectOf = (cwd: string | null) => (cwd ? (PIPELINE.exec(cwd)?.[1] ?? basename(cwd)) : "?")

/** Where a session runs, from what its transcript says of itself. */
export function originOf(entrypoint: string | null, cwd: string | null, model: string | null): Origin {
  if (entrypoint === "cli") return "terminal"
  if (cwd && PIPELINE.test(cwd)) return "pipeline"
  if (entrypoint !== "claude-desktop" && model && /sonnet|haiku/.test(model)) return "helpers"
  return "yours"
}

const sorted = (m: Map<string, number>): Share[] => [...m].map(([key, cost]) => ({ key, cost })).sort((a, b) => b.cost - a.cost)
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

/** The spend since `since` (ms), split every way; the sessions the most costly first. */
export function summarize(sessions: Session[], since: number) {
  const byKind = { cacheRead: 0, cacheWrite: 0, output: 0, input: 0 }
  const [byOrigin, byModel, byProject] = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()]
  const rows: { id: string; title: string; project: string; origin: Origin; cost: number; turns: number; context: number; stepCost: number; model: string | null }[] = []
  for (const s of sessions) {
    let cost = 0
    let turns = 0
    let model: string | null = null
    for (const m of s.messages) {
      if (m.at < since) continue
      const p = priceOf(m.model)
      const u = m.usage
      byKind.cacheRead += ((u.cache_read_input_tokens ?? 0) * p.read) / 1e6
      byKind.cacheWrite += ((u.cache_creation_input_tokens ?? 0) * p.input * 1.25) / 1e6
      byKind.output += ((u.output_tokens ?? 0) * p.output) / 1e6
      byKind.input += ((u.input_tokens ?? 0) * p.input) / 1e6
      const c = costOf(m.model, u)
      cost += c
      add(byModel, m.model.replace(/-\d{8}$/, ""), c)
      if (m.isMain) (turns++, (model = m.model))
    }
    if (cost <= 0) continue
    add(byOrigin, s.origin, cost)
    add(byProject, s.project, cost)
    rows.push({ id: s.id, title: s.title, project: s.project, origin: s.origin, cost, turns, context: s.lastContext, model, stepCost: (s.lastContext * priceOf(model ?? "").read) / 1e6 })
  }
  rows.sort((a, b) => b.cost - a.cost)
  return { since, total: rows.reduce((t, r) => t + r.cost, 0), byKind, byOrigin: sorted(byOrigin), byModel: sorted(byModel), byProject: sorted(byProject), sessions: rows.slice(0, 40) }
}
export type SpendSummary = ReturnType<typeof summarize>

/** Each turn's cost: the responses from one of your messages (`starts`, ms) to the next. */
export function turnCosts(messages: Iterable<Message>, starts: number[]) {
  const sortedStarts = [...starts].sort((a, b) => a - b)
  const out = sortedStarts.map(at => ({ at, cost: 0 }))
  for (const m of messages) {
    let i = sortedStarts.length - 1
    while (i >= 0 && sortedStarts[i]! > m.at) i--
    if (i >= 0) out[i]!.cost += costOf(m.model, m.usage)
  }
  return out
}

// ---------- reading the transcripts ----------

const PROJECTS = PROJECTS_DIR
const WEEK = 7 * 24 * 3600_000

// Every transcript written to since `since`, with its subagents' beside it.
async function transcriptsSince(since: number) {
  const out: { id: string; paths: string[] }[] = []
  for (const dir of await readdir(PROJECTS).catch(() => [] as string[])) {
    const folder = join(PROJECTS, dir)
    for (const name of await readdir(folder).catch(() => [] as string[])) {
      if (!name.endsWith(".jsonl")) continue
      const path = join(folder, name)
      const st = await stat(path).catch(() => null)
      if (!st || st.mtimeMs < since) continue
      const sub = join(folder, basename(name, ".jsonl"), "subagents")
      const helpers = (await readdir(sub).catch(() => [] as string[])).filter(n => n.endsWith(".jsonl")).map(n => join(sub, n))
      out.push({ id: basename(name, ".jsonl"), paths: [path, ...helpers] })
    }
  }
  return out
}

/** The spend of the last `windowMs` (the 5-hour window or the week). */
export async function spendSince(windowMs: number): Promise<SpendSummary> {
  const since = Date.now() - Math.min(windowMs, WEEK)
  const titles = new Map((await latestState().catch(() => null))?.cards.map(c => [c.id, c.title] as const) ?? [])
  const sessions: Session[] = []
  for (const t of await transcriptsSince(since)) {
    const scans = (await Promise.all(t.paths.map(p => scannedAt(p).catch(() => null)))).filter(s => !!s)
    const main = scans[0]
    if (!main) continue
    sessions.push({
      id: t.id, title: titles.get(t.id) ?? main.firstText ?? "Untitled", project: projectOf(main.cwd),
      origin: originOf(main.entrypoint, main.cwd, main.lastModel), lastContext: main.lastContext,
      messages: scans.flatMap(s => [...s.messages.values()]),
    })
  }
  return summarize(sessions, since)
}

/** What each turn of a session cost (all its transcripts: one per CLI id), by when you wrote it. */
export async function sessionTurnCosts(paths: string[]) {
  const scans = (await Promise.all(paths.map(p => scannedAt(p).catch(() => null)))).filter(s => !!s)
  return turnCosts(scans.flatMap(s => [...s.messages.values()]), scans.flatMap(s => s.userAts))
}
