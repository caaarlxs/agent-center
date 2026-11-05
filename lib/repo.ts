// Git facts about the folders sessions run in: the repository a folder
// belongs to (worktrees fold into their main repository), its branch, every
// repository the sessions have used, and the local state of a PR's branch.

import { stat } from "node:fs/promises"
import { basename, dirname } from "node:path"
import { readDesktop } from "./desktop"
import { run } from "./proc"
import { readSessions } from "./sessions"

const BRANCH_TTL_MS = 30_000

export type RepoInfo = { root: string; name: string; branch: string | null; at: number }
const cache = new Map<string, RepoInfo>()

export async function repoInfo(cwd: string): Promise<RepoInfo> {
  const hit = cache.get(cwd)
  if (hit && Date.now() - hit.at < BRANCH_TTL_MS) return hit
  let root = hit?.root ?? cwd
  if (!hit) {
    const common = await run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd)
    if (common) root = basename(common) === ".git" ? dirname(common) : common
  }
  const branch = await run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd)
  const info = { root, name: basename(root), branch, at: Date.now() }
  cache.set(cwd, info)
  return info
}

// Every repository a desktop session or a hook record has used, newest first.
export async function knownRepos() {
  const [desktop, sessions] = await Promise.all([readDesktop(), readSessions()])
  const seen = new Map<string, number>()
  for (const d of desktop.byHost.values()) if (d.cwd) seen.set(d.cwd, Math.max(seen.get(d.cwd) ?? 0, d.lastActivityAt ?? 0))
  for (const s of sessions) seen.set(s.cwd, Math.max(seen.get(s.cwd) ?? 0, s.updated_at))
  const repos = new Map<string, { root: string; name: string; lastUsed: number }>()
  for (const [cwd, at] of seen) {
    // The app's scratch folders and temporary ones are not places to start from.
    if (cwd.includes("/scratch-workspaces/") || /^\/(private\/)?(tmp|var\/folders)\//.test(cwd)) continue
    if (!(await stat(cwd).then(st => st.isDirectory(), () => false))) continue
    const repo = await repoInfo(cwd)
    const prev = repos.get(repo.root)
    if (!prev || prev.lastUsed < at) repos.set(repo.root, { root: repo.root, name: repo.name, lastUsed: at })
  }
  return [...repos.values()].sort((a, b) => b.lastUsed - a.lastUsed)
}

// What the folder holds that the PR does not yet: changes not committed and
// commits not pushed. Null when the folder is on another branch.
export async function branchState(cwd: string, prBranch: string) {
  const branch = await run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd)
  if (branch !== prBranch) return null
  const status = (await run(["git", "status", "--porcelain"], cwd)) ?? ""
  const ahead = await run(["git", "rev-list", "--count", "@{u}..HEAD"], cwd)
  return { branch, uncommitted: status ? status.split("\n").length : 0, unpushed: ahead === null ? null : Number(ahead) }
}

// Where a session's folder stands, for its next step: changes not committed,
// commits not pushed (null: no upstream), and commits its branch has that the
// repository's default branch has not (null: unknown).
export async function workState(cwd: string) {
  const branch = await run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd)
  if (!branch) return null
  const base = (await run(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd)) ?? null
  const [status, unpushed, ahead] = await Promise.all([
    run(["git", "status", "--porcelain"], cwd),
    run(["git", "rev-list", "--count", "@{u}..HEAD"], cwd),
    base ? run(["git", "rev-list", "--count", `${base}..HEAD`], cwd) : Promise.resolve(null),
  ])
  return {
    branch,
    base: base?.replace(/^origin\//, "") ?? null,
    uncommitted: status ? status.split("\n").length : 0,
    unpushed: unpushed === null ? null : Number(unpushed),
    ahead: ahead === null ? null : Number(ahead),
  }
}

// What a folder holds that is not up yet (the card's git cells): files not
// committed, commits not pushed. Asked at most every WORK_TTL_MS per folder.
const WORK_TTL_MS = 60_000 // each ask is two git processes per folder
const works = new Map<string, { at: number; work: Promise<{ uncommitted: number; unpushed: number } | null> }>()
export function pendingWork(cwd: string) {
  const had = works.get(cwd)
  if (had && Date.now() - had.at < WORK_TTL_MS) return had.work
  const work = workState(cwd).then(w => (w ? { uncommitted: w.uncommitted, unpushed: w.unpushed ?? 0 } : null), () => null)
  works.set(cwd, { at: Date.now(), work })
  return work
}
