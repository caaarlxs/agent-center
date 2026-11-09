// What a ticket leaves once out of the pipeline (Remove, or Start over): its
// runs put aside, the worktrees of their builds (moved with them, so git sees
// them as gone), and the local branches they built on. You see the list, pick,
// and only then it goes. The live run of the ticket, if there is one, and any
// branch still in use, never show up. PRs and GitHub stay as they are.
import type { PipelineState } from "./pipeline"

export type Leftover = {
  id: string
  kind: "run" | "worktree" | "branch"
  label: string
  detail: string | null
  warn: string | null // why you may want to keep it
  isPicked: boolean // picked at first: all but what is not on GitHub
}
export type Archive = { name: string; path: string; at: number; state: PipelineState | null }
export type Worktree = { path: string; branch: string | null; exists: boolean }
export type Clone = { repo: string; worktrees: Worktree[]; branches: { name: string; unpushed: number }[] }
export type Kept = { repo: string; branch: string }
// kept: branches you left when their run went, so they still show up.
export type Found = { key: string; liveDir: string; live: PipelineState | null; archives: Archive[]; clones: Clone[]; kept?: Kept[] }

const ARCHIVE = /^([A-Z][A-Z0-9]+-\d+)\.(removed|old)-(\d+)$/
// A folder of the pipeline that is a run of this ticket put aside.
export const archiveOf = (name: string, key: string) => {
  const m = name.match(ARCHIVE)
  return m && m[1] === key ? { how: m[2] as "removed" | "old", at: Number(m[3]) } : null
}

// git worktree list --porcelain: each worktree's path and branch (the clone's own first, left out).
export function worktreesIn(porcelain: string): { path: string; branch: string | null }[] {
  return porcelain.split(/\n\s*\n/).map(block => {
    const line = (k: string) => block.split("\n").find(l => l.startsWith(`${k} `))?.slice(k.length + 1) ?? null
    return { path: line("worktree") ?? "", branch: line("branch")?.replace(/^refs\/heads\//, "") ?? null }
  }).filter(w => w.path).slice(1)
}
// The branches worth looking at: the ones the runs put aside built on, and their conflicts' own.
export const wantedBranches = (key: string, archives: Archive[], repo: string, local: string[], kept: Kept[] = []) => {
  const built = new Set([...archives.flatMap(a => branchesOf(a.state, repo)), ...kept.filter(k => k.repo === repo).map(k => k.branch)])
  return local.filter(b => built.has(b) || b.startsWith(`conflicts/${key}-`))
}

const under = (path: string, dir: string) => path.startsWith(`${dir}/`)
const branchesOf = (state: PipelineState | null, repo: string) => (state?.units ?? []).filter(u => u.repo === repo && u.branch).map(u => u.branch!)

export function leftoversOf({ key, liveDir, live, archives, clones, kept = [] }: Found): Leftover[] {
  const out: Leftover[] = archives.map(a => ({
    id: `run:${a.name}`, kind: "run", label: `Run put aside on ${new Date(a.at).toISOString().slice(0, 16).replace("T", " ")}`,
    detail: a.state ? `${a.state.stage} · ${a.state.runs} runs` : null, warn: null, isPicked: true,
  }))
  for (const c of clones) {
    // A build's worktree of a run put aside: its folder moved (git sees it gone) or it sits in the archive.
    const isLeft = (w: Worktree) => (under(w.path, liveDir) && !w.exists) || archives.some(a => under(w.path, a.path))
    const left = c.worktrees.filter(isLeft)
    for (const w of left) out.push({ id: `worktree:${c.repo}:${w.path}`, kind: "worktree", label: `${c.repo}: worktree ${w.path.split("/").at(-1)}`, detail: w.branch, warn: null, isPicked: true })
    // A branch they built on, unless the live run uses it or a worktree that stays holds it.
    const inUse = new Set([...branchesOf(live, c.repo), ...c.worktrees.filter(w => !isLeft(w)).map(w => w.branch)])
    for (const b of c.branches.filter(b => wantedBranches(key, archives, c.repo, [b.name], kept).length && !inUse.has(b.name)))
      out.push({ id: `branch:${c.repo}:${b.name}`, kind: "branch", label: `${c.repo}: branch ${b.name}`, detail: null,
        warn: b.unpushed ? `${b.unpushed} commit${b.unpushed === 1 ? "" : "s"} not on GitHub` : null, isPicked: !b.unpushed })
  }
  return out
}

// The branches that stay after a clean up: the board remembers them, their run may be gone.
export const keptAfter = (all: Leftover[], picked: Leftover[]): Kept[] => {
  const gone = new Set(picked.map(l => l.id))
  return all.filter(l => l.kind === "branch" && !gone.has(l.id)).map(l => {
    const [, repo, ...name] = l.id.split(":")
    return { repo: repo!, branch: name.join(":") }
  })
}

// What to do for what you picked, in order: worktrees, then their branches, then the runs (which hold the worktrees' files).
export type Command = { cwd: string; cmd: string[] } | { remove: string }
export function cleanupSteps(picked: Leftover[], repos: string, archives: Archive[]): Command[] {
  const at = (kind: Leftover["kind"]) => picked.filter(l => l.kind === kind).map(l => l.id.split(":"))
  return [
    ...at("worktree").map(([, repo, ...path]) => ({ cwd: `${repos}/${repo}`, cmd: ["git", "worktree", "remove", "--force", path.join(":")] })),
    ...at("branch").map(([, repo, ...name]) => ({ cwd: `${repos}/${repo}`, cmd: ["git", "branch", "-D", name.join(":")] })),
    ...at("run").flatMap(([, name]) => archives.filter(a => a.name === name).map(a => ({ remove: a.path }))),
  ]
}
