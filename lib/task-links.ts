// Which session created each organizer task. Tasks added since the session tag
// exists carry it; older ones are found by the `organizer.py add "…"` command
// Claude ran in a conversation. Scans only what each transcript added since
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

function ingest(sessionId: string, chunk: string, mtimeMs: number) {
  for (const line of chunk.split("\n")) {
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

// The session a task belongs to: its own tag, else the conversation that added it.
export function sessionOf(task: { text: string; session: string | null }) {
  return task.session ?? links.get(task.text)?.session ?? null
}
