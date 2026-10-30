// The "Commits" tab (lib/session-commits.ts): the git history of every
// repository the session touched since the conversation began, a repository
// at a time. The session's own commits show first ("This session"); "All"
// adds the rest. Each says whether it is only here or pushed, links to
// GitHub, and opens into its own diff (the Changes viewer, to read).
import { ChevronRight, GitBranch } from "lucide-react"
import { useEffect, useState } from "react"
import { get } from "@/lib/api"
import type { Commit, FileDiff, RepoLog } from "@/lib/api-types"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { DiffView } from "@/features/changes/Changes"
import { RepoTag } from "@/features/session/SessionPanel"
import { ago } from "@/features/session/state"
import { Anim } from "@/components/icons/animated"

const seg = (isOn: boolean) => cn("h-6 rounded-[5px] px-2.5 text-[12.5px] font-[550]", isOn ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-text-muted hover:text-text")

function CommitRow({ id, root, commit }: { id: string; root: string; commit: Commit }) {
  const now = useNow()
  const [isOpen, setOpen] = useState(false)
  const [files, setFiles] = useState<FileDiff[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = () => {
    setOpen(!isOpen)
    if (files || isOpen) return
    const q = new URLSearchParams({ root, hash: commit.hash })
    get<{ files: FileDiff[] }>(`/api/sessions/${encodeURIComponent(id)}/commit?${q}`).then(r => setFiles(r.files), (err: Error) => setError(err.message))
  }
  return (
    <li className={cn("flex flex-col", !commit.isMine && "opacity-70")}>
      <div className="group flex min-h-[34px] items-center gap-2.5 rounded-md px-2 hover:bg-hover">
        <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={open} aria-expanded={isOpen}>
          <ChevronRight className={cn("size-3 shrink-0 text-faint transition-transform duration-150 ease-(--ease-out)", isOpen && "rotate-90")} />
          <code className="shrink-0 font-mono text-[11.5px] text-text-muted">{commit.short}</code>
          <span className="min-w-0 flex-1 truncate text-[13px]" title={commit.subject}>{commit.subject}</span>
        </button>
        {!commit.isPushed && <span className="shrink-0 rounded-md bg-ask-soft px-1.5 py-px text-[11px] font-medium text-ask" title="Only on this Mac: not pushed">local</span>}
        <span className="shrink-0 text-xs text-faint" title={new Date(commit.at).toLocaleString("en-GB")}>{commit.author} · {ago(commit.at, now)}</span>
        {commit.url && <a href={commit.url} target="_blank" rel="noreferrer" title="Open on GitHub" className="inline-grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-press hover:text-text"><Anim.ArrowUpRight size={12} /></a>}
      </div>
      {isOpen && (
        <div className="mt-1 mb-2.5 ml-6 flex flex-col gap-2.5">
          {error ? <p className="m-0 text-xs text-bad">{error}</p> : !files ? <span className="spinner" /> : files.length ? <DiffView files={files} /> : <p className="m-0 text-xs text-text-muted">No changes to show.</p>}
        </div>
      )}
    </li>
  )
}

export function Commits({ id }: { id: string }) {
  const [repos, setRepos] = useState<RepoLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAll, setAll] = useState(false)
  useEffect(() => {
    const load = () => get<{ repos: RepoLog[] }>(`/api/sessions/${encodeURIComponent(id)}/commits`).then(r => (setRepos(r.repos), setError(null)), (err: Error) => setError(err.message))
    void load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [id])
  if (error && !repos) return <p className="grid flex-1 place-items-center p-8 text-text-muted">{error}</p>
  if (!repos) return <p className="grid flex-1 place-items-center p-8"><span className="spinner" /></p>
  if (!repos.length) return <p className="grid flex-1 place-items-center p-8 text-text-muted">This session touched no git repository.</p>
  const hasMine = repos.some(r => r.commits.some(c => c.isMine))
  const showsAll = isAll || !hasMine
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5 text-[12.5px]">
        <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{repos.length === 1 ? "1 repository" : `${repos.length} repositories`} touched, since the conversation began</span>
        {hasMine && (
          <span role="group" aria-label="Which commits" className="inline-flex rounded-md bg-press p-0.5">
            <button className={seg(!isAll)} onClick={() => setAll(false)}>This session</button>
            <button className={seg(isAll)} onClick={() => setAll(true)}>All</button>
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-3 pt-3 pb-5">
        {repos.map(repo => {
          const shown = repo.commits.filter(c => showsAll || c.isMine)
          return (
            <section key={repo.root} className="flex flex-col gap-1">
              <header className="flex items-center gap-2.5 px-2 pb-1">
                <RepoTag name={repo.name} />
                {repo.branch && <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono text-[11.5px] text-text-muted"><GitBranch className="size-3 shrink-0" />{repo.branch}</span>}
                <span className="flex-1" />
                {repo.url && <a href={repo.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-text-muted no-underline hover:text-text">GitHub<Anim.ArrowUpRight size={12} /></a>}
              </header>
              {shown.length ? <ul className="m-0 flex list-none flex-col p-0">{shown.map(c => <CommitRow key={c.hash} id={id} root={repo.root} commit={c} />)}</ul>
                : <p className="m-0 px-2 text-xs text-text-muted">No commits {showsAll ? "since the conversation began" : "by this session"}.</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
