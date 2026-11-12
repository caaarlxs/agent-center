// The "Code" tab: a session's folder as an editor sees it. Its root is the git
// repository the session works in (else its folder); the tree is what git
// tracks, new files, and what git ignores (.env, local settings), dimmed, each
// with its git status. A file
// opens as text and saves back only if nobody changed it since it was read
// (Claude may edit it meanwhile): else the page decides what wins.

import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { basename, join, relative, sep } from "node:path"
import { baseOf } from "./changes"
import { exec, run } from "./proc"

const MAX_FILES = 20_000
const MAX_TEXT = 4 * 1024 * 1024 // bytes opened in the editor at most
const SKIPPED = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", "dist", "build", ".build", "Pods", ".gradle", "coverage", ".next", ".turbo", ".cache", "DerivedData", "Library"])

export type CodeTree = { root: string; name: string; files: string[]; ignored: string[]; status: Record<string, string>; isGit: boolean; truncated: boolean }

const git = (cwd: string, args: string[]) => run(["git", "-C", cwd, ...args], cwd, { timeoutMs: 15_000 })

export async function rootOf(cwd: string) {
  return (await git(cwd, ["rev-parse", "--show-toplevel"])) ?? cwd
}

// A folder that is not a repository: walked, without what is never source.
async function walk(root: string) {
  const out: string[] = []
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (out.length >= MAX_FILES) return
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) await visit(join(dir, entry.name))
      } else if (entry.isFile()) out.push(relative(root, join(dir, entry.name)))
    }
  }
  await visit(root)
  return out
}

// "M", "A", "D", "R" or "U" (new, untracked) per path, as `git status` says.
async function statusOf(root: string) {
  const status: Record<string, string> = {}
  // Not trimmed: the first entry may start with a space (" M path").
  const { stdout } = await exec(["git", "-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, timeoutMs: 15_000 })
  const parts = stdout.split("\0")
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]!
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    status[path] = code === "??" ? "U" : code.includes("D") ? "D" : code.includes("R") ? "R" : code.includes("A") ? "A" : "M"
    if (code.startsWith("R")) i++ // a rename names its old path next
  }
  return status
}

// What git ignores: each file, and each ignored folder walked, without the
// folders that are never source (node_modules, .venv…).
async function ignoredOf(root: string) {
  const listed = await git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"])
  const out: string[] = []
  for (const entry of (listed ?? "").split("\0").filter(Boolean)) {
    if (entry.endsWith(".DS_Store")) continue
    if (!entry.endsWith("/")) out.push(entry)
    else if (!entry.split("/").some(part => SKIPPED.has(part))) out.push(...(await walk(join(root, entry))).map(f => entry + f))
    if (out.length >= MAX_FILES) break
  }
  return out
}

export async function codeTree(cwd: string): Promise<CodeTree> {
  const root = await rootOf(cwd)
  const listed = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  const isGit = listed !== null
  const all = isGit ? [...new Set(listed.split("\0").filter(Boolean))] : await walk(root)
  const status = isGit ? await statusOf(root) : {}
  const ignored = isGit ? await ignoredOf(root) : []
  // A deleted file is still in git's index: gone from the tree, unless it is back.
  const files = [...all.filter(f => status[f] !== "D"), ...ignored].sort((a, b) => a.localeCompare(b))
  return { root, name: basename(root), files: files.slice(0, MAX_FILES), ignored, status, isGit, truncated: files.length > MAX_FILES }
}

// `rel` inside the root, also after links are followed; else null.
async function inside(root: string, rel: string) {
  if (!rel || rel.includes("\0")) return null
  const realRoot = await realpath(root)
  const full = join(realRoot, rel)
  if (!full.startsWith(realRoot + sep)) return null
  const real = await realpath(full).catch(() => null)
  return real && real.startsWith(realRoot + sep) ? real : null
}

// A file as text; `onlyTime`: only when it last changed (the page asks often).
export async function readCode(cwd: string, rel: string, onlyTime = false) {
  const path = await inside(await rootOf(cwd), rel)
  if (!path) return { error: "This file is not in the session's folder", status: 404 }
  const info = await stat(path)
  if (!info.isFile()) return { error: "Not a file", status: 404 }
  if (onlyTime) return { path: rel, mtime: info.mtimeMs, size: info.size }
  if (info.size > MAX_TEXT) return { path: rel, mtime: info.mtimeMs, size: info.size, tooBig: true }
  const buf = await readFile(path)
  if (buf.subarray(0, 8000).includes(0)) return { path: rel, mtime: info.mtimeMs, size: info.size, binary: true }
  return { path: rel, mtime: info.mtimeMs, size: info.size, text: buf.toString("utf8") }
}

