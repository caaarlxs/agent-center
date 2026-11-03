// A ticket's release in its section (lib/release.ts): the steps to staging,
// or to prod, in order, each with what it did or does now. The step that
// waits for you says what it is about to do and has its button: the tag it
// would push (yours to change) and the changes that go with it, a script's
// simulation and its report, what to test. The steps of a release not
// started yet show what it will do. Each step's icon tells its kind: a merge,
// a tag, a release PR, a script on the data, something only a person does,
// the check at the end.
import { AlertTriangle, Check, ChevronRight, ClipboardCheck, Database, Download, GitMerge, GitPullRequestArrow, Hand, Tag, type LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { get } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Release, ReleaseStep, StepKind } from "@server/release"

type Report = { head: string[]; total: number; rows: string[][]; text: string }
const reportUrl = (key: string, file: string) => `/api/pipeline/report?key=${encodeURIComponent(key)}&file=${encodeURIComponent(file)}`
// The columns worth reading in the ticket; the CSV has them all.
const SHOWN = ["id", "action", "reason", "before", "after", "result"]

function ReportView({ ticketKey, file }: { ticketKey: string; file: string }) {
  const [report, setReport] = useState<Report | null>(null)
  useEffect(() => void get<Report>(`${reportUrl(ticketKey, file)}&view`).then(setReport, () => setReport(null)), [ticketKey, file])
  if (!report) return null
  const cols = SHOWN.map(c => report.head.indexOf(c)).filter(i => i >= 0)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-w-full overflow-x-auto rounded-[8px] border border-line">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead><tr>{cols.map(i => <th key={i} className="border-b border-line px-2 py-1 text-left font-semibold whitespace-nowrap text-faint">{report.head[i]}</th>)}</tr></thead>
          <tbody>
            {report.rows.map((r, n) => (
              <tr key={n} className="border-t border-line first:border-t-0">
                {cols.map(i => <td key={i} className="max-w-[220px] truncate px-2 py-1 text-text-muted" title={r[i]}>{r[i]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="flex items-center gap-3 text-[11.5px] text-faint">
        {report.total > report.rows.length && <span>{report.rows.length} of {report.total} rows</span>}
        <a href={reportUrl(ticketKey, file)} className="inline-flex items-center gap-1 font-semibold text-text-muted no-underline hover:text-text"><Download size={12} />{file}</a>
      </span>
    </div>
  )
}

// What goes with a step (the changes to prod, what to test): folded past a few.
function Items({ items, isOpen: startsOpen }: { items: string[]; isOpen: boolean }) {
  const [isOpen, setOpen] = useState(startsOpen)
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-1">
      <button className="inline-flex items-center gap-1 self-start text-[11.5px] font-semibold text-faint hover:text-text" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>
        <ChevronRight size={12} className={cn("transition-transform duration-150", isOpen && "rotate-90")} />{items.length} item{items.length === 1 ? "" : "s"}
      </button>
      {isOpen && <ul className="m-0 flex list-disc flex-col gap-0.5 pl-6 text-[12px] leading-[1.45] text-text-muted">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </div>
  )
}

// The button of the step that waits for you; the ones that change the world ask twice.
const GO: Record<StepKind, string> = { merge: "Merge and deploy", promote: "Open the release PR and merge it", tag: "Push the tag", simulate: "Looks right", execute: "Run for real", manual: "Mark done", check: "It works" }
const KIND: Record<StepKind, { icon: LucideIcon; name: string }> = {
  merge: { icon: GitMerge, name: "Merge" }, promote: { icon: GitPullRequestArrow, name: "Release PR" }, tag: { icon: Tag, name: "Tag" },
  simulate: { icon: Database, name: "Script" }, execute: { icon: Database, name: "Script" }, manual: { icon: Hand, name: "By you" }, check: { icon: ClipboardCheck, name: "Check" },
}
const ASKS_TWICE: StepKind[] = ["merge", "promote", "tag", "execute"]

function Waiting({ step, onAct }: { step: ReleaseStep; onAct: (action: "approve" | "skip", value?: string) => void }) {
  const [value, setValue] = useState(step.value ?? "")
  const [asking, setAsking] = useState<"approve" | "skip" | null>(null)
  useEffect(() => {
    if (!asking) return
    const timer = setTimeout(() => setAsking(null), 4000)
    return () => clearTimeout(timer)
  }, [asking])
  const press = (action: "approve" | "skip") => (action === "skip" || ASKS_TWICE.includes(step.kind)) && asking !== action ? setAsking(action) : (setAsking(null), onAct(action, step.kind === "tag" ? value : undefined))
  // A deploy that never showed up: you checked it.
  const label = step.phase === "deploy" ? "Go on" : GO[step.kind]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {step.kind === "tag" && step.phase !== "deploy" && (
        <input value={value} onChange={e => setValue(e.target.value)} spellCheck={false} aria-label="Tag"
          className="h-7 w-28 rounded-[6px] border border-line-strong bg-surface px-2 font-mono text-xs outline-none focus:border-brand" />
      )}
      <Button variant={asking === "approve" ? "destructive" : "default"} className="h-7 text-xs" onClick={() => press("approve")}>{asking === "approve" ? `Sure? ${label}` : label}</Button>
      <button className={cn("text-xs font-semibold transition-colors duration-120", asking === "skip" ? "text-bad" : "text-faint hover:text-text")} onClick={() => press("skip")}>{asking === "skip" ? "Sure? Skip it" : "Skip"}</button>
    </div>
  )
}

function Mark({ step }: { step: ReleaseStep }) {
  const box = "grid size-[15px] shrink-0 place-items-center rounded-full"
  if (step.status === "done") return <span className={cn(box, "bg-work text-background")}><Check size={10} strokeWidth={3} /></span>
  if (step.status === "failed") return <span className={cn(box, "text-bad")}><AlertTriangle size={13} /></span>
  if (step.status === "skipped") return <span className={cn(box, "border border-line-strong text-[10px] text-faint")}>–</span>
  if (step.status === "waiting") return <span className={cn(box, "border border-ask")}><i className="size-[5px] rounded-full bg-ask" /></span>
  if (step.status === "running") return <span className={cn(box, "border border-work")}><i className="run-dot size-[5px] rounded-full bg-work" /></span>
  return <span className={cn(box, "border border-line-strong")} />
}

// What a step did or does now, its error, and its links (the PR, the deploy, a script's log).
function StepDetail({ step, ticketKey }: { step: ReleaseStep; ticketKey: string }) {
  if (!step.detail && !step.error && !step.links.length) return null
  return (
    <span className="col-start-2 flex flex-wrap items-baseline gap-x-3 pl-[21px] gap-y-0.5 text-[11.5px] text-faint">
      {step.status === "running" && step.detail ? <Shimmer as="span" duration={2.2} className="[--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{step.detail}</Shimmer> : step.detail && <span>{step.detail}</span>}
      {step.error && <span className="text-bad">{step.error}</span>}
      {step.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="font-semibold text-brand no-underline hover:underline">{l.label}</a>)}
      {step.report && step.status !== "pending" && <a href={reportUrl(ticketKey, step.report.replace(/\.csv$/, ".log"))} target="_blank" rel="noreferrer" className="font-semibold text-text-muted no-underline hover:text-text">Log</a>}
    </span>
  )
}

function StepRow({ step, ticketKey, isAtHand, onAct }: { step: ReleaseStep; ticketKey: string; isAtHand: boolean; onAct: (action: "approve" | "skip", value?: string) => void }) {
  const isFaint = step.status === "pending" || step.status === "skipped"
  const { icon: Icon, name } = KIND[step.kind]
  return (
    <li className="grid grid-cols-[15px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 border-t border-line py-2.5 first:border-t-0">
      <span className="mt-[2px]"><Mark step={step} /></span>
      <span className={cn("flex items-baseline gap-2 text-[13px] leading-[1.45]", isFaint ? "text-text-muted" : "text-text", step.status === "waiting" && "font-semibold")}>
        <Icon size={13} className="shrink-0 translate-y-[2px] text-faint" aria-label={name} />
        <span className="min-w-0">{step.title}{step.kind === "tag" && step.value && step.status !== "waiting" ? <span className="font-mono text-xs text-faint"> {step.value}</span> : null}</span>
      </span>
      <StepDetail step={step} ticketKey={ticketKey} />
      {(step.items.length > 0 || step.report) && (
        <div className="col-start-2 flex min-w-0 flex-col gap-2 pl-[21px]">
          <Items items={step.items} isOpen={step.status === "waiting" && step.kind === "check"} />
          {step.report && (step.status !== "pending") && <ReportView ticketKey={ticketKey} file={step.report} />}
        </div>
      )}
      {isAtHand && (step.status === "waiting" || step.status === "failed") && (
        <div className="col-start-2 pl-[21px]">{step.status === "waiting" ? <Waiting key={step.id} step={step} onAct={onAct} /> : null}</div>
      )}
    </li>
  )
}

// The steps of a release, the one at hand with its button; a release not
// started yet (a preview) shows only what it will do.
export function ReleaseSteps({ ticketKey, release, isPreview = false, onAct }: { ticketKey: string; release: Release; isPreview?: boolean; onAct?: (step: string, action: "approve" | "skip", value?: string) => void }) {
  const atHand = isPreview ? undefined : release.steps.find(s => s.status !== "done" && s.status !== "skipped")
  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 flex items-baseline gap-2 text-[13px] font-semibold">
        {isPreview ? `What the deploy to ${release.env} does` : release.env === "staging" ? "Staging" : "Prod"}
        {!isPreview && <span className="text-xs font-medium text-faint tabular-nums">{release.steps.filter(s => s.status === "done" || s.status === "skipped").length} of {release.steps.length}</span>}
      </h3>
      <ol className="m-0 list-none p-0">
        {release.steps.map(s => <StepRow key={s.id} step={s} ticketKey={ticketKey} isAtHand={s.id === atHand?.id} onAct={(action, value) => onAct?.(s.id, action, value)} />)}
      </ol>
    </div>
  )
}

// Skipping the step that failed (you did it some other way).
export function SkipFailed({ release, onAct }: { release: Release; onAct: (step: string, action: "skip") => void }) {
  const [isAsking, setAsking] = useState(false)
  const failed = release.steps.find(s => s.status === "failed")
  if (!failed) return null
  return (
    <button className={cn("shrink-0 text-xs font-semibold", isAsking ? "text-bad" : "text-faint hover:text-text")}
      onClick={() => (isAsking ? (setAsking(false), onAct(failed.id, "skip")) : setAsking(true))}>
      {isAsking ? "Sure? Skip it" : "Skip this step"}
    </button>
  )
}
