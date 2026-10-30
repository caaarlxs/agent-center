// The "Commits" tab: the git history of every repository a session touched,
// as a git log since the conversation began. The repositories are its
// folder's and those of the files it edited (lib/session-changes.ts); one it
// only ran commands in (a commit after a `cd`) is not known. The commits the
// session made are marked: their hash shows in its transcript, wherever git
// printed it ("[main abc1234] message", a log, a push's "abc1234..def5678").

import { stat } from "node:fs/promises"
import { basename, dirname } from "node:path"
import { readAppended } from "./files"
import { run } from "./proc"
import { touchedPaths } from "./session-changes"
import { transcriptPath } from "./transcript"

const MAX_COMMITS = 60
const SEP = "\x1f"

export type Commit = { hash: string; short: string; author: string; at: number; subject: string; isMine: boolean; isPushed: boolean; url: string | null }
export type RepoLog = { root: string; name: string; branch: string | null; url: string | null; commits: Commit[] }

const git = (root: string, args: string[]) => run(["git", "-C", root, ...args], root, { timeoutMs: 15_000 })

// Every hash-like word in a text: 7 to 40 hex digits, on their own.
const HEX = /(?<![0-9a-zA-Z])[0-9a-f]{7,40}(?![0-9a-zA-Z])/g
export const hashesIn = (text: string) => text.match(HEX) ?? []
// A commit the text names: by its full hash, or a short one of it.
export const isNamed = (hash: string, named: Set<string>) =>
  named.has(hash) || [7, 8, 9, 10, 11, 12].some(n => named.has(hash.slice(0, n)))

// A remote's web page, for GitHub ("git@github.com:o/r.git", "https://github.com/o/r").
export function webOf(remote: string | null): string | null {
  const m = remote?.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `https://github.com/${m[1]}/${m[2]}` : null
}

// Per transcript: what was read of it, when it began, the hashes it printed.
const scans = new Map<string, { offset: number; began: number | null; hashes: Set<string> }>()
async function scanned(id: string) {
  const path = await transcriptPath(id)
  if (!path) return null
  const { size } = await stat(path)
  let scan = scans.get(id)
  if (!scan || size < scan.offset) scans.set(id, (scan = { offset: 0, began: null, hashes: new Set() }))
  const s = scan
  s.offset = await readAppended(path, s.offset, size, text => {
    if (s.began === null) {
      const at = text.match(/"timestamp":"([^"]+)"/)?.[1]
      if (at) s.began = Date.parse(at)
    }
    for (const hash of hashesIn(text)) s.hashes.add(hash)
  })
  return s
}

const roots = new Map<string, string | null>()
async function rootOf(dir: string) {
  if (!roots.has(dir)) roots.set(dir, await git(dir, ["rev-parse", "--show-toplevel"]).catch(() => null))
  return roots.get(dir) ?? null
}

// Every repository the session touched: its folder's first.
export async function sessionRepos(ids: string[], cwd: string): Promise<string[]> {
  const found = new Set<string>()
  const own = await rootOf(cwd)
  if (own) found.add(own)
  for (const dir of new Set((await touchedPaths(ids)).map(p => dirname(p)))) {
    const root = await stat(dir).then(() => rootOf(dir), () => null)
    if (root) found.add(root)
  }
  return [...found]
}

export async function sessionCommits(ids: string[], cwd: string): Promise<RepoLog[]> {
  const scans = (await Promise.all(ids.map(scanned))).filter(s => s !== null)
  const began = Math.min(...scans.map(s => s.began ?? Date.now()))
  const named = new Set(scans.flatMap(s => [...s.hashes]))
  const out: RepoLog[] = []
  for (const root of await sessionRepos(ids, cwd)) {
    const [log, local, branch, remote] = await Promise.all([
      git(root, ["log", "--branches", `--since=${new Date(began - 60_000).toISOString()}`, `-n${MAX_COMMITS}`, `--format=%H${SEP}%h${SEP}%an${SEP}%at${SEP}%s`]),
      git(root, ["log", "--branches", "--not", "--remotes", `-n${MAX_COMMITS * 2}`, "--format=%H"]),
      git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      git(root, ["remote", "get-url", "origin"]).catch(() => null),
    ])
    const url = webOf(remote)
    const unpushed = new Set((local ?? "").split("\n").filter(Boolean))
    const commits = (log ?? "").split("\n").filter(Boolean).map(line => {
      const [hash = "", short = "", author = "", at = "0", subject = ""] = line.split(SEP)
      return { hash, short, author, at: Number(at) * 1000, subject, isMine: isNamed(hash, named), isPushed: !unpushed.has(hash), url: url ? `${url}/commit/${hash}` : null }
    })
    out.push({ root, name: basename(root), branch: branch ?? null, url, commits })
  }
  return out
}
