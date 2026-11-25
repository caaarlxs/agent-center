// What a pipeline session does now, for the ticket while it runs: its last
// tool calls (the latest last, open until their result is back, each with when
// it ended) and the subagents of this pass, each with what it was sent to do,
// when it started and ended, and its last step. Read from the transcripts' tails.
// And where a pass's time went: its steps of a minute or more, longest first.

import { readdir, readFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { rowsAt } from "./trace"
import { actionOf, transcriptPath } from "./transcript"

export type Step = { at: number; endedAt: number | null; tool: string; text: string; isOpen: boolean }
export type Helper = { description: string; isDone: boolean; startedAt: number; endedAt: number | null; step: Step | null }
// A step that took long: who took it (a subagent, or null for the session itself) and how long.
export type SlowStep = { who: string | null; tool: string; text: string; ms: number }

const timeOf = (row: any) => Date.parse(row?.timestamp ?? "") || 0
// A subagent's call is a wait for it: its own steps are what took the time.
const WAITS = new Set(["Agent", "Task"])

function allSteps(rows: any[]): (Step & { name: string })[] {
  const steps: (Step & { id: string; name: string })[] = []
  const ended = new Map<string, number>()
  for (const row of rows) {
    const content = Array.isArray(row.message?.content) ? row.message.content : []
    for (const b of content) {
      if (row.type === "user" && b?.type === "tool_result") ended.set(String(b.tool_use_id), timeOf(row))
      if (row.type !== "assistant" || b?.type !== "tool_use") continue
      const a = actionOf(String(b.name), b.input ?? {})
      steps.push({ id: String(b.id), name: String(b.name), at: timeOf(row), endedAt: null, tool: a.tool, text: a.title ?? a.detail, isOpen: true })
    }
  }
  return steps.map(({ id, ...s }) => (ended.has(id) ? { ...s, endedAt: ended.get(id)!, isOpen: false } : s))
}

export const stepsOf = (rows: any[], limit = 6): Step[] => allSteps(rows).slice(-limit).map(({ name, ...s }) => s)

// A subagent, from its meta (what it was sent to do, whether it ended) and its transcript.
export function helperOf(meta: any, rows: any[]): Helper {
  const isDone = !!meta?.finished
  const times = rows.map(timeOf).filter(Boolean)
  return { description: String(meta?.description ?? "Subagent"), isDone, startedAt: times[0] ?? 0, endedAt: isDone ? (times.at(-1) ?? null) : null, step: stepsOf(rows, 1)[0] ?? null }
}

export function slowSteps(parts: { who: string | null; rows: any[] }[], min = 60_000): SlowStep[] {
  return parts.flatMap(({ who, rows }) => allSteps(rows).filter(s => !WAITS.has(s.name) && s.endedAt && s.endedAt - s.at >= min)
    .map(s => ({ who, tool: s.tool, text: s.text, ms: s.endedAt! - s.at })))
    .sort((a, b) => b.ms - a.ms)
}

// The subagents a session started since a time (this pass's): each one's rows and meta.
async function helpersSince(path: string, since: number) {
  const dir = join(dirname(path), basename(path, ".jsonl"), "subagents")
  const names = (await readdir(dir).catch(() => [] as string[])).filter(n => n.endsWith(".meta.json")).sort()
  const all = await Promise.all(names.map(async name => {
    const meta = JSON.parse(await readFile(join(dir, name), "utf8").catch(() => "{}"))
    const rows = await rowsAt(join(dir, name.replace(/\.meta\.json$/, ".jsonl"))).catch(() => [])
    return { rows, helper: helperOf(meta, rows) }
  }))
  return all.filter(h => h.helper.startedAt >= since)
}

// since: when the pass started (a session goes on pass after pass: older subagents are not this one's).
export async function activityOf(sessionId: string, since = 0): Promise<{ steps: Step[]; helpers: Helper[] }> {
  const path = await transcriptPath(sessionId)
  if (!path) return { steps: [], helpers: [] }
  return { steps: stepsOf(await rowsAt(path)), helpers: (await helpersSince(path, since)).map(h => h.helper) }
}

// Where a pass's time went (from its start to its end): the session's and its subagents' slow steps.
export async function timeSpent(sessionId: string, from: number, to: number, max = 8): Promise<SlowStep[]> {
  const path = await transcriptPath(sessionId)
  if (!path) return []
  const inPass = (rows: any[]) => rows.filter(r => timeOf(r) >= from && timeOf(r) <= to)
  const helpers = (await helpersSince(path, from)).filter(h => h.helper.startedAt <= to)
  return slowSteps([{ who: null, rows: inPass(await rowsAt(path)) }, ...helpers.map(h => ({ who: h.helper.description, rows: inPass(h.rows) }))]).slice(0, max)
}
