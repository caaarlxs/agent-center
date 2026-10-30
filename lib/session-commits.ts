// The "Commits" tab: the git history of every repository a session touched,
// as a graph of its branches (local and remote), tags and merges, a page at a
// time, newest first. The repositories are its
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

export const PAGE = 40
const SEP = "\x1f"

export type Ref = { name: string; kind: "head" | "branch" | "remote" | "tag" }
export type Commit = { hash: string; short: string; parents: string[]; refs: Ref[]; author: string; at: number; subject: string; isMine: boolean; isPushed: boolean; url: string | null }
export type RepoLog = { root: string; name: string; branch: string | null; url: string | null; commits: Commit[]; hasMore: boolean }

const git = (root: string, args: string[]) => run(["git", "-C", root, ...args], root, { timeoutMs: 15_000 })

// Every hash-like word in a text: 7 to 40 hex digits, on their own.
const HEX = /(?<![0-9a-zA-Z])[0-9a-f]{7,40}(?![0-9a-zA-Z])/g
export const hashesIn = (text: string) => text.match(HEX) ?? []
// A commit the text names: by its full hash, or a short one of it.
export const isNamed = (hash: string, named: Set<string>) =>
  named.has(hash) || [7, 8, 9, 10, 11, 12].some(n => named.has(hash.slice(0, n)))

// git's full decoration ("HEAD -> refs/heads/main, refs/remotes/origin/main,
// tag: refs/tags/v1.0") as refs; a remote's HEAD left out.
export function refsOf(decoration: string): Ref[] {
  return decoration.split(", ").filter(Boolean).flatMap((d): Ref[] => {
    const head = d.startsWith("HEAD -> ")
    const ref = head ? d.slice(8) : d.replace(/^tag: /, "")
    if (ref === "HEAD") return [{ name: "HEAD", kind: "head" }]
    if (ref.startsWith("refs/tags/")) return [{ name: ref.slice(10), kind: "tag" }]
    if (ref.startsWith("refs/remotes/")) return ref.endsWith("/HEAD") ? [] : [{ name: ref.slice(13), kind: "remote" }]
    if (ref.startsWith("refs/heads/")) return [{ name: ref.slice(11), kind: head ? "head" : "branch" }]
    return []
  })
}

// A remote's web page, for GitHub ("git@github.com:o/r.git", "https://github.com/o/r").
export function webOf(remote: string | null): string | null {
  const m = remote?.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `https://github.com/${m[1]}/${m[2]}` : null
}

// Per transcript: what was read of it, and the hashes it printed.
const scans = new Map<string, { offset: number; hashes: Set<string> }>()
async function scanned(id: string) {
  const path = await transcriptPath(id)
  if (!path) return null
  const { size } = await stat(path)
  let scan = scans.get(id)
  if (!scan || size < scan.offset) scans.set(id, (scan = { offset: 0, hashes: new Set() }))
  const s = scan
  s.offset = await readAppended(path, s.offset, size, text => {
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

// One page of a repository's graph: every branch, remote branch and tag.
export async function repoPage(root: string, skip: number, named: Set<string>) {
  const [log, local, remote] = await Promise.all([
    git(root, ["log", "--branches", "--remotes", "--tags", "HEAD", "--topo-order", "--decorate=full", `--skip=${skip}`, `-n${PAGE + 1}`, `--format=%H${SEP}%h${SEP}%P${SEP}%D${SEP}%an${SEP}%at${SEP}%s`]),
    git(root, ["rev-list", "--branches", "--not", "--remotes", "-n500"]),
    git(root, ["remote", "get-url", "origin"]),
  ])
  const url = webOf(remote)
  const unpushed = new Set((local ?? "").split("\n").filter(Boolean))
  const hasRemote = remote !== null
  const lines = (log ?? "").split("\n").filter(Boolean)
  const commits: Commit[] = lines.slice(0, PAGE).map(line => {
    const [hash = "", short = "", parents = "", decoration = "", author = "", at = "0", subject = ""] = line.split(SEP)
    return {
      hash, short, parents: parents.split(" ").filter(Boolean), refs: refsOf(decoration), author, at: Number(at) * 1000, subject,
      isMine: isNamed(hash, named), isPushed: hasRemote && !unpushed.has(hash), url: url ? `${url}/commit/${hash}` : null,
    }
  })
  return { commits, hasMore: lines.length > PAGE, url }
}

// What the session's transcripts name (the hashes of its own commits).
export async function namedBy(ids: string[]) {
  const scans = (await Promise.all(ids.map(scanned))).filter(s => s !== null)
  return new Set(scans.flatMap(s => [...s.hashes]))
}

export async function sessionCommits(ids: string[], cwd: string): Promise<RepoLog[]> {
  const named = await namedBy(ids)
  const out: RepoLog[] = []
  for (const root of await sessionRepos(ids, cwd)) {
    const [page, branch] = await Promise.all([repoPage(root, 0, named), git(root, ["rev-parse", "--abbrev-ref", "HEAD"])])
    out.push({ root, name: basename(root), branch: branch ?? null, url: page.url, commits: page.commits, hasMore: page.hasMore })
  }
  return out
}
