// The "PRs" tab (prs.js): the pull requests of the session's branch and those
// named in the conversation, each marked with where it came from. For an open
// one, one line on where it stands, the reasons below it (each check, each
// reviewer) with a button to ask the session to fix what is not; and the
// actions: merge (method and delete branch kept, a confirm first), close
// (confirmed), reopen, draft or ready. Merged and closed ones fold away. Read
// again every 30 s and after each action.
import { ChevronDown, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { get, post } from "@/lib/api"
import type { PrDetail } from "@/lib/api-types"
import { useNow } from "@/lib/now"
import { persistedStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { showTab } from "@/app/open-session"
import { sendMessage } from "@/features/conversation/send"
import { ago } from "@/features/session/state"
import { mergeState, readinessRows, verdict, type Readiness, type Row } from "./readiness"
import { Anim } from "@/components/icons/animated"
import { doneIcon } from "@/components/icona/marks"
import { MergeButton } from "./MergeButton"

const CHIP = {
  OPEN: ["Open", "bg-work-soft text-work"],
  DRAFT: ["Draft", "bg-hover text-text-muted"],
  MERGED: ["Merged", "bg-[rgb(139_92_246/0.13)] text-[#8b5cf6]"],
  CLOSED: ["Closed", "bg-bad-soft text-bad"],
} as const
const TONE = { ok: "text-work", work: "text-work", bad: "text-bad", ask: "text-ask", muted: "text-faint" }
const MARK = { ok: "✓", bad: "✗", ask: "•", muted: "–" }
const METHODS = { squash: "Squash", merge: "Merge commit", rebase: "Rebase" } as const
type Method = keyof typeof METHODS
const mergeMethod = persistedStore<Method>("mergeMethod", "squash")
const deleteBranch = persistedStore("deleteBranch", true)
const DONE: Record<string, string> = { merge: "merged", close: "closed", reopen: "reopened", ready: "marked as ready", draft: "converted to draft" }
const BUSY: Record<string, string> = { merge: "Merging…", ready: "Marking…", close: "Closing…", reopen: "Reopening…" }

// The review comments or a fix go as one message, then the conversation shows.
const toSession = (id: string, text: string) => sendMessage(id, text).then(() => showTab("chat"), (err: Error) => toast(err.message || "Could not send"))

const CHECK_MARK = { pass: ["✓", "text-work"], fail: ["✗", "text-bad"], pending: ["•", "text-ask"], skip: ["–", "text-faint"] } as const
const took = (s: number | null) => (s === null ? "" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`)

// Each check, the failing first, with how long it took and a link to its log.
function CheckList({ checks }: { checks: PrDetail["checkList"] }) {
  const order = { fail: 0, pending: 1, pass: 2, skip: 3 }
  return (
    <div className="ml-[22px] flex flex-col">
      {[...checks].sort((a, b) => order[a.state] - order[b.state]).map((c, i) => (
        <div key={`${c.name}-${i}`} className="flex min-h-[22px] items-center gap-2 text-[12px]">
          <span className={cn("w-3 shrink-0 text-center font-extrabold", CHECK_MARK[c.state][1])}>{CHECK_MARK[c.state][0]}</span>
          {c.url ? <a className="min-w-0 flex-1 truncate text-text-muted no-underline hover:text-text" href={c.url} target="_blank" rel="noreferrer">{c.name}</a>
            : <span className="min-w-0 flex-1 truncate text-text-muted">{c.name}</span>}
          <span className="num shrink-0 text-faint">{took(c.seconds)}</span>
        </div>
      ))}
    </div>
  )
}

// One line on top says where the PR stands; the rows below give each reason,
// folded away when nothing is left to do.
function ReadyToMerge({ pr, sessionId, onBlockers }: { pr: PrDetail; sessionId: string; onBlockers: (b: string[]) => void }) {
  const [data, setData] = useState<Readiness | null>(null)
  const [isOpen, setIsOpen] = useState<boolean | null>(null)
  const [isShowingChecks, setIsShowingChecks] = useState(false)
  useEffect(() => void get<Readiness>(`/api/sessions/${encodeURIComponent(sessionId)}/readiness?url=${encodeURIComponent(pr.url)}`).then(setData, () => {}), [pr.url, pr.updatedAt])
  const rows: Row[] = readinessRows(pr, data)
  const blockers = rows.filter(r => r.tone === "bad").map(r => r.text)
  useEffect(() => onBlockers(blockers), [blockers.join("|")])
  const top = verdict(pr, rows)
  const isShown = isOpen ?? top.tone !== "work"
  return (
    <div className="flex flex-col gap-1 rounded-[9px] bg-hover px-[11px] py-[9px]">
      <button className={cn("flex min-h-[26px] items-center gap-2 text-left text-[13px] font-semibold", TONE[top.tone])} onClick={() => setIsOpen(!isShown)} aria-expanded={isShown}>
        <i className="size-[7px] shrink-0 rounded-full bg-current" />
        <span className="min-w-0 flex-1">{top.text}</span>
        {!data && <span className="spinner size-3" />}
        {isShown ? <ChevronDown className="size-3.5 text-faint" /> : <ChevronRight className="size-3.5 text-faint" />}
      </button>
      {isShown && rows.map((r, i) => (
        <div key={r.text}>
          <div className="flex min-h-[26px] items-center gap-2 text-[12.5px]">
            <span className={cn("w-3.5 shrink-0 text-center font-extrabold", TONE[r.tone])}>{MARK[r.tone]}</span>
            {i === 0 && pr.checkList?.length ? (
              <button className={cn("flex min-w-0 flex-1 items-center gap-1 text-left", r.tone === "muted" ? "text-faint" : "text-text")} onClick={() => setIsShowingChecks(v => !v)} aria-expanded={isShowingChecks}>
                {r.text}{isShowingChecks ? <ChevronDown className="size-3 text-faint" /> : <ChevronRight className="size-3 text-faint" />}
              </button>
            ) : <span className={cn("min-w-0 flex-1", r.tone === "muted" ? "text-faint" : "text-text")}>{r.text}</span>}
            {r.ask && <Button variant="ghost" className="h-6 shrink-0 text-xs" onClick={() => toSession(sessionId, r.ask!.text)}>{r.ask.label}</Button>}
          </div>
          {i === 0 && isShowingChecks && <CheckList checks={pr.checkList} />}
        </div>
      ))}
    </div>
  )
}

function PrItem({ pr, sessionId, onDone }: { pr: PrDetail; sessionId?: string; onDone: () => void }) {
  const now = useNow()
  const method = mergeMethod.use()
  const isDeleting = deleteBranch.use()
  const [confirm, setConfirm] = useState<"merge" | "close" | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<string[]>([])
  const [label, chip] = CHIP[pr.state === "OPEN" && pr.isDraft ? "DRAFT" : pr.state]
  const merge = mergeState(pr)
  const isOpen = pr.state === "OPEN"

  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setConfirm(null)
    setBusy(action)
    try {
      await post("/api/prs/action", { url: pr.url, action, ...extra })
      toast(`#${pr.number} ${DONE[action]}`, action === "merge" ? { icon: doneIcon() } : undefined)
    } catch (err) {
      toast(`Could not do it: ${(err as Error).message || "gh error"}`)
    }
    setBusy(null)
    onDone()
  }

  return (
    <article className={cn("flex flex-col gap-2 rounded-xl border border-line bg-surface px-3.5 py-3", !isOpen && "opacity-75")}>
      <header className="flex items-center gap-2.5">
        <span className={cn("inline-flex h-[22px] items-center rounded-md px-2 text-[11.5px] font-semibold", chip)}>{label}</span>
        <a className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-text-muted no-underline hover:text-text" href={pr.url} target="_blank" rel="noreferrer" title="Open on GitHub">
          {pr.repo}#{pr.number}<Anim.ArrowUpRight size={12} />
        </a>
        {pr.origin && <span className="text-[11.5px] text-faint">{pr.origin === "branch" ? "this branch" : "from chat"}</span>}
        <span className="ml-auto text-xs text-faint" title={`Opened ${ago(Date.parse(pr.createdAt), now)} ago`}>{ago(Date.parse(pr.updatedAt), now)}</span>
      </header>
      <h3 className="m-0 text-sm leading-[1.35] font-semibold [overflow-wrap:anywhere]">{pr.title}</h3>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-text-muted">
        <span className="font-mono text-[11.5px]">{pr.baseRefName} ← {pr.headRefName}</span>
        <span><b className="font-semibold text-work">+{pr.additions}</b> <b className="font-semibold text-bad">−{pr.deletions}</b> · {pr.changedFiles} {pr.changedFiles === 1 ? "file" : "files"} · {pr.commits} {pr.commits === 1 ? "commit" : "commits"}</span>
        {pr.author && <span>by {pr.author}</span>}
      </div>
      {isOpen && sessionId && <ReadyToMerge pr={pr} sessionId={sessionId} onBlockers={setBlockers} />}
      {confirm ? (
        <div className="-mx-3.5 mt-0.5 -mb-3 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-side px-3.5 py-2.5">
          <span className="min-w-[200px] flex-1 text-[13px]">
            {confirm === "merge" ? (
              <>
                {blockers.length > 0 && <b className="text-bad">Still pending: {blockers.join(" · ")}. </b>}
                Merge <b>#{pr.number}</b> into <b>{pr.baseRefName}</b> with {METHODS[method].toLowerCase()}{isDeleting ? " and delete the branch" : ""}{blockers.length ? " anyway" : ""}?
              </>
            ) : <>Close <b>#{pr.number}</b> without merging?</>}
          </span>
          <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button autoFocus className={cn(confirm === "close" && "border-bad bg-bad text-white")} onClick={() => run(confirm, confirm === "merge" ? { method, deleteBranch: isDeleting } : {})}>
            {confirm === "merge" ? (blockers.length ? "Merge anyway" : "Merge") : "Close PR"}
          </Button>
        </div>
      ) : (
        <div className="mt-0.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          {isOpen && !pr.isDraft && (
            <>
              <MergeButton label={busy === "merge" ? BUSY.merge : "Merge"} method={method} methods={METHODS} isDisabled={!merge.canMerge || !!busy}
                onMerge={() => setConfirm("merge")} onMethod={m => mergeMethod.set(m)} />
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-text-muted">
                <input type="checkbox" className="accent-brand" checked={isDeleting} onChange={e => deleteBranch.set(e.target.checked)} />Delete branch
              </label>
            </>
          )}
          {isOpen && pr.isDraft && <Button disabled={!!busy} onClick={() => run("ready")}>{busy === "ready" ? BUSY.ready : "Mark as ready"}</Button>}
          <span className="flex-1" />
          {isOpen && !pr.isDraft && <Button variant="ghost" disabled={!!busy} onClick={() => run("draft")}>Convert to draft</Button>}
          {isOpen && <Button variant="ghost" className="text-bad hover:text-bad" disabled={!!busy} onClick={() => setConfirm("close")}>{busy === "close" ? BUSY.close : "Close"}</Button>}
          {pr.state === "CLOSED" && <Button variant="outline" disabled={!!busy} onClick={() => run("reopen")}>{busy === "reopen" ? BUSY.reopen : "Reopen"}</Button>}
        </div>
      )}
    </article>
  )
}

