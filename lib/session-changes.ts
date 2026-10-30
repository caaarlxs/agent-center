// What a session changed in files outside the git repository it works in
// (its folder is not one, or it edited files elsewhere): read from its own
// edits in its transcript. Each file's original is rebuilt from the file as
// it is now by undoing those edits, last first; the diff is git's, on the
// two texts, so the Changes tab shows them as any other.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative } from "node:path"
import { HOME } from "./config"
import { type FileDiff, parse } from "./changes"
import { exec } from "./proc"
import { transcriptPath } from "./transcript"

export type Touch =
  | { kind: "edit"; old: string; new: string; replaceAll: boolean }
  | { kind: "create" }
  | { kind: "write"; original: string | null } // rewritten whole: what it read first

const MAX_FILE = 400_000 // bytes of a file diffed at most
// Claude's own notes (memory, task lists) and temporary files: not the work.
const NOT_WORK = /^(?:\/private)?\/tmp\/|\/\.claude\//

// The file before the session touched it: its edits undone, last first. An
// edit someone undid since (its new text is gone) leaves the text as it is.
export function originalOf(now: string, touches: Touch[]): string {
  let text = now
  for (const t of [...touches].reverse()) {
    if (t.kind === "create") return ""
    if (t.kind === "write") {
      if (t.original !== null) return t.original
      continue
    }
    if (!text.includes(t.new)) continue
    text = t.replaceAll ? text.split(t.new).join(t.old) : text.replace(t.new, () => t.old)
  }
  return text
}

// What one tool did to its file, from what it gave back: a file written new
// or whole, an edit, or several (MultiEdit).
function touchOf(r: any): Touch[] {
  if (r.type === "create") return [{ kind: "create" }]
  if (r.type === "update") return [{ kind: "write", original: typeof r.originalFile === "string" ? r.originalFile : null }]
  if (Array.isArray(r.edits)) return r.edits.map((e: any) => ({ kind: "edit", old: String(e.old_string ?? ""), new: String(e.new_string ?? ""), replaceAll: !!e.replace_all }))
  if (typeof r.newString === "string") return [{ kind: "edit", old: String(r.oldString ?? ""), new: r.newString, replaceAll: !!r.replaceAll }]
  return []
}

// Every file the session edited or wrote, with its edits in order, from what
// each tool gave back.
async function touchesOf(ids: string[]) {
  const files = new Map<string, Touch[]>()
  for (const id of ids) {
    const path = await transcriptPath(id)
    const text = path ? await readFile(path, "utf8").catch(() => "") : ""
    for (const line of text.split("\n")) {
      if (!line.includes('"filePath"')) continue
      let r: any
      try {
        r = JSON.parse(line).toolUseResult
      } catch {
        continue
      }
      const touches = r && typeof r.filePath === "string" ? touchOf(r) : []
      if (touches.length) files.set(r.filePath, [...(files.get(r.filePath) ?? []), ...touches])
    }
  }
  return files
}

// The files the session edited or wrote, Claude's own notes left out (the
// repositories it touched, lib/session-commits.ts).
export async function touchedPaths(ids: string[]): Promise<string[]> {
  return [...(await touchesOf(ids)).keys()].filter(path => !NOT_WORK.test(path))
}

// How a file shows: from the session's folder when inside it, else from home.
const shownAs = (path: string, cwd: string) => {
  const rel = relative(cwd, path)
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path.replace(HOME, "~")
}

async function bothOf(path: string, touches: Touch[]) {
  const now = await readFile(path, "utf8").catch(() => null)
  if (now !== null && now.length > MAX_FILE) return null
  const original = originalOf(now ?? "", touches)
  return { original, now }
}

// The session's own changes to files outside `skipRoot` (the repository its
// folder is in, whose git diff shows them already).
export async function sessionChanges(ids: string[], cwd: string, skipRoot: string | null): Promise<FileDiff[]> {
  const out: FileDiff[] = []
  const dir = await mkdtemp(join(tmpdir(), "agent-center-diff-"))
  try {
    for (const [path, touches] of await touchesOf(ids)) {
      if (NOT_WORK.test(path) || (skipRoot && !relative(skipRoot, path).startsWith(".."))) continue
      const both = await bothOf(path, touches)
      if (!both || both.original === (both.now ?? "")) continue
      await writeFile(join(dir, "a"), both.original)
      await writeFile(join(dir, "b"), both.now ?? "")
      const { stdout } = await exec(["git", "diff", "--no-index", "--no-color", "--no-ext-diff", join(dir, "a"), join(dir, "b")], { timeoutMs: 10_000 })
      const file = parse(stdout)[0]
      if (!file) continue
      out.push({ ...file, path: shownAs(path, cwd), oldPath: null, status: both.now === null ? "deleted" : both.original === "" ? "added" : "modified", source: "session" })
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return out
}

// Both texts of one of those files, for the side-by-side view.
export async function sessionVersions(ids: string[], shown: string, cwd: string) {
  for (const [path, touches] of await touchesOf(ids)) {
    if (shownAs(path, cwd) !== shown) continue
    const both = await bothOf(path, touches)
    return both ? { path: shown, base: "before this session", original: both.original, modified: both.now ?? "", isDeleted: both.now === null } : null
  }
  return null
}
