// The "Commits" tab (lib/session-commits.ts): the git history of every
// repository the session touched, drawn as a graph, as GitLens does: a
// coloured lane per line of work, branches forking and merging, and beside
// each commit its refs (the branch you are on, other branches, remote ones,
// tags). The session's own commits stand out (a brand node, the message in
// bold). A page at a time ("Load more"); each commit opens into its own diff
// (the Changes viewer, to read), says if it is only local, and links to GitHub.
import { ChevronRight, Cloud, GitBranch, Tag } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { get } from "@/lib/api"
import type { Commit, FileDiff, RepoLog } from "@/lib/api-types"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DiffView } from "@/features/changes/Changes"
import { RepoTag } from "@/features/session/SessionPanel"
import { ago } from "@/features/session/state"
import { Anim } from "@/components/icons/animated"
import { type Row, lanesOf, widthOf } from "./graph"

const LANE = 14 // px between lanes
const ROW = 32 // px a commit's line takes
const MID = ROW / 2
const COLOURS = ["var(--brand)", "var(--review)", "var(--work)", "var(--ask)", "#a78bfa", "#f472b6", "#22d3ee", "#a3e635"]
const colour = (lane: number) => COLOURS[lane % COLOURS.length]
const x = (lane: number) => LANE / 2 + lane * LANE + 2

