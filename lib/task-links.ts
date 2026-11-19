// Which session created each organizer task. Tasks added since the session tag
// exists carry it; older ones are found by the `organizer.py add "…"` command
// Claude ran in a conversation. A session that Start fresh continued hands its
// tasks to the new one (its first message names the old transcript,
// lib/handoff.ts freshPrompt), so they follow the work. Scans only what each transcript added since
// the last pass, and only the conversations of the last weeks: reading every
// transcript on the Mac (gigabytes, sessions archived long ago) cost the
// server its memory.

import { readdir, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { PROJECTS_DIR } from "./config"
import { readAppended } from "./files"
import { cleanText } from "./organizer"

const ADD_RE = /organizer\.py\s+add\s+(?:--[\w-]+(?:\s+[^\s"']+)?\s+)*(["'])((?:\\.|(?!\1).)*)\1/gs

const RECENT_MS = 30 * 86_400_000
const scans = new Map<string, { offset: number }>()
const links = new Map<string, { session: string; at: number }>() // clean text → newest session to add it
const continued = new Map<string, string>() // old session → the one Start fresh started from it

const FRESH = "This picks up the work of the session"

/** The session a Start fresh message continues: the transcript it names. Null for any other line. */
export function continuedFrom(row: any): string | null {
  if (row?.type !== "user" || row.isSidechain) return null
  const content = row.message?.content
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((b: any) => (b?.type === "text" ? b.text : "")).join("") : ""
  if (!text.startsWith(FRESH)) return null
  return text.match(/The full conversation is in \S*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl/)?.[1] ?? null
}

function ingest(sessionId: string, chunk: string, mtimeMs: number) {
  for (const line of chunk.split("\n")) {
    if (line.includes(FRESH)) noteContinued(sessionId, line)
    if (!line.includes("organizer.py add")) continue
    let row: any
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.type !== "assistant" || !Array.isArray(row.message?.content)) continue
    const at = Date.parse(row.timestamp ?? "") || mtimeMs
    for (const block of row.message.content) {
      if (block?.type !== "tool_use" || block.name !== "Bash") continue
      for (const m of String(block.input?.command ?? "").matchAll(ADD_RE)) {
        const text = cleanText((m[2] ?? "").replace(/\\(["'])/g, "$1"))
        const prev = links.get(text)
        if (!prev || prev.at <= at) links.set(text, { session: sessionId, at })
      }
    }
  }
}

let refreshing: Promise<void> | null = null

export function refreshLinks() {
  refreshing ??= (async () => {
    const dirs = await readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => [])
    for (const dir of dirs.filter(d => d.isDirectory())) {
      const names = await readdir(join(PROJECTS_DIR, dir.name)).catch(() => [] as string[])
      for (const name of names.filter(n => n.endsWith(".jsonl"))) {
        const path = join(PROJECTS_DIR, dir.name, name)
        try {
          const { size, mtimeMs } = await stat(path)
          if (Date.now() - mtimeMs > RECENT_MS) continue
          const scan = scans.get(path) ?? { offset: 0 }
          scans.set(path, scan)
          if (size < scan.offset) scan.offset = 0
          if (size === scan.offset) continue
          scan.offset = await readAppended(path, scan.offset, size, text => ingest(basename(name, ".jsonl"), text, mtimeMs))
        } catch {}
      }
    }
  })().finally(() => (refreshing = null))
  return refreshing
}

function noteContinued(sessionId: string, line: string) {
  try {
    const old = continuedFrom(JSON.parse(line))
    if (old && old !== sessionId) continued.set(old, sessionId)
  } catch {}
}

/** The session that carries `id`'s work now: the newest Start fresh from it, if any. */
export function latestOf(id: string, next: ReadonlyMap<string, string> = continued) {
  const seen = new Set([id])
  while (next.has(id) && !seen.has(next.get(id)!)) seen.add((id = next.get(id)!))
  return id
}

// The session a task belongs to: its own tag, else the conversation that added
// it; carried on to the session Start fresh continued it in.
export function sessionOf(task: { text: string; session: string | null }) {
  const id = task.session ?? links.get(task.text)?.session ?? null
  return id && latestOf(id)
}
