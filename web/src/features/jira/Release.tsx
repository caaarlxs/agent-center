// A ticket's release in its section (lib/release.ts): the steps to staging,
// or to prod, in order, each with what it did or does now. The step that
// waits for you says what it is about to do and has its button: the tag it
// would push (yours to change) and the changes that go with it, a script's
// simulation and its report, what to test. The steps of a release not
// started yet show what it will do. Each step's icon tells its kind: a merge,
// a tag, a release PR, a script on the data, something only a person does
// (it stands out until done, with the plan's why and how, and a box to ask
// the plan's agent about it, or to go on in a chat), the check at the end.
import { AlertTriangle, Bot, Check, History, SquareTerminal, Undo2, ChevronRight, ClipboardCheck, Database, Download, GitMerge, GitPullRequestArrow, Hand, Tag, type LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { get } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Release, ReleaseStep, StepKind, StepNote } from "@server/release"
import type { PrState } from "@server/stage-extras"
import type { Turn } from "@server/pipeline"
import { Ask } from "./Ask"
import { ChatButton } from "./YourPart"
import { Section } from "./kinds"
import { useStageData } from "./stage-data"
import { ConflictFix } from "./ConflictFix"
import { useConfirm } from "./confirm"

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

// What the plan says of a person's step: why, how, and how you know it is done. Open while it waits for you.
function NoteView({ note, isOpen: startsOpen }: { note: StepNote; isOpen: boolean }) {
  const [isOpen, setOpen] = useState(startsOpen)
  if (!note.why && !note.how.length && !note.done) return null
  return (
    <div className="flex flex-col gap-1">
      <button className="inline-flex items-center gap-1 self-start text-[11.5px] font-semibold text-faint hover:text-text" onClick={() => setOpen(o => !o)}>
        <ChevronRight size={12} className={cn("transition-transform duration-150", isOpen && "rotate-90")} />Why and how
      </button>
      {isOpen && (
        <div className="flex flex-col gap-1.5 text-[12.5px] leading-[1.5] text-text-muted">
          {note.why && <p className="m-0">{note.why}</p>}
          {note.how.length > 0 && <ol className="m-0 flex list-decimal flex-col gap-0.5 pl-5">{note.how.map((h, i) => <li key={i}>{h}</li>)}</ol>}
          {note.done && <p className="m-0"><span className="font-semibold text-text">Done when</span> {note.done}</p>}
        </div>
      )}
    </div>
  )
}

// The button of the step that waits for you; the ones that change the world ask twice.
const GO: Record<StepKind, string> = { merge: "Merge and deploy", promote: "Open the release PR and merge it", tag: "Push the tag", simulate: "Looks right", execute: "Run for real", manual: "Mark done", check: "It works", revert: "Revert and deploy", redeploy: "Deploy it again" }
// A step's kind as an icon and a word; a repo's own command (a dry run, then the run) has its own.
const COMMAND = { icon: SquareTerminal, name: "Command" }
const kindOf = (step: ReleaseStep) => ((step.kind === "simulate" || step.kind === "execute") && !step.script && step.value ? COMMAND : KIND[step.kind])
const KIND: Record<StepKind, { icon: LucideIcon; name: string }> = {
  merge: { icon: GitMerge, name: "Merge" }, promote: { icon: GitPullRequestArrow, name: "Release PR" }, tag: { icon: Tag, name: "Tag" },
  simulate: { icon: Database, name: "Script" }, execute: { icon: Database, name: "Script" }, manual: { icon: Hand, name: "By you" }, check: { icon: ClipboardCheck, name: "Check" },
  revert: { icon: Undo2, name: "Revert" }, redeploy: { icon: History, name: "Deploy again" },
}
const ASKS_TWICE: StepKind[] = ["merge", "promote", "tag", "execute", "revert", "redeploy"]

