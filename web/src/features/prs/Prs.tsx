// The "PRs" tab (prs.js): the pull requests of the session's branch and those
// named in the conversation. For an open one, whether it is ready to merge,
// with a button to ask the session to fix what is not; GitHub's merge state in
// words; and the actions: merge (method and delete branch kept, a confirm
// first), close (confirmed), reopen, draft or ready. Merged and closed ones
// fold away. Read again every 30 s and after each action.
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react"
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
import { mergeState, readinessRows, type Readiness, type Row } from "./readiness"

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

function ReadyToMerge({ pr, sessionId, onBlockers }: { pr: PrDetail; sessionId: string; onBlockers: (b: string[]) => void }) {
  const [data, setData] = useState<Readiness | null>(null)
  useEffect(() => void get<Readiness>(`/api/sessions/${encodeURIComponent(sessionId)}/readiness?url=${encodeURIComponent(pr.url)}`).then(setData, () => {}), [pr.url, pr.updatedAt])
  const rows: Row[] = readinessRows(pr, data)
  const blockers = rows.filter(r => r.tone === "bad").map(r => r.text)
  useEffect(() => onBlockers(blockers), [blockers.join("|")])
  return (
    <div className="flex flex-col gap-1 rounded-[9px] bg-hover px-[11px] py-[9px]">
      <div className="mb-0.5 flex items-center gap-2 text-[11.5px] font-bold tracking-[0.05em] text-text-muted uppercase">
        Ready to merge?{!data && <span className="spinner size-3" />}
      </div>
      {rows.map(r => (
        <div key={r.text} className="flex min-h-[26px] items-center gap-2 text-[12.5px]">
          <span className={cn("w-3.5 shrink-0 text-center font-extrabold", TONE[r.tone])}>{MARK[r.tone]}</span>
          <span className={cn("min-w-0 flex-1", r.tone === "muted" ? "text-faint" : "text-text")}>{r.text}</span>
          {r.ask && <Button variant="ghost" className="h-6 shrink-0 text-xs" onClick={() => toSession(sessionId, r.ask!.text)}>{r.ask.label}</Button>}
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
      toast(`#${pr.number} ${DONE[action]}`)
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
          {pr.repo}#{pr.number}<ArrowUpRight className="size-3" />
        </a>
        <span className="ml-auto text-xs text-faint">{ago(Date.parse(pr.updatedAt), now)}</span>
      </header>
      <h3 className="m-0 text-sm leading-[1.35] font-semibold [overflow-wrap:anywhere]">{pr.title}</h3>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-text-muted">
        <span className="font-mono text-[11.5px]">{pr.baseRefName} ← {pr.headRefName}</span>
        <span><b className="font-semibold text-work">+{pr.additions}</b> <b className="font-semibold text-bad">−{pr.deletions}</b> · {pr.changedFiles} {pr.changedFiles === 1 ? "file" : "files"}</span>
      </div>
      {isOpen && sessionId && <ReadyToMerge pr={pr} sessionId={sessionId} onBlockers={setBlockers} />}
      {isOpen && (
        <p className={cn("m-0 flex items-center gap-[7px] text-[12.5px] font-[550]", TONE[merge.tone])}>
          <i className="size-[7px] rounded-full bg-current" />{merge.text}
        </p>
      )}
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
              <Button disabled={!merge.canMerge || !!busy} onClick={() => setConfirm("merge")}>{busy === "merge" ? BUSY.merge : "Merge"}</Button>
              <select className="h-[30px] rounded-md border border-line-strong bg-surface px-2 text-[12.5px]" value={method} title="Merge method"
                onChange={e => mergeMethod.set(e.target.value as Method)}>
                {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
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
      <p className="m-0 text-xs text-text-muted">PRs from this session's branch and PRs named in the conversation.</p>
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