// A line from one lane to another, bending halfway.
const bend = (x1: number, y1: number, x2: number, y2: number) =>
  x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`

// The graph beside one commit: the lines coming down into its row, its node,
// and the lines going on to its parents.
function GraphCell({ row, width, commit }: { row: Row; width: number; commit: Commit }) {
  const isMerge = commit.parents.length > 1
  return (
    <svg width={width} height={ROW} className="block shrink-0 overflow-visible" aria-hidden>
      {row.above.map((h, i) => {
        if (h === null) return null
        const ends = i === row.lane || row.joins.includes(i)
        return <path key={`a${i}`} d={ends ? bend(x(i), 0, x(row.lane), MID) : `M${x(i)} 0V${ROW}`} stroke={colour(i)} strokeWidth={2} fill="none" />
      })}
      {row.parents.map((j, k) => <path key={`p${k}`} d={bend(x(row.lane), MID, x(j), ROW)} stroke={colour(j)} strokeWidth={2} fill="none" />)}
      <circle cx={x(row.lane)} cy={MID} r={commit.isMine ? 5.5 : 4.5} fill={isMerge ? "var(--surface)" : commit.isMine ? "var(--brand)" : colour(row.lane)}
        stroke={commit.isMine ? "var(--brand)" : colour(row.lane)} strokeWidth={isMerge ? 2.5 : commit.isMine ? 2 : 0} />
      {commit.isMine && <circle cx={x(row.lane)} cy={MID} r={8.5} fill="none" stroke="var(--brand)" strokeOpacity={0.35} strokeWidth={1.5} />}
    </svg>
  )
}

// While a commit is open, its lanes run on beside its diff.
function GraphRun({ row, width }: { row: Row; width: number }) {
  return (
    <svg width={width} className="absolute inset-y-0 left-0 h-full" preserveAspectRatio="none" viewBox={`0 0 ${width} 10`} aria-hidden>
      {row.below.map((h, i) => h !== null && <path key={i} d={`M${x(i)} 0V10`} stroke={colour(i)} strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />)}
    </svg>
  )
}

const REF_LOOK = {
  head: "bg-brand text-brand-text",
  branch: "border border-line-strong text-text",
  remote: "border border-dashed border-line-strong text-text-muted",
  tag: "bg-ask-soft text-ask",
} as const
const REF_TITLE = { head: "The branch checked out", branch: "A branch", remote: "A branch on the remote", tag: "A tag" } as const

function RefChip({ name, kind }: Commit["refs"][number]) {
  const Icon = kind === "tag" ? Tag : kind === "remote" ? Cloud : GitBranch
  return (
    <span className={cn("inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-md px-1.5 py-px font-mono text-[11px] leading-[1.5]", REF_LOOK[kind])} title={REF_TITLE[kind]}>
      <Icon className="size-3 shrink-0" /><span className="truncate">{name}</span>
    </span>
  )
}

function CommitRow({ id, root, commit, row, width }: { id: string; root: string; commit: Commit; row: Row; width: number }) {
  const now = useNow()
  const [isOpen, setOpen] = useState(false)
  const [files, setFiles] = useState<FileDiff[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toggle = () => {
    setOpen(!isOpen)
    if (files || isOpen) return
    const q = new URLSearchParams({ root, hash: commit.hash })
    get<{ files: FileDiff[] }>(`/api/sessions/${encodeURIComponent(id)}/commit?${q}`).then(r => setFiles(r.files), (err: Error) => setError(err.message))
  }
  return (
    <li className="flex flex-col">
      <div className={cn("group flex items-center gap-2 rounded-md pr-2", isOpen ? "bg-hover" : "hover:bg-hover")} style={{ height: ROW }}>
        <GraphCell row={row} width={width} commit={commit} />
        <button className="flex h-full min-w-0 flex-1 items-center gap-2 text-left" onClick={toggle} aria-expanded={isOpen}>
          <ChevronRight className={cn("size-3 shrink-0 text-faint transition-transform duration-150 ease-(--ease-out)", isOpen && "rotate-90")} />
          {commit.refs.map(r => <RefChip key={`${r.kind}-${r.name}`} {...r} />)}
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", commit.isMine ? "font-semibold text-text" : "text-text-muted")} title={commit.subject}>{commit.subject}</span>
        </button>
        {!commit.isPushed && <span className="shrink-0 rounded-md bg-ask-soft px-1.5 py-px text-[11px] font-medium text-ask" title="Only on this Mac: not pushed">local</span>}
        <span className="shrink-0 text-xs whitespace-nowrap text-faint" title={new Date(commit.at).toLocaleString("en-GB")}>{commit.author} · {ago(commit.at, now)}</span>
        <code className="shrink-0 font-mono text-[11px] text-faint">{commit.short}</code>
        {commit.url ? <a href={commit.url} target="_blank" rel="noreferrer" title="Open on GitHub" className="inline-grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-press hover:text-text"><Anim.ArrowUpRight size={12} /></a> : <span className="w-6 shrink-0" />}
      </div>
      {isOpen && (
        <div className="relative flex flex-col gap-2.5 pt-1.5 pr-1 pb-3" style={{ paddingLeft: width + 8 }}>
          <GraphRun row={row} width={width} />
          {error ? <p className="m-0 text-xs text-bad">{error}</p> : !files ? <span className="spinner" /> : files.length ? <DiffView files={files} /> : <p className="m-0 text-xs text-text-muted">No changes to show.</p>}
        </div>
      )}
    </li>
  )
}

function RepoGraph({ id, repo }: { id: string; repo: RepoLog }) {
  const [commits, setCommits] = useState(repo.commits)
  const [hasMore, setMore] = useState(repo.hasMore)
  const [isLoading, setLoading] = useState(false)
  // A fresh first page (the tab reads again) keeps what was loaded past it.
  useEffect(() => {
    setCommits(old => {
      if (old.length > repo.commits.length && old[0]?.hash === repo.commits[0]?.hash) return old
      setMore(repo.hasMore)
      return repo.commits
    })
  }, [repo])
  const rows = useMemo(() => lanesOf(commits), [commits])
  const width = widthOf(rows) * LANE + 4
  const mine = commits.filter(c => c.isMine).length
  const more = () => {
    setLoading(true)
    const q = new URLSearchParams({ root: repo.root, skip: String(commits.length) })
    get<{ commits: Commit[]; hasMore: boolean }>(`/api/sessions/${encodeURIComponent(id)}/commits?${q}`)
      .then(r => (setCommits(c => [...c, ...r.commits]), setMore(r.hasMore)), () => {})
      .finally(() => setLoading(false))
  }
  return (
    <section className="flex flex-col gap-1">
      <header className="flex items-center gap-2.5 px-2 pb-1">
        <RepoTag name={repo.name} />
        {repo.branch && <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono text-[11.5px] text-text-muted"><GitBranch className="size-3 shrink-0" />{repo.branch}</span>}
        {mine > 0 && <span className="inline-flex items-center gap-1.5 text-xs text-text-muted"><i className="size-2 rounded-full bg-brand" />{mine} by this session</span>}
        <span className="flex-1" />
        {repo.url && <a href={repo.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-text-muted no-underline hover:text-text">GitHub<Anim.ArrowUpRight size={12} /></a>}
      </header>
      {commits.length ? <ul className="m-0 flex list-none flex-col p-0">{commits.map((c, i) => <CommitRow key={c.hash} id={id} root={repo.root} commit={c} row={rows[i]!} width={width} />)}</ul>
        : <p className="m-0 px-2 text-xs text-text-muted">No commits yet.</p>}
      {hasMore && <Button variant="ghost" className="mt-1 self-start" disabled={isLoading} onClick={more}>{isLoading ? "Loading…" : "Load 40 more"}</Button>}
    </section>
  )
}

export function Commits({ id }: { id: string }) {
  const [repos, setRepos] = useState<RepoLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const load = () => get<{ repos: RepoLog[] }>(`/api/sessions/${encodeURIComponent(id)}/commits`).then(r => (setRepos(r.repos), setError(null)), (err: Error) => setError(err.message))
    void load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [id])
  if (error && !repos) return <p className="grid flex-1 place-items-center p-8 text-text-muted">{error}</p>
  if (!repos) return <p className="grid flex-1 place-items-center p-8"><span className="spinner" /></p>
  if (!repos.length) return <p className="grid flex-1 place-items-center p-8 text-text-muted">This session touched no git repository.</p>
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-3 pt-3 pb-5">
      {repos.map(repo => <RepoGraph key={repo.root} id={id} repo={repo} />)}
    </div>
  )
}
