// The files of a session, as its transcript names them: the ones Claude
// sent you (SendUserFile), wrote or edited, published as an artifact, or
// named in its answers (a path in backticks, a link). The "Files" tab lists
// the first three; any of them opens in the board's viewer. Only a file a
// session's transcript names is served for it: the board never reads an
// arbitrary path of this Mac. Each transcript is read once, then only what
// it adds.

import { stat } from "node:fs/promises"
import { basename, extname, isAbsolute, resolve } from "node:path"
import { HOME } from "./config"
import { readAppended } from "./files"
import { transcriptPath } from "./transcript"

export type FileRef = {
  path: string
  source: "sent" | "artifact" | "written" | "mentioned"
  at: number
  url?: string // an artifact's page on claude.ai
}

const RANK = { sent: 3, artifact: 2, written: 1, mentioned: 0 }
const WRITERS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"])
const MAX_VIEW_BYTES = 30 * 1024 * 1024

// writes: per file, the ids of the tool calls that wrote it (a copy of a
// conversation, imported again by the app, carries the same ids).
type Scan = { offset: number; files: Map<string, FileRef>; artifacts: Map<string, string>; cwd: string; writes: Map<string, Set<string>> }
const scans = new Map<string, Scan>()

const toAbsolute = (p: string, cwd: string) => {
  const path = p.trim().replace(/^~(?=\/)/, HOME)
  return isAbsolute(path) ? resolve(path) : cwd ? resolve(cwd, path) : null
}

function note(scan: Scan, raw: unknown, source: FileRef["source"], at: number, url?: string) {
  if (typeof raw !== "string" || !raw.trim()) return
  const path = toAbsolute(raw, scan.cwd)
  if (!path) return
  const old = scan.files.get(path)
  if (old && RANK[old.source] > RANK[source]) return void (old.at = Math.max(old.at, at))
  scan.files.set(path, { path, source, at: Math.max(at, old?.at ?? 0), url: url ?? old?.url })
}

// Paths in an answer: in backticks (absolute or ~/), or as a link target.
function mentions(text: string) {
  const out: string[] = []
  for (const m of text.matchAll(/`((?:~|\/)[^`\n]{1,300}?\.[A-Za-z0-9]{1,8})`/g)) out.push(m[1]!)
  for (const m of text.matchAll(/\]\(([^)\s]{1,300}?\.[A-Za-z0-9]{1,8})(?::\d+)?\)/g)) {
    if (/^[a-z]+:/i.test(m[1]!)) continue
    try {
      out.push(decodeURI(m[1]!))
    } catch {
      out.push(m[1]!) // a stray % in the link: keep it as written
    }
  }
  return out
}

function ingest(scan: Scan, chunk: string) {
  for (const line of chunk.split("\n")) {
    if (!line.includes('"tool_use"') && !line.includes('"tool_result"') && !line.includes('"text"')) continue
    let row: any
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.isSidechain || (row.type !== "user" && row.type !== "assistant")) continue
    if (typeof row.cwd === "string") scan.cwd = row.cwd
    const at = Date.parse(row.timestamp ?? "") || 0
    const content = row.message?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      if (row.type === "assistant" && b?.type === "text") for (const p of mentions(String(b.text ?? ""))) note(scan, p, "mentioned", at)
      if (b?.type === "tool_use") {
        const input = b.input ?? {}
        if (b.name === "SendUserFile") for (const f of input.files ?? []) note(scan, f, "sent", at)
        else if (WRITERS.has(b.name)) {
          const raw = input.file_path ?? input.notebook_path
          note(scan, raw, "written", at)
          const path = typeof raw === "string" && raw.trim() ? toAbsolute(raw, scan.cwd) : null
          if (path && b.id) scan.writes.set(path, (scan.writes.get(path) ?? new Set()).add(String(b.id)))
        }
        else if (b.name === "Artifact" && (!input.action || input.action === "publish") && !input.asset && input.file_path) scan.artifacts.set(b.id, input.file_path)
      }
      // An artifact's link comes back in its tool's result.
      if (b?.type === "tool_result" && scan.artifacts.has(b.tool_use_id)) {
        const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "")
        const url = text.match(/https:\/\/claude\.ai\/[\w/.-]+/)?.[0]
        if (url) note(scan, scan.artifacts.get(b.tool_use_id), "artifact", at, url)
        scan.artifacts.delete(b.tool_use_id)
      }
    }
  }
}

async function refsOf(ids: string[]) {
  const all = new Map<string, FileRef>()
  for (const id of ids) {
    const path = await transcriptPath(id)
    if (!path) continue
    const { size } = await stat(path)
    let scan = scans.get(path)
    if (!scan || size < scan.offset) scans.set(path, (scan = { offset: 0, files: new Map(), artifacts: new Map(), cwd: "", writes: new Map() }))
    scan.offset = await readAppended(path, scan.offset, size, text => ingest(scan!, text))
    for (const f of scan.files.values()) {
      const old = all.get(f.path)
      const best = !old || RANK[f.source] > RANK[old.source] ? f : old
      all.set(f.path, { ...best, at: Math.max(f.at, old?.at ?? 0) })
    }
  }
  return all
}

// For the "Files" tab: what the session sent, published or wrote, still on
// disk, newest first.
export async function sessionFiles(ids: string[]) {
  const refs = [...(await refsOf(ids)).values()].filter(f => f.source !== "mentioned").sort((a, b) => b.at - a.at).slice(0, 200)
  const out = []
  for (const f of refs) {
    const info = await stat(f.path).catch(() => null)
    if (info?.isFile()) out.push({ ...f, name: basename(f.path), size: info.size, modifiedAt: info.mtimeMs })
  }
  return out
}

// The file at `raw` (absolute, ~/, or relative to the session's folder), if
// the session's transcript names it.
export async function sessionFile(ids: string[], raw: string, cwds: string[]) {
  const refs = await refsOf(ids)
  const candidates = [toAbsolute(raw, ""), ...cwds.map(cwd => toAbsolute(raw, cwd))].filter((p): p is string => !!p)
  const path = candidates.find(p => refs.has(p))
  if (!path) return null
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return null
  return { path, name: basename(path), size: info.size, ext: extname(path).slice(1).toLowerCase(), isViewable: info.size <= MAX_VIEW_BYTES }
}

// What the session wrote or edited since `since`, but the files every
// session touches by design (Claude's notes in ~/.claude, temporary files,
// the task lists): for telling when two sessions edit the same file. Each
// file with the ids of the edits that wrote it.
const SHARED_BY_DESIGN = /^(?:\/private)?\/tmp\/|\/\.claude\/|\/TASKS\.md$|\/organizer\/inbox\.md$/
export async function writtenSince(ids: string[], since: number) {
  const refs = await refsOf(ids)
  const writes = new Map<string, Set<string>>()
  for (const id of ids) {
    const scan = scans.get((await transcriptPath(id)) ?? "")
    for (const [path, set] of scan?.writes ?? []) writes.set(path, new Set([...(writes.get(path) ?? []), ...set]))
  }
  return new Map(
    [...refs.values()]
      .filter(f => f.source === "written" && f.at >= since && !SHARED_BY_DESIGN.test(f.path))
      .map(f => [f.path, writes.get(f.path) ?? new Set<string>()] as const),
  )
}