function Waiting({ step, onAct }: { step: ReleaseStep; onAct: (action: StepAction, value?: string) => void }) {
  const [value, setValue] = useState(step.value ?? "")
  const [asking, setAsking] = useState<"approve" | "skip" | null>(null)
  useEffect(() => {
    if (!asking) return
    const timer = setTimeout(() => setAsking(null), 4000)
    return () => clearTimeout(timer)
  }, [asking])
  const press = (action: "approve" | "skip") => (action === "skip" || ASKS_TWICE.includes(step.kind)) && asking !== action ? setAsking(action) : (setAsking(null), onAct(action, step.kind === "tag" ? value : undefined))
  // A deploy that never showed up: you checked it. Comments on its PR: merge as it is, or once you looked at the changes.
  const label = step.phase === "deploy" ? "Go on" : step.feedback?.state === "act" ? "Merge anyway" : step.feedback?.state === "addressed" ? "Looks right: merge" : GO[step.kind]
  return (
    <div className="flex flex-col gap-2">
    {step.advice && <AdviceLine advice={step.advice} />}
    <div className="flex flex-wrap items-center gap-2">
      {step.kind === "tag" && step.phase !== "deploy" && (
        <input value={value} onChange={e => setValue(e.target.value)} spellCheck={false} aria-label="Tag"
          className="h-7 w-28 rounded-[6px] border border-line-strong bg-surface px-2 font-mono text-xs outline-none focus:border-brand" />
      )}
      {step.feedback?.state === "act" && <Button className="h-7 text-xs" onClick={() => onAct("address")}>Address the comments</Button>}
      <Button variant={asking === "approve" || step.feedback?.state === "act" ? (asking === "approve" ? "destructive" : "outline") : "default"} className="h-7 text-xs" onClick={() => press("approve")}>{asking === "approve" ? `Sure? ${label}` : label}</Button>
      <button className={cn("text-xs font-semibold transition-colors duration-120", asking === "skip" ? "text-bad" : "text-faint hover:text-text")} onClick={() => press("skip")}>{asking === "skip" ? "Sure? Skip it" : "Skip"}</button>
    </div>
    </div>
  )
}

