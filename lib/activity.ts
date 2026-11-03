// What a pipeline session does now, for the ticket while it runs: its last
// tool calls (the latest last, open until their result is back) and its
// subagents, each with what it was sent to do, its last step and whether it
// is done. Read from the transcripts' tails.

import { readdir, readFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { rowsAt } from "./trace"
import { actionOf, transcriptPath } from "./transcript"

export type Step = { at: number; tool: string; text: string; isOpen: boolean }
export type Helper = { description: string; isDone: boolean; step: Step | null }

export function stepsOf(rows: any[], limit = 6): Step[] {
  const steps: (Step & { id: string })[] = []
  const answered = new Set<string>()
  for (const row of rows) {
    const content = Array.isArray(row.message?.content) ? row.message.content : []
    for (const b of content) {
      if (row.type === "user" && b?.type === "tool_result") answered.add(String(b.tool_use_id))
      if (row.type !== "assistant" || b?.type !== "tool_use") continue
      const a = actionOf(String(b.name), b.input ?? {})
      steps.push({ id: String(b.id), at: Date.parse(row.timestamp ?? "") || 0, tool: a.tool, text: a.title ?? a.detail, isOpen: true })
    }
  }
  return steps.slice(-limit).map(({ id, ...s }) => ({ ...s, isOpen: !answered.has(id) }))
}

// The subagents a session started: each one's meta (what it was sent to do,
// whether it ended) and its last step.
async function helpersOf(path: string): Promise<Helper[]> {
  const dir = join(dirname(path), basename(path, ".jsonl"), "subagents")
  const names = (await readdir(dir).catch(() => [] as string[])).filter(n => n.endsWith(".meta.json")).sort()
  return Promise.all(names.map(async name => {
    const meta = JSON.parse(await readFile(join(dir, name), "utf8").catch(() => "{}"))
    const rows = await rowsAt(join(dir, name.replace(/\.meta\.json$/, ".jsonl"))).catch(() => [])
    return { description: String(meta.description ?? "Subagent"), isDone: !!meta.finished, step: stepsOf(rows, 1)[0] ?? null }
  }))
}

export async function activityOf(sessionId: string): Promise<{ steps: Step[]; helpers: Helper[] }> {
  const path = await transcriptPath(sessionId)
  if (!path) return { steps: [], helpers: [] }
  return { steps: stepsOf(await rowsAt(path)), helpers: await helpersOf(path) }
}