// Saves `text` if the file is still as it was read (`mtime`), or `force`.
export async function saveCode(cwd: string, rel: string, text: string, mtime: number, force: boolean) {
  const path = await inside(await rootOf(cwd), rel)
  if (!path) return { error: "This file is not in the session's folder", status: 404 }
  const info = await stat(path)
  if (!info.isFile()) return { error: "Not a file", status: 404 }
  if (!force && info.mtimeMs !== mtime) return { error: "It changed on disk since you opened it", conflict: true, mtime: info.mtimeMs, status: 409 }
  await writeFile(path, text)
  return { ok: true, mtime: (await stat(path)).mtimeMs }
}

// ---------- search ----------

const MAX_MATCHES = 1000
const PER_FILE = 50

export type Match = { path: string; line: number; text: string }

// Every line holding `query` (the words as written, or a regular expression),
// in what the tree shows: git's files and the new ones it does not ignore.
export async function searchCode(cwd: string, query: string, { caseSensitive = false, regex = false } = {}) {
  const root = await rootOf(cwd)
  if (!query.trim()) return { matches: [] as Match[], truncated: false }
  const how = [...(caseSensitive ? [] : ["-i"]), regex ? "-E" : "-F"]
  const isGit = (await git(root, ["rev-parse", "--is-inside-work-tree"])) === "true"
  // -z: "path\0line\0text", whatever the path holds.
  const cmd = isGit
    ? ["git", "-C", root, "grep", "-n", "-I", "-z", "--no-color", "--untracked", "--exclude-standard", "-m", String(PER_FILE), ...how, "-e", query]
    : ["grep", "-r", "-n", "-I", "-Z", "-m", String(PER_FILE), ...[...SKIPPED].map(d => `--exclude-dir=${d}`), ...how, "-e", query, "."]
  const { code, stdout, stderr } = await exec(cmd, { cwd: root, timeoutMs: 20_000 })
  if (code !== 0 && code !== 1) return { error: stderr.trim().split("\n")[0] || "The search failed", matches: [] as Match[], truncated: false }
  const matches: Match[] = []
  for (const row of stdout.split("\n")) {
    if (matches.length >= MAX_MATCHES) return { matches, truncated: true }
    const [path, rest] = [row.slice(0, row.indexOf("\0")), row.slice(row.indexOf("\0") + 1)]
    if (!path || !rest) continue
    // git grep -z ends the line number with \0 too; grep -Z with ":".
    const m = rest.match(/^(\d+)[\0:]([\s\S]*)$/)
    if (m) matches.push({ path: path.replace(/^\.\//, ""), line: Number(m[1]), text: m[2]!.slice(0, 400) })
  }
  return { matches, truncated: false }
}

// ---------- a change, both sides ----------

// A changed file as it was where the branch started (`old`, its path then)
// and as it is now, for the side-by-side diff.
export async function versionsOf(cwd: string, rel: string, oldRel: string | null) {
  const root = await rootOf(cwd)
  const base = await baseOf(root)
  const before = oldRel ?? rel
  if (before.includes("\0") || before.startsWith("-")) return { error: "Bad path", status: 400 }
  const shown = await exec(["git", "-C", root, "show", `${base.sha}:${before}`], { cwd: root, timeoutMs: 15_000 })
  const original = shown.code === 0 ? shown.stdout : "" // new in this branch
  const now = await readCode(root, rel)
  return { path: rel, base: base.name, original, modified: "text" in now ? (now.text ?? "") : "", isDeleted: "error" in now }
}

// ---------- the editor's margin ----------

export type Mark = { kind: "add" | "mod" | "del"; from: number; to: number }

// What changed in a file since its branch started, by line, as VS Code's
// margin shows it: added, modified, and where lines were deleted.
export async function marksOf(cwd: string, rel: string): Promise<Mark[] | null> {
  const root = await rootOf(cwd)
  if (!(await inside(root, rel))) return null
  const base = await baseOf(root)
  const known = await exec(["git", "-C", root, "cat-file", "-e", `${base.sha}:${rel}`], { cwd: root, timeoutMs: 10_000 })
  if (known.code !== 0) {
    // New in this branch (or not in git at all): every line is new.
    const now = await readCode(root, rel)
    const lines = "text" in now && now.text !== undefined ? now.text.replace(/\n$/, "").split("\n").length : 0
    return lines ? [{ kind: "add", from: 1, to: lines }] : []
  }
  const { stdout } = await exec(["git", "-C", root, "diff", "--no-color", "--no-ext-diff", "-U0", base.sha, "--", rel], { cwd: root, timeoutMs: 15_000 })
  const marks: Mark[] = []
  for (const m of stdout.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const removed = m[1] === undefined ? 1 : Number(m[1])
    const at = Number(m[2])
    const added = m[3] === undefined ? 1 : Number(m[3])
    if (added === 0) marks.push({ kind: "del", from: Math.max(at, 1), to: Math.max(at, 1) })
    else marks.push({ kind: removed === 0 ? "add" : "mod", from: at, to: at + added - 1 })
  }
  return marks
}