// What the agent that looks at a waiting step says: still looking, go on, or hold, and why.
function AdviceLine({ advice }: { advice: NonNullable<ReleaseStep["advice"]> }) {
  if (advice.verdict === "running") return <Shimmer as="span" duration={2.2} className="inline-flex items-center gap-1.5 text-xs [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">The agent is looking at it</Shimmer>
  const isGo = advice.verdict === "go"
  return (
    <span className={cn("flex items-start gap-1.5 text-xs leading-[1.45]", isGo ? "text-work" : "text-ask")}>
      <Bot size={13} className="mt-px shrink-0" />
      <span><span className="font-semibold">{isGo ? "Agent: go on" : "Agent: hold"}</span>{advice.reason ? <span className="text-text-muted"> · {advice.reason}</span> : null}</span>
    </span>
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

// A PR a step still has to merge that cannot go as it is: a draft, with conflicts, or with comments
// since its last commit (the merge has an agent look at them first).
const prWarning = (label: string, pr: PrState) => {
  const is = [pr.isDraft && "a draft", pr.isConflicting && "in conflict with its base"].filter(Boolean).join(" and ")
  const said = pr.comments ? `${pr.comments} comment${pr.comments === 1 ? "" : "s"} since its last commit` : ""
  return is ? `${label} is ${is}${said ? `, with ${said}` : ""}` : `${label} has ${said}`
}
function PrBlock({ step }: { step: ReleaseStep }) {
  const { prs } = useStageData()
  if (step.status === "done" || step.status === "skipped") return null
  const stuck = step.links.map(l => [l, prs[l.url]] as const).filter(([, pr]) => pr?.state === "OPEN" && (pr.isDraft || pr.isConflicting || !!pr.comments))
  if (!stuck.length) return null
  return (
    <span className="col-start-2 flex flex-col gap-1 pl-[55px]">
      {stuck.map(([l, pr]) => (
        <span key={l.url} className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-3 text-[11.5px]">
            <span className="font-semibold text-ask">{prWarning(l.label, pr!)}</span>
            {pr!.isDraft && step.kind === "manual" && <ReadyButton url={l.url} />}
          </span>
          <ConflictFix url={l.url} />
        </span>
      ))}
    </span>
  )
}

// A draft PR a person merges leaves draft, for them to review it (it asks once more: GitHub tells its reviewers).
function ReadyButton({ url }: { url: string }) {
  const { onReady } = useStageData()
  const [isAsking, confirm] = useConfirm()
  if (!onReady) return null
  return <button className={cn("font-semibold transition-colors duration-120", isAsking ? "text-bad" : "text-text-muted hover:text-text")} onClick={() => confirm(() => onReady(url))}>{isAsking ? "Sure? Its reviewers are told" : "Ready for review"}</button>
}

// What a step did or does now, its error, and its links (the PR, the deploy, a script's log).
function StepDetail({ step, ticketKey }: { step: ReleaseStep; ticketKey: string }) {
  if (!step.detail && !step.error && !step.links.length) return null
  return (
    <span className="col-start-2 flex flex-wrap items-baseline gap-x-3 pl-[55px] gap-y-0.5 text-[11.5px] text-faint">
      {step.status === "running" && step.detail ? <Shimmer as="span" duration={2.2} className="[--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{step.detail}</Shimmer> : step.detail && <span>{step.detail}</span>}
      {step.error && <span className="text-bad">{step.error}</span>}
      {step.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="font-semibold text-brand no-underline hover:underline">{l.label}</a>)}
      {step.report && step.status !== "pending" && <a href={reportUrl(ticketKey, step.report.replace(/\.csv$/, ".log"))} target="_blank" rel="noreferrer" className="font-semibold text-text-muted no-underline hover:text-text">Log</a>}
    </span>
  )
}

// A step a person does (a store release, a merge only its owner approves) stands out until it is done.
const isYours = (step: ReleaseStep) => step.kind === "manual" && (step.status === "pending" || step.status === "waiting")
// A step still to come of a live release, left out of it (a PR that must not merge yet); it asks twice.
// The step that failed shows it always; one still to come, on hover.
function SkipAhead({ onSkip, isShown = false }: { onSkip: () => void; isShown?: boolean }) {
  const [isAsking, confirm] = useConfirm()
  return (
    <button className={cn("ml-auto shrink-0 text-xs font-semibold transition-opacity duration-120", isAsking ? "text-bad" : cn("text-faint hover:text-text focus-visible:opacity-100", !isShown && "opacity-0 group-hover:opacity-100"))}
      onClick={() => confirm(onSkip)}>{isAsking ? "Sure? Leave it out" : "Skip"}</button>
  )
}

// A step you left out says so, struck through, and comes back while the release has not got past it.
function Skipped({ canUndo, onUndo }: { canUndo: boolean; onUndo: () => void }) {
  return (
    <span className="ml-auto flex shrink-0 items-baseline gap-2 text-xs">
      <span className="rounded-[4px] bg-hover px-1.5 py-px font-semibold text-text-muted">Skipped</span>
      {canUndo && <button className="font-semibold text-faint hover:text-text" onClick={onUndo}>Undo</button>}
    </span>
  )
}

export type StepAction = "approve" | "skip" | "unskip" | "address"
function StepRow({ step, ticketKey, isAtHand, isAhead, isLive, threads, onAct }: { step: ReleaseStep; ticketKey: string; isAtHand: boolean; isAhead: boolean; isLive: boolean; threads?: Record<string, Turn[]>; onAct: (action: StepAction, value?: string) => void }) {
  const isFaint = step.status === "pending" || step.status === "skipped"
  const { icon: Icon, name } = kindOf(step)
  return (
    <li className={cn("group grid grid-cols-[15px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 border-t border-line py-2.5 first:border-t-0", isYours(step) && "-mx-2.5 my-2.5 rounded-[8px] border-transparent bg-ask-soft px-2.5 [&+li]:border-transparent")}>
      <span className="mt-[2px]"><Mark step={step} /></span>
      <span className={cn("flex items-baseline gap-2 text-[13px] leading-[1.45]", isFaint && !isYours(step) ? "text-text-muted" : "text-text", step.status === "waiting" && "font-semibold")}>
        <span className="w-[26px] shrink-0 font-mono text-[11px] text-faint tabular-nums">{step.id}</span>
        <Icon size={13} className={cn("shrink-0 translate-y-[2px]", isYours(step) ? "text-ask" : "text-faint")} aria-label={name} />
        <span className={cn("min-w-0", step.status === "skipped" && "line-through decoration-faint")}>{step.title}{step.kind === "tag" && step.value && step.status !== "waiting" ? <span className="font-mono text-xs text-faint"> {step.value}</span> : null}</span>
        {isLive && ((!isAtHand && step.status === "pending") || (isAtHand && step.status === "failed")) && <SkipAhead onSkip={() => onAct("skip")} isShown={step.status === "failed"} />}
        {step.status === "skipped" && <Skipped canUndo={isLive && isAhead} onUndo={() => onAct("unskip")} />}
      </span>
      <StepDetail step={step} ticketKey={ticketKey} />
      <PrBlock step={step} />
      {step.note && isYours(step) && (
        <div className="col-start-2 flex min-w-0 flex-col gap-2 pl-[55px]">
          <NoteView note={step.note} isOpen={step.status === "waiting"} />
          {threads && <Ask ticketKey={ticketKey} about={`step:${step.note.id}`} turns={threads[`step:${step.note.id}`]} />}
          {threads && <ChatButton ticketKey={ticketKey} step={step.note.id} />}
        </div>
      )}
      {(step.items.length > 0 || step.report) && (
        <div className="col-start-2 flex min-w-0 flex-col gap-2 pl-[55px]">
          <Items items={step.items} isOpen={step.status === "waiting" && (step.kind === "check" || step.feedback?.state === "act")} />
          {step.report && (step.status !== "pending") && <ReportView ticketKey={ticketKey} file={step.report} />}
        </div>
      )}
      {isAtHand && (step.status === "waiting" || step.status === "failed") && (
        <div className="col-start-2 pl-[55px]">{step.status === "waiting" ? <Waiting key={step.id} step={step} onAct={onAct} /> : null}</div>
      )}
    </li>
  )
}

// The steps of a release, the one at hand with its button; a release not
// started yet (a preview) shows only what it will do.
// threads: what was asked about a person's step (none in a job's dialog: no asking there).
export function ReleaseSteps({ ticketKey, release, after, isPreview = false, threads, onAct }: { ticketKey: string; release: Release; after?: After; isPreview?: boolean; threads?: Record<string, Turn[]>; onAct?: (step: string, action: StepAction, value?: string) => void }) {
  const atHand = isPreview ? undefined : release.steps.find(s => s.status !== "done" && s.status !== "skipped")
  const at = atHand ? release.steps.indexOf(atHand) : release.steps.length
  return (
    <Section title="Deploy" extra={isPreview ? release.steps.length : `${release.steps.filter(s => s.status === "done" || s.status === "skipped").length} of ${release.steps.length}`}>
      <ol className="m-0 list-none p-0">
        {release.steps.map((s, i) => <StepRow key={s.id} step={s} ticketKey={ticketKey} isAtHand={s.id === atHand?.id} isAhead={i > at} isLive={!!onAct} threads={threads} onAct={(action, value) => onAct?.(s.id, action, value)} />)}
        {after && <AfterRow after={after} />}
      </ol>
    </Section>
  )
}

// After its steps, the agent stage that follows the release (the test in
// staging, the check in prod), so the whole way shows.
export type After = { title: string; status: ReleaseStep["status"] }

// The agent stage after the release, as the list's last row.
function AfterRow({ after }: { after: After }) {
  const step = { status: after.status } as ReleaseStep
  return (
    <li className="grid grid-cols-[15px_minmax(0,1fr)] gap-x-2.5 border-t border-line py-2.5">
      <span className="mt-[2px]"><Mark step={step} /></span>
      <span className={cn("flex items-baseline gap-2 text-[13px] leading-[1.45]", after.status === "pending" ? "text-text-muted" : "text-text")}>
        <Bot size={13} className="shrink-0 translate-y-[2px] text-faint" aria-label="Agent" />
        <span className="min-w-0">{after.title}</span>
      </span>
    </li>
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
