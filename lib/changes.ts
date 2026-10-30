// What a session changed in its folder: the diff of the working tree against
// where its branch left the default branch (commits, uncommitted edits and new
// files together), parsed into files, hunks and numbered lines for the
// "Changes" tab. Read-only: only `git` reads.

import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { run } from "./proc"

const MAX_DIFF = 1_500_000 // characters of diff text read at most
const MAX_NEW_FILE = 60_000 // bytes shown of a new, untracked file
const NOISY = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Cargo\.lock)$|\.min\.(js|css)$|\.map$/

export type Line = { kind: "add" | "del" | "ctx"; text: string; old: number | null; new: number | null }
export type Hunk = { header: string; lines: Line[] }
export type FileDiff = {
  path: string
  oldPath: string | null
  status: "added" | "deleted" | "modified" | "renamed"
  additions: number
  deletions: number
  binary: boolean
  collapsed: boolean // a lockfile or generated file: counted, not shown
  hunks: Hunk[]
  source?: "session" // outside the repository: from the session's own edits (lib/session-changes.ts)
}
export type Changes = { root: string; branch: string | null; base: string | null; files: FileDiff[]; truncated: boolean } // base null: no repository, only the session's own edits

const git = (cwd: string, args: string[], timeoutMs = 10_000) => run(["git", "-C", cwd, ...args], cwd, { timeoutMs })

// The commit where this branch left the default branch; HEAD on the default
// branch itself, so only unpushed and uncommitted work shows.
export async function baseOf(cwd: string) {
  const remoteHead = (await git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])) ?? null
  const candidates = [remoteHead, "origin/main", "origin/master", "main", "master"].filter(Boolean) as string[]
  for (const ref of candidates) {
    const base = await git(cwd, ["merge-base", "HEAD", ref])
    if (base) return { sha: base, name: ref }
  }
  return { sha: "HEAD", name: "HEAD" }
}

export function parse(text: string): FileDiff[] {
  const files: FileDiff[] = []
  let file: FileDiff | null = null
  let hunk: Hunk | null = null
  let oldNo = 0
  let newNo = 0
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      file = {
        path: m?.[2] ?? line.slice(11), oldPath: null, status: "modified",
        additions: 0, deletions: 0, binary: false, collapsed: false, hunks: [],
      }
      files.push(file)
      hunk = null
      continue
    }
    if (!file) continue
    if (line.startsWith("new file mode")) file.status = "added"
    else if (line.startsWith("deleted file mode")) file.status = "deleted"
    else if (line.startsWith("rename from ")) (file.status = "renamed"), (file.oldPath = line.slice(12))
    else if (line.startsWith("Binary files")) file.binary = true
    else if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
      oldNo = Number(m?.[1] ?? 0)
      newNo = Number(m?.[2] ?? 0)
      hunk = { header: (m?.[3] ?? "").trim(), lines: [] }
      file.hunks.push(hunk)
    } else if (hunk && line.startsWith("+") && !line.startsWith("+++")) {
      hunk.lines.push({ kind: "add", text: line.slice(1), old: null, new: newNo++ })
      file.additions++
    } else if (hunk && line.startsWith("-") && !line.startsWith("---")) {
      hunk.lines.push({ kind: "del", text: line.slice(1), old: oldNo++, new: null })
      file.deletions++
    } else if (hunk && line.startsWith(" ")) {
      hunk.lines.push({ kind: "ctx", text: line.slice(1), old: oldNo++, new: newNo++ })
    }
  }
  return files
}

// New files git does not track yet: shown whole, as added lines.
async function untracked(cwd: string, root: string): Promise<FileDiff[]> {
  const list = (await git(cwd, ["ls-files", "--others", "--exclude-standard", "--full-name"]))?.split("\n").filter(Boolean) ?? []
  const out: FileDiff[] = []
  for (const path of list.slice(0, 50)) {
    const full = join(root, path)
    const size = (await stat(full).catch(() => null))?.size ?? 0
    const buf = size <= MAX_NEW_FILE ? await readFile(full).catch(() => null) : null
    const binary = !buf || buf.includes(0)
    const lines = binary ? [] : buf!.toString("utf8").replace(/\n$/, "").split("\n")
    out.push({
      path, oldPath: null, status: "added", additions: lines.length, deletions: 0, binary,
      collapsed: NOISY.test(path),
      hunks: binary ? [] : [{ header: "", lines: lines.map((text, i) => ({ kind: "add" as const, text, old: null, new: i + 1 })) }],
    })
  }
  return out
}

export async function changesOf(cwd: string): Promise<Changes | null> {
  const root = await git(cwd, ["rev-parse", "--show-toplevel"])
  if (!root) return null
  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])) ?? null
  const base = await baseOf(cwd)
  const raw = (await git(cwd, ["diff", "--no-color", "--no-ext-diff", "-M", base.sha], 20_000)) ?? ""
  const truncated = raw.length > MAX_DIFF
  const files = [...parse(truncated ? raw.slice(0, raw.lastIndexOf("\ndiff --git ", MAX_DIFF)) : raw), ...(await untracked(cwd, root))]
  for (const f of files) if (NOISY.test(f.path)) (f.collapsed = true), (f.hunks = [])
  return { root, branch, base: base.name, files, truncated }
}

// One commit's own changes, as the Changes tab shows a diff; a merge's, against
// the branch it was merged into.
export async function commitDiff(root: string, hash: string): Promise<FileDiff[]> {
  const raw = (await git(root, ["show", "--format=", "--diff-merges=first-parent", "--no-color", "--no-ext-diff", "-M", hash], 20_000)) ?? ""
  const files = parse(raw.length > MAX_DIFF ? raw.slice(0, raw.lastIndexOf("\ndiff --git ", MAX_DIFF)) : raw)
  for (const f of files) if (NOISY.test(f.path)) (f.collapsed = true), (f.hunks = [])
  return files
}