export function Prs({ id }: { id: string }) {
  const [prs, setPrs] = useState<PrDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOld, setShowOld] = useState(false)
  const load = () => get<{ prs: PrDetail[] }>(`/api/sessions/${encodeURIComponent(id)}/prs`).then(r => (setPrs(r.prs), setError(null)), (err: Error) => setError(err.message))
  useEffect(() => {
    void load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [id])
  if (error && !prs) return <p className="p-6 text-text-muted">{error}</p>
  const pane = "flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4"
  if (!prs) return <div className={pane}><i className="skeleton block h-[52px] rounded-[9px]" /><i className="skeleton block h-[52px] rounded-[9px]" /></div>
  const open = prs.filter(p => p.state === "OPEN")
  const old = prs.filter(p => p.state !== "OPEN")
  return (
    <div className={pane}>
      {!open.length && <p className="m-0 py-3 text-center text-text-muted">No open PRs.</p>}
      {open.map(pr => <PrItem key={pr.url} pr={pr} sessionId={id} onDone={load} />)}
      {old.length > 0 && (
        <button className="flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-[12.5px] font-semibold text-text-muted hover:text-text" onClick={() => setShowOld(v => !v)} aria-expanded={showOld}>
          {showOld ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Merged and closed<span className="font-medium text-faint">{old.length}</span>
        </button>
      )}
      {showOld && old.map(pr => <PrItem key={pr.url} pr={pr} onDone={load} />)}
    </div>
  )
}
