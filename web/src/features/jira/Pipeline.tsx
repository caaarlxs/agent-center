// The pipeline on a ticket (lib/pipeline.ts), to read at a glance. On top,
// the stages as a journey (Journey.tsx): each one's state and the one fact
// it left. Under it, now: what happens or what the ticket waits for, and the
// one button that moves it on. Under that, the stage you pick (the one at
// hand, at first) in tiles and icons: the units and their PRs, the review's
// counts and findings, a release's steps as a row of their kinds. The rest
// (branches, files, every step and log, the documents, the runs and what
// they spent) is a click away under Details and at the foot. When the stage
// needs you, its decisions take the place of the stage: each a question and
// the agent's proposal, kept unless you change it; the answers go to Jira
// and start the stage again. Start over clears the run and the labels; the
// comments stay. On someone else's ticket it runs only once you take it
// (two clicks: it is assigned to you).
import { AlertTriangle, Check, ChevronRight, CircleHelp, Database, FastForward, FlaskConical, ListChecks, LogOut, Play, RotateCcw, Route, Send, ShieldCheck, Trash2 } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "@/lib/notify"
import { Button } from "@/components/ui/button"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Kbd } from "@/components/ui/kbd"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { get } from "@/lib/api"
import type { Ticket } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { dialog } from "@/app/open-dialog"
import { openSession } from "@/app/open-session"
import { Markdown } from "@/features/conversation/Markdown"
import { doingText } from "@/features/conversation/session-events"
import { ago } from "@/features/session/state"
import { repoDot } from "@/features/session/state"
import type { Helper, Step } from "@server/activity"
import { sentBackSince } from "@server/sent-back"
import type { ChecklistItem, Finding, PipelineState, PlanScript, Run, Severity, Stage, TestResult, Turn, Unit } from "@server/pipeline"
import type { Check as BoardCheck } from "@server/checks"
import { deliverablesOf } from "@server/scope"
import type { Leftover } from "@server/cleanup"
import { MODELS } from "@/features/prompt/Settings"
import { PipelineMark, liveLine, startText, startingText, statusText } from "./PipelineMark"
import { STAGE_KEYS, STAGES, releaseShown, costOf, dollars, isRelease, journeyOf, nextStage, passesOf, stageAt, toFix, tokens } from "./pipeline-board"
import { ReleaseRail, ReleaseSteps, SkipFailed, StepAtHand, type After } from "./Release"
import { Journey } from "./Journey"
import { CHANGED, changed, useConfirm } from "./confirm"
import { sendWithFeedback } from "./feedback"
import { Proposed, TicketsIfAgreed } from "./Proposals"
import type { Proposal } from "@server/proposals"
export { useConfirm }
import { Evidence } from "./Evidence"
import { Ask, isWaiting } from "./Ask"
import { SendBack } from "./SendBack"
import type { Release } from "@server/release"

type Data = { putAside: number; state: PipelineState | null; refine: string | null; plan: string | null; build: string | null; review: string | null; test: string | null; smoke: string | null; preview: Release | null }
type OnStep = (step: string, action: "approve" | "skip", value?: string) => void
type Fold = Stage | "runs"
const FOLLOW_MS = 5_000
const IDLE_MS = 30_000

// Something changed on the ticket from inside its section: the section reads it again.

// A request with its feedback (feedback.ts): a toast at once if it takes a while, then the answer.
export const act = async (path: string, body: object, done: string) => (await sendWithFeedback(path, body, done)) !== null


export const openLog = (id: string) => (dialog.set(null), openSession(id))

// ---------- the decisions ----------

function Decision({ ticketKey, n, question, context, proposal, tickets = [], text, onChange, ask }: { ticketKey: string; n: number; question: string; context?: string; proposal: string; tickets?: Proposal[]; text: string | undefined; onChange: (text: string | undefined) => void; ask: ReactNode }) {
  const isChanging = text !== undefined
  return (
    <li className="flex flex-col gap-2.5 border-t border-line py-4 first:border-t-0 first:pt-1">
      <p className="m-0 flex gap-2.5 text-[13.5px] leading-[1.5] text-text">
        <span className="w-4 shrink-0 text-right font-mono text-xs leading-[1.7] text-faint">{n}</span>{question}
      </p>
      {context && <Markdown className="ml-[26px] text-[13px] text-text-muted">{context}</Markdown>}
      <div className="ml-[26px] flex flex-col gap-1.5">
        {isChanging ? (
          <textarea autoFocus value={text} onChange={e => onChange(e.target.value)} rows={2}
            className="max-h-[280px] min-h-[60px] resize-none rounded-[8px] border border-brand bg-surface px-3 py-2 text-[13px] leading-[1.55] outline-none [field-sizing:content] focus:shadow-[0_0_0_3px_var(--brand-soft)]" />
        ) : (
          <Markdown className="border-l-2 border-line-strong pl-3 text-[13px] text-text-muted">{proposal || "No proposal"}</Markdown>
        )}
        {tickets.length > 0 && <TicketsIfAgreed ticketKey={ticketKey} tickets={tickets} />}
        <button className="self-start text-xs font-semibold text-faint transition-colors duration-120 hover:text-text"
          onClick={() => onChange(isChanging ? undefined : proposal)}>
          {isChanging ? "Keep the proposal" : "Change"}
        </button>
        {ask}
      </div>
    </li>
  )
}

// Each proposal stands unless you change it; ⌘↵ sends them all.
function Decisions({ ticketKey, state, onSent }: { ticketKey: string; state: PipelineState; onSent: () => void }) {
  const [changed, setChanged] = useState<Record<string, string>>({})
  const [isBusy, setBusy] = useState(false)
  const count = state.questions.length
  const send = async () => {
    if (isBusy) return
    setBusy(true)
    if (await act("/api/pipeline/answer", { key: ticketKey, answers: changed }, `Answers sent: ${STAGES[stageAt(state)]} goes on with them`)) onSent()
    setBusy(false)
  }
  const change = (id: string, text: string | undefined) =>
    setChanged(c => (text === undefined ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== id)) : { ...c, [id]: text }))
  return (
    <div className="flex flex-col" onKeyDown={e => e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.preventDefault(), void send())}>
      <h3 className="m-0 mb-2 text-[15px] font-semibold tracking-[-0.01em]">{count} decision{count === 1 ? "" : "s"} for you</h3>
      <ol className="m-0 list-none p-0">
        {state.questions.map((q, i) => <Decision key={q.id} ticketKey={ticketKey} n={i + 1} question={q.question} context={q.context} proposal={q.proposal} tickets={(state.proposals ?? []).filter(p => p.question === q.id && p.status === "proposed")} text={changed[q.id]} onChange={t => change(q.id, t)}
          ask={<Ask ticketKey={ticketKey} about={`question:${q.id}`} turns={state.threads?.[`question:${q.id}`]} />} />)}
      </ol>
      <div className="mt-2 flex items-center justify-end gap-2.5">
        <Kbd>⌘↵</Kbd>
        <Button className="h-8 text-xs" disabled={isBusy} onClick={() => void send()}>Send answers · {STAGES[stageAt(state)]} goes on</Button>
      </div>
    </div>
  )
}

// ---------- the moment ----------

// While a stage runs, read every few seconds: its last steps (the latest
// first, the one still open breathing), its subagents (what each was sent to
// do and its last step) and, while it builds, how far each unit got.
type Activity = { steps: Step[]; helpers: Helper[]; units: Unit[]; checked?: string[] }
const ACTIVITY_MS = 4_000

// A job's (lib/jobs.ts) by its id: a state with "loose" in it.
export const isJob = (state: PipelineState) => "loose" in state
export function useActivity(key: string, isOn = true, isOfJob = false) {
  const [activity, setActivity] = useState<Activity | null>(null)
  useEffect(() => {
    if (!isOn) return
    const load = () => get<Activity>(`/api/pipeline/activity?${isOfJob ? "job" : "key"}=${encodeURIComponent(key)}`).then(setActivity, () => {})
    void load()
    const timer = setInterval(load, ACTIVITY_MS)
    return () => clearInterval(timer)
  }, [key, isOn, isOfJob])
  return activity
}

// The plan's to-do list in plain words, each item ticked once the build has
// done it (the one it works on next, breathing, while it builds).
function Checklist({ items, checked, isBuilding }: { items: ChecklistItem[]; checked: string[]; isBuilding: boolean }) {
  const done = new Set(checked)
  const next = isBuilding ? items.find(i => !done.has(i.id))?.id : undefined
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 flex items-baseline gap-2 text-[13px] font-semibold">To do<span className="text-xs font-medium text-faint tabular-nums">{items.filter(i => done.has(i.id)).length} of {items.length}</span></h3>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map(i => (
          <li key={i.id} className="flex items-start gap-2.5 text-[13px] leading-[1.45]">
            <span className={cn("mt-[3px] grid size-[15px] shrink-0 place-items-center rounded-full border transition-colors duration-200",
              done.has(i.id) ? "border-work bg-work text-background" : i.id === next ? "border-work" : "border-line-strong")}>
              {done.has(i.id) ? <Check size={10} strokeWidth={3} /> : i.id === next ? <i className="run-dot size-[5px] rounded-full bg-work" /> : null}
            </span>
            <span className={done.has(i.id) ? "text-text-muted" : "text-text"}>{i.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const stepText = (s: Step) => `${s.tool} · ${s.text}`

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="m-0 flex list-none flex-col border-l border-line p-0 pl-3">
      {[...steps].reverse().map((s, i) => (
        <li key={`${s.at}${i}`} className={cn("relative flex min-w-0 items-baseline gap-2 py-[3px] text-xs", i > 2 && "opacity-60")}>
          <i className={cn("absolute top-[9px] -left-[16px] size-[7px] rounded-full", s.isOpen ? "run-dot bg-work" : "bg-line-strong")} />
          <span className="w-11 shrink-0 font-mono text-[11px] text-faint">{s.tool}</span>
          <span className={cn("min-w-0 truncate", s.isOpen ? "text-text" : "text-text-muted")}>{s.text}</span>
        </li>
      ))}
    </ol>
  )
}

function Helpers({ helpers }: { helpers: Helper[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {helpers.map((h, i) => (
        <li key={i} className="grid grid-cols-[14px_minmax(0,1fr)] items-baseline gap-x-2 text-xs">
          {h.isDone ? <Check size={12} className="text-work" /> : <i className="run-dot size-[7px] translate-y-[-1px] rounded-full bg-work" />}
          <span className="truncate font-semibold">{h.description}</span>
          {!h.isDone && h.step && <span className="col-start-2 truncate text-[11.5px] text-faint">{stepText(h.step)}</span>}
        </li>
      ))}
    </ul>
  )
}

// The units of a plan, in order: each a repo and a PR, with what it delivers,
// its branch and what it waits for.
function Units({ units }: { units: Unit[] }) {
  return (
    <ol className="m-0 mt-3 flex list-none flex-col gap-px p-0">
      {units.map((u, i) => (
        <li key={u.id} className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-0.5 rounded-[8px] px-1 py-1.5">
          <span className="text-right font-mono text-xs text-faint">{i + 1}</span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold"><i className="size-2 rounded-[3px]" style={{ background: repoDot(u.repo) }} />{u.repo}</span>
            <span className="min-w-0 truncate text-[13px] text-text-muted">{u.title}</span>
          </span>
          {u.pr ? <a href={u.pr} target="_blank" rel="noreferrer" className="font-mono text-[11px] font-semibold text-brand no-underline hover:underline">PR #{u.pr.split("/").pop()}</a>
            : u.status === "failed" ? <span className="text-[11px] font-semibold text-bad">Failed</span>
            : <span className="font-mono text-[11px] text-faint">{subtasksOf(u) ?? ""}</span>}
          <span />
          <span className="min-w-0 truncate font-mono text-[11px] text-faint">{u.branch}{u.dependsOn.length > 0 && <span className="font-sans"> · after {u.dependsOn.map(d => units.findIndex(x => x.id === d) + 1 || d).join(", ")}</span>}</span>
        </li>
      ))}
    </ol>
  )
}

// The scripts the plan runs on the data: what each does, in which repo,
// when, and where (the staging stage runs them, a report each time).
function Scripts({ scripts, units }: { scripts: PlanScript[]; units: Unit[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="m-0 text-[13px] font-semibold">Scripts on the data</h3>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {scripts.map(x => {
          const unit = units.find(u => u.id === x.unit)
          return (
            <li key={x.id} className="flex flex-col gap-0.5">
              <span className="text-[13px] leading-[1.45]">{x.title}</span>
              <span className="flex min-w-0 items-baseline gap-2 text-[11.5px] text-faint">
                {unit && <span className="inline-flex shrink-0 items-center gap-1.5"><i className="size-[7px] rounded-[2px]" style={{ background: repoDot(unit.repo) }} />{unit.repo}</span>}
                <span className="min-w-0 truncate font-mono text-[11px]">{x.command}</span>
              </span>
              {(x.when || x.envs.length > 0) && <span className="text-[11.5px] text-faint">{[x.when, x.envs.join(" → ")].filter(Boolean).join(" · ")}</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// What the review found, the worst first: each says what fails and where (a
// click shows why and the fix); the ones a build fixed since, ticked.
const SEVERITY: Record<Severity, { rank: number; dot: string }> = { blocker: { rank: 0, dot: "bg-bad" }, major: { rank: 1, dot: "bg-ask" }, minor: { rank: 2, dot: "bg-line-strong" } }

function FindingRow({ finding: f, unit, isFixed, isPublished = false, isChosen, onChoose, ask }: { finding: Finding; unit: Unit | undefined; isFixed: boolean; isPublished?: boolean; isChosen: boolean | null; onChoose: () => void; ask?: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : ""
  return (
    <li className="flex items-start gap-2.5 border-t border-line first:border-t-0">
      {isChosen !== null && (
        <input type="checkbox" checked={isChosen} onChange={onChoose} aria-label={`Fix ${f.title}`}
          className="mt-[13px] size-3.5 shrink-0 cursor-pointer accent-(--brand)" />
      )}
      <div className="min-w-0 flex-1">
      <button className="grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-0.5 py-2 text-left" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>
        {isFixed ? <Check size={12} className="text-work" /> : <i className={cn("size-2 translate-y-[-1px] rounded-full", SEVERITY[f.severity].dot)} title={f.severity} />}
        <span className={cn("text-[13px] leading-[1.45]", isFixed ? "text-text-muted" : "text-text")}>{f.title}</span>
        {/* The build says it fixed it: only the next review confirms it. */}
        <span className={cn("text-[11px]", isFixed ? "font-semibold text-ask" : "text-faint")}>{isFixed ? "fixed · to confirm" : isPublished ? `${f.severity} · published` : f.severity}</span>
        <span className="col-start-2 flex min-w-0 items-baseline gap-2 text-[11.5px] text-faint">
          {unit && <span className="inline-flex shrink-0 items-center gap-1.5"><i className="size-[7px] rounded-[2px]" style={{ background: repoDot(unit.repo) }} />{unit.repo}</span>}
        </span>
      </button>
      {isOpen && (
        <div className="ml-6 flex flex-col gap-2 pb-3 text-[13px] leading-[1.55]">
          {/* For you first; the agent's own words (the file, the case, the fix) folded. */}
          {f.plain ? (
            <>
              <p className="m-0 text-text">{f.plain}</p>
              <Details label="Technical detail"><Technical where={where} finding={f} /></Details>
            </>
          ) : <Technical where={where} finding={f} />}
          {ask}
          {unit?.pr && <a href={`${unit.pr}/files`} target="_blank" rel="noreferrer" className="self-start text-xs font-semibold text-brand no-underline hover:underline">Open in PR #{unit.pr.split("/").pop()}</a>}
        </div>
      )}
      </div>
    </li>
  )
}

function Technical({ where, finding: f }: { where: string; finding: Finding }) {
  return (
    <div className="flex flex-col gap-2">
      {where && <span className="truncate font-mono text-[11px] text-faint">{where}</span>}
      {f.detail && <p className="m-0 text-text-muted">{f.detail}</p>}
      {f.fix && <p className="m-0 border-l-2 border-line-strong pl-3 text-text-muted">{f.fix}</p>}
    </div>
  )
}

// You choose what the build fixes: the blockers and majors come chosen, the
// minors not; one button fixes them all in one run. With blockers chosen it
// is the next step; with only minors, a quiet one beside staging.
// A job's review (lib/jobs.ts) publishes what you chose to its PRs instead: it asks once more.
function PublishButton({ n, onGo }: { n: number; onGo: () => void }) {
  const [isAsking, confirm] = useConfirm()
  const label = `Publish ${n} to the PRs`
  return (
    <Button variant={isAsking ? "destructive" : "outline"} className="mt-1 h-8 self-start gap-1.5 text-xs" onClick={() => confirm(onGo)}>
      <Send size={13} />{isAsking ? `Sure? ${label}` : label}
    </Button>
  )
}

function Findings({ state, onFix, onPublish }: { state: PipelineState; onFix: (ids: string[]) => void; onPublish?: (ids: string[]) => void }) {
  const findings = [...(state.findings ?? [])].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank)
  const fixed = new Set(state.fixed ?? [])
  const published = new Set((state as { published?: string[] }).published ?? [])
  const canChoose = state.stage === "review" && (state.status === "ready" || state.status === "needs-info") && (isJob(state) ? !!onPublish : state.status === "ready")
  const [picked, setChosen] = useState(() => new Set(findings.filter(f => f.severity !== "minor").map(f => f.id)))
  // What is published already is never chosen again.
  const chosen = new Set([...picked].filter(id => !published.has(id)))
  const choose = (id: string) => setChosen(c => (c.has(id) ? new Set([...c].filter(x => x !== id)) : new Set([...c, id])))
  const isBlocking = findings.some(f => chosen.has(f.id) && f.severity !== "minor")
  return (
    <div className="flex flex-col gap-1">
      <ol className="m-0 list-none p-0">
        {findings.map(f => <FindingRow key={f.id} finding={f} unit={state.units?.find(u => u.id === f.unit)} isFixed={fixed.has(f.id)} isPublished={published.has(f.id)} isChosen={canChoose && !published.has(f.id) ? chosen.has(f.id) : null} onChoose={() => choose(f.id)}
          ask={isJob(state) ? undefined : <Ask ticketKey={state.key} about={`finding:${f.id}`} turns={state.threads?.[`finding:${f.id}`]} />} />)}
      </ol>
      {canChoose && chosen.size > 0 && onPublish && <PublishButton n={chosen.size} onGo={() => onPublish([...chosen])} />}
      {canChoose && chosen.size > 0 && !onPublish && (
        <Button variant={isBlocking ? "default" : "outline"} className="mt-1 h-8 self-start gap-1.5 text-xs" onClick={() => onFix([...chosen])}>
          <Play size={13} className="fill-current" />Fix {chosen.size} with build
        </Button>
      )}
    </div>
  )
}

// A stage that ended: what it left, and the next step (or running it again).
// Starting a release changes the world: it asks once more.
// With things a person must have done first (a store build in review), a
// release asks for each of them in a dialog instead.
function StartButton({ stage, from, reminders = [], onRun }: { stage: Stage; from: Stage; reminders?: string[]; onRun: (stage: Stage) => void }) {
  const [isAsking, confirm] = useConfirm()
  const [isOpen, setOpen] = useState(false)
  const label = startText(stage, from)
  const press = () => (reminders.length ? setOpen(true) : isRelease(stage) ? confirm(() => onRun(stage)) : onRun(stage))
  return (
    <>
      <Button variant={isAsking ? "destructive" : "default"} className="h-8 shrink-0 gap-1.5 text-xs" onClick={press}>
        <Play size={13} className="fill-current" />{isAsking ? `Sure? ${label}` : label}
      </Button>
      {reminders.length > 0 && <Reminders isOpen={isOpen} label={label} reminders={reminders} onClose={() => setOpen(false)} onGo={() => (setOpen(false), onRun(stage))} />}
    </>
  )
}

function Reminders({ isOpen, label, reminders, onClose, onGo }: { isOpen: boolean; label: string; reminders: string[]; onClose: () => void; onGo: () => void }) {
  const [done, setDone] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setDone(d => (d.has(i) ? new Set([...d].filter(x => x !== i)) : new Set([...d, i])))
  const go = () => (done.size === reminders.length ? onGo() : toast("Tick each one first"))
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-[15px]">Before you {label.toLowerCase()}</DialogTitle>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {reminders.map((r, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.5]">
                <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} className="mt-[3px] size-3.5 shrink-0 accent-(--brand)" />{r}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" className="h-8 text-xs" onClick={onClose}>Not yet</Button>
          <Button className="h-8 gap-1.5 text-xs" onClick={go}><Play size={13} className="fill-current" />Done: {label.toLowerCase()}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Run the pipeline, or run it on its own until the review (the PRs done, before
// any release); on someone else's ticket, take it first (a second click confirms).
function RunButton({ ticket, onStarted, auto = false }: { ticket: Ticket; onStarted: () => void; auto?: boolean }) {
  const [isAsking, confirm] = useConfirm()
  const yours = ticket.isMine ? [] : deliverablesOf(ticket, true)
  if (yours.length) return <RunMine ticket={ticket} count={yours.length} onStarted={onStarted} auto={auto} />
  const run = async () => {
    const done = `${ticket.isMine ? "" : `${ticket.key} is yours: `}refining${auto ? ", then on its own until the review" : ""}`
    if (await act("/api/pipeline/start", { key: ticket.key, take: !ticket.isMine, auto }, done.charAt(0).toUpperCase() + done.slice(1))) onStarted()
  }
  const plain = auto ? "Run to review" : "Run pipeline"
  const label = ticket.isMine ? plain : !isAsking ? `Assign to me and ${plain.toLowerCase()}` : ticket.assignee ? `Sure? Take it from ${ticket.assignee}` : "Sure? Assign it to me"
  const Icon = auto ? FastForward : Play
  return (
    <Button variant={isAsking ? "destructive" : auto ? "outline" : "default"} className="h-8 gap-1.5 text-xs" title={auto ? "Refine, plan, build and review on their own; it stops before staging" : undefined}
      onClick={() => (ticket.isMine ? void run() : confirm(() => void run()))}>
      <Icon size={13} className="fill-current" />{label}
    </Button>
  )
}

// On someone else's ticket (an epic of the team) with children assigned to you:
// it runs only yours, and nothing of it is assigned or written in Jira.
function RunMine({ ticket, count, onStarted, auto }: { ticket: Ticket; count: number; onStarted: () => void; auto: boolean }) {
  const run = async () => (await act("/api/pipeline/start", { key: ticket.key, mine: true, auto }, `Refining ${ticket.key}, then your ${count} ticket${count === 1 ? "" : "s"} in it`)) && onStarted()
  const Icon = auto ? FastForward : Play
  return (
    <Button variant={auto ? "outline" : "default"} className="h-8 gap-1.5 text-xs" onClick={() => void run()}>
      <Icon size={13} className="fill-current" />{auto ? "Run mine to review" : `Run mine (${count})`}
    </Button>
  )
}

// Out of the pipeline (a second click confirms): the agent stops and the labels go;
// Jira's statuses, the PRs and the code stay. An epic takes its tickets with it.
function RemoveButton({ ticketKey, onRemoved }: { ticketKey: string; onRemoved: () => void }) {
  const [isAsking, confirm] = useConfirm()
  const remove = () => confirm(async () => {
    const out = await sendWithFeedback<{ warnings?: string[] }>("/api/pipeline/remove", { key: ticketKey }, r => ["Out of the pipeline", ...(r.warnings ?? [])].join(". "))
    if (out) onRemoved()
  })
  return (
    <button className={cn("mt-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold transition-colors duration-120",
      isAsking ? "bg-bad-soft text-bad" : "text-faint hover:bg-hover hover:text-text")} onClick={remove} title="Remove from the pipeline: Jira's statuses and the PRs stay">
      <LogOut size={12} />{isAsking && "Remove from pipeline?"}
    </button>
  )
}

// What runs put aside left (worktrees, local branches, the runs' folders): you
// see it all and pick; nothing goes until you press Delete.
// What it left, each to pick; nothing left, it says so.
function LeftoverList({ items, picked, onToggle }: { items: Leftover[]; picked: Set<string>; onToggle: (id: string) => void }) {
  if (!items.length) return <p className="m-0 text-[13px] text-text-muted">Nothing is left.</p>
  return (
    <ul className="m-0 flex min-h-0 list-none flex-col gap-1.5 overflow-auto p-0">
      {items.map(i => (
        <li key={i.id}>
          <label className="flex cursor-pointer items-start gap-2 text-[13px]">
            <input type="checkbox" checked={picked.has(i.id)} onChange={() => onToggle(i.id)} className="mt-[3px] size-3.5 shrink-0 accent-(--brand)" />
            <span className="min-w-0">
              <span className="block truncate">{i.label}</span>
              {(i.detail || i.warn) && <span className={cn("block text-xs", i.warn ? "text-bad" : "text-faint")}>{i.warn ?? i.detail}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function CleanUp({ ticketKey, count, onDone }: { ticketKey: string; count: number; onDone: () => void }) {
  const [items, setItems] = useState<Leftover[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [isBusy, setBusy] = useState(false)
  const open = async () => {
    try {
      const { items } = await get<{ items: Leftover[] }>(`/api/pipeline/leftovers?key=${encodeURIComponent(ticketKey)}`)
      setItems(items)
      setPicked(new Set(items.filter(i => i.isPicked).map(i => i.id)))
    } catch (err) {
      toast((err as Error).message || "It did not work")
    }
  }
  const toggle = (id: string) => setPicked(now => (now.has(id) ? new Set([...now].filter(x => x !== id)) : new Set([...now, id])))
  const remove = async () => {
    setBusy(true)
    const out = await sendWithFeedback<{ failed?: string[] }>("/api/pipeline/cleanup", { key: ticketKey, ids: [...picked] }, r => (r.failed?.length ? `Some of it stays: ${r.failed.join("; ")}` : `Deleted ${picked.size}`))
    setBusy(false)
    if (out) (setItems(null), onDone())
  }
  return (
    <>
      <button className="mt-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-faint transition-colors duration-120 hover:bg-hover hover:text-text"
        onClick={() => void open()} title="Clean up what the runs put aside left">
        <Trash2 size={12} />{count}
      </button>
      {items && (
        <Dialog open onOpenChange={o => !o && setItems(null)}>
          <DialogContent className="flex max-h-[min(80vh,640px)] w-[min(560px,calc(100vw-32px))] flex-col gap-3">
            <DialogTitle className="m-0 text-[15px] font-[620]">Clean up {ticketKey}</DialogTitle>
            <LeftoverList items={items} picked={picked} onToggle={toggle} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-8 text-xs" onClick={() => setItems(null)}>Cancel</Button>
              <Button variant="destructive" className="h-8 text-xs" disabled={!picked.size || isBusy} onClick={() => void remove()}>{isBusy ? "Deleting…" : `Delete ${picked.size}`}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ---------- the foot ----------

const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`
const DONE: Record<Stage, (r: Run) => string> = { refine: () => "Refined", plan: r => `Planned in ${r.units} unit${r.units === 1 ? "" : "s"}`, build: r => `Built ${r.units} unit${r.units === 1 ? "" : "s"}`, review: r => `Reviewed: ${r.findings ?? 0} finding${r.findings === 1 ? "" : "s"}`, staging: () => "Deployed to staging", test: () => "Tested in staging", prod: () => "Deployed to prod", smoke: () => "Checked in prod" }
const sayRun = (r: Run, doing: string | null) =>
  r.status === "running" ? (doing ?? "Starting") : r.status === "needs-info" ? `Asked ${r.questions} question${r.questions === 1 ? "" : "s"}` : r.status === "failed" ? (r.error ?? "Failed") : DONE[r.stage ?? "refine"](r)

// What a run spent: its model, the tokens it sent (cached or not) and got
// back, and what that would cost on the API.
const modelName = (id: string | null) => MODELS.find(([m]) => id?.startsWith(m))?.[1] ?? id ?? "—"
const spendText = ({ spend: s }: Run) => s && `${modelName(s.model)} · ${tokens(s.input + s.cacheRead + s.cacheWrite)} in · ${tokens(s.output)} out · ≈${dollars(s.cost)}`

// Every run, the latest first: what it ended in (or does now), how long,
// what it spent, its log.
export function Runs({ history, now }: { history: Run[]; now: number }) {
  const cards = useLive(l => l.snapshot?.cards)
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
      {[...history].reverse().map(r => {
        const card = r.status === "running" ? cards?.find(c => c.id === r.sessionId) : undefined
        return (
          <li key={r.n} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_2rem] items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-faint">#{r.n}</span>
            <span className={cn("truncate", r.status === "failed" ? "text-bad" : "text-text-muted")} title={r.cause ?? undefined}>{r.cause && <span className="text-faint">{r.cause.split(":")[0]} · </span>}{sayRun(r, doingText(card?.doing))}</span>
            <span className="text-faint tabular-nums">{minutes((r.endedAt ?? now) - r.startedAt)} · {ago(r.endedAt ?? r.startedAt, now)}</span>
            {r.sessionId ? <button className="text-right font-semibold text-text-muted hover:text-text" onClick={() => openLog(r.sessionId!)}>Log</button> : <span />}
            {r.spend && <span className="col-span-3 col-start-2 truncate text-[11.5px] text-faint tabular-nums">{spendText(r)}</span>}
          </li>
        )
      })}
    </ol>
  )
}

export function FoldButton({ label, isOpen, onToggle }: { label: ReactNode; isOpen: boolean; onToggle: () => void }) {
  return (
    <button className={cn("inline-flex items-center gap-1 text-xs font-semibold transition-colors duration-120", isOpen ? "text-text" : "text-text-muted hover:text-text")} onClick={onToggle} aria-expanded={isOpen}>
      <ChevronRight size={13} className={cn("transition-transform duration-150 ease-(--ease-out)", isOpen && "rotate-90")} />{label}
    </button>
  )
}

// ---------- the stage you pick ----------

const Tile = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("flex min-w-0 flex-col gap-1 rounded-[10px] bg-surface px-3 py-2.5", className)}>{children}</div>
)
const RepoName = ({ repo }: { repo: string }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold"><i className="size-2 shrink-0 rounded-[3px]" style={{ background: repoDot(repo) }} /><span className="truncate">{repo}</span></span>
)
const Tiles = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">{children}</div>

// What a stage keeps for whoever goes looking: folded.
function Details({ children, label = "Details" }: { children: ReactNode; label?: string }) {
  const [isOpen, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <FoldButton label={label} isOpen={isOpen} onToggle={() => setOpen(o => !o)} />
      {isOpen && children}
    </div>
  )
}

// An agent at work in this stage: how far it got (its to-do list, its units),
// its subagents; every step it took, folded.
export function AtWork({ state }: { state: PipelineState }) {
  const activity = useActivity(state.key, true, isJob(state))
  const busy = activity?.helpers.filter(h => !h.isDone) ?? []
  const focus = passFocus(state)
  return (
    <div className="flex flex-col gap-3">
      {focus ? <ThisPass text={focus} />
        : state.checklist?.length ? <Checklist items={state.checklist} checked={activity?.checked ?? []} isBuilding={state.stage === "build"} /> : null}
      {busy.length > 0 && <Helpers helpers={busy} />}
      {(activity?.steps.length ?? 0) > 0 && (
        <Details label="Every step">
          {activity?.units.length ? <Units units={activity.units} /> : null}
          {activity!.helpers.length > busy.length && <Helpers helpers={activity!.helpers} />}
          <Steps steps={activity!.steps} />
        </Details>
      )}
    </div>
  )
}

// What a pass works on when it is not the plan's list: what you wrote when you sent it back,
// or what a review or a test found to fix.
const passFocus = (state: PipelineState) =>
  state.stage === "build" && state.fixing ? `Fixing ${state.fixing.ids.join(", ")}, from the ${state.fixing.from}`
    : ["build", "review", "test", "smoke"].includes(state.stage) && state.backNote && sentBackSince(state, state.stage) ? state.backNote : null
function ThisPass({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text-muted">This pass</span>
      <p className="m-0 line-clamp-6 border-l-2 border-line-strong pl-3 text-[13px] leading-[1.55] whitespace-pre-wrap text-text-muted">{text}</p>
    </div>
  )
}

// The sub-tasks a unit covers, in a line (the single one of older plans too).
const subtasksOf = (u: Unit) => (u.subtasks?.length ? u.subtasks.join(", ") : u.subtask) || null

// The refinement: the decisions it asked for and how many runs it took.
function RefinePanel({ state }: { state: PipelineState }) {
  const runs = (state.history ?? []).filter(r => (r.stage ?? "refine") === "refine")
  const asked = runs.reduce((n, r) => n + r.questions, 0)
  return (
    <Tiles>
      <Tile><span className="text-[11.5px] text-faint">Decisions asked</span><span className="text-[20px] leading-none font-semibold tabular-nums">{asked}</span></Tile>
      <Tile><span className="text-[11.5px] text-faint">Runs</span><span className="text-[20px] leading-none font-semibold tabular-nums">{runs.length}</span></Tile>
      <Tile><span className="text-[11.5px] text-faint">Cost</span><span className="text-[20px] leading-none font-semibold tabular-nums">≈{dollars(costOf(runs))}</span></Tile>
    </Tiles>
  )
}

export function PlanPanel({ state, steps }: { state: PipelineState; steps: number | null }) {
  const units = state.units ?? []
  return (
    <div className="flex flex-col gap-3">
      <Tiles>{units.map(u => <Tile key={u.id}><RepoName repo={u.repo} /><span className="text-[11.5px] text-faint">{subtasksOf(u) ?? u.id}</span></Tile>)}</Tiles>
      <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        {state.checklist?.length ? <span className="inline-flex items-center gap-1.5"><ListChecks size={13} />{state.checklist.length} to-dos</span> : null}
        {state.scripts?.length ? <span className="inline-flex items-center gap-1.5"><Database size={13} />{state.scripts.length} script{state.scripts.length === 1 ? "" : "s"} on the data</span> : null}
        {steps ? <span className="inline-flex items-center gap-1.5"><Route size={13} />release in {steps} steps</span> : null}
      </span>
      <Details>
        <Units units={units} />
        {state.scripts?.length ? <Scripts scripts={state.scripts} units={units} /> : null}
        {state.checklist?.length ? <Checklist items={state.checklist} checked={state.checked ?? []} isBuilding={false} /> : null}
      </Details>
    </div>
  )
}

export function BuildPanel({ state }: { state: PipelineState }) {
  const units = state.units ?? []
  return (
    <div className="flex flex-col gap-3">
      <Tiles>
        {units.map(u => (
          <Tile key={u.id}>
            <RepoName repo={u.repo} />
            <span className="flex items-center justify-between text-[11.5px]">
              {u.pr ? <a href={u.pr} target="_blank" rel="noreferrer" className="font-mono font-semibold text-brand no-underline hover:underline">PR #{u.pr.split("/").pop()}</a> : <span className="text-faint">No PR</span>}
              {u.status === "done" ? <span className="inline-flex items-center gap-1 text-work" title="Tests and checks passed"><FlaskConical size={12} /><Check size={12} strokeWidth={2.6} /></span>
                : u.status === "failed" ? <span className="text-bad">Failed</span> : null}
            </span>
          </Tile>
        ))}
      </Tiles>
      <Details>
        <Units units={units} />
        {state.checklist?.length ? <Checklist items={state.checklist} checked={state.checked ?? []} isBuilding={false} /> : null}
      </Details>
    </div>
  )
}

const COUNTS: [Severity, string, string][] = [["blocker", "Blocker", "text-bad"], ["major", "Major", "text-ask"], ["minor", "Minor", "text-text"]]
export function ReviewPanel({ state, onFix, onPublish }: { state: PipelineState; onFix: (ids: string[]) => void; onPublish?: (ids: string[]) => void }) {
  const findings = state.findings ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {COUNTS.map(([severity, label, tone]) => {
          const n = findings.filter(f => f.severity === severity).length
          return <Tile key={severity}><span className="text-[11.5px] text-faint">{label}</span><span className={cn("text-[20px] leading-none font-semibold tabular-nums", n ? tone : "text-faint")}>{n}</span></Tile>
        })}
      </div>
      {findings.length > 0 && <Findings state={state} onFix={onFix} onPublish={onPublish} />}
    </div>
  )
}

// A release: its steps as a row, the one at hand with its button; every step, folded.
// The agent stage after a release, as the rail's last node: the test in staging, the check in prod.
const afterOf = (env: Stage, state: PipelineState): After => {
  const agent = env === "staging" ? "test" : "smoke"
  const title = env === "staging" ? "Test in staging" : "Check prod"
  if (state.stage !== agent) return { title, status: "pending" }
  const status = state.status === "running" ? "running" : state.status === "failed" || failing(state.results).length ? "failed" : state.status === "needs-info" || (state.results ?? []).some(r => r.status === "untested") ? "waiting" : "done"
  return { title, status }
}
const failing = (results: TestResult[] | undefined) => (results ?? []).filter(r => r.status === "fail")

function ReleasePanel({ ticketKey, release, after, isLive, isPreview, onStep }: { ticketKey: string; release: Release; after: After; isLive: boolean; isPreview: boolean; onStep: OnStep }) {
  return (
    <div className="flex flex-col gap-3">
      <ReleaseRail release={release} after={after} />
      {isLive && <StepAtHand ticketKey={ticketKey} release={release} onAct={onStep} />}
      <Details label="Every step"><ReleaseSteps ticketKey={ticketKey} release={release} after={after} isPreview={isPreview} /></Details>
    </div>
  )
}

// What a test (in staging) or a check (in prod) found: how many criteria
// pass and fail, then each one (its evidence a click away).
// One the test could not try says why, and you check it by hand (it then passes, saying so).
const RESULT_MARK = {
  pass: <Check size={13} strokeWidth={2.6} className="shrink-0 translate-y-[2px] text-work" />,
  fail: <AlertTriangle size={13} className="shrink-0 translate-y-[2px] text-bad" />,
  untested: <CircleHelp size={13} className="shrink-0 translate-y-[2px] text-ask" />,
}
function ResultRow({ result: r, ticketKey, canCheck, turns }: { result: TestResult; ticketKey: string; canCheck: boolean; turns?: Turn[] }) {
  const [isOpen, setOpen] = useState(false)
  return (
    <li className="border-t border-line first:border-t-0">
      <div className="flex items-baseline gap-2">
        <button className="flex min-w-0 flex-1 items-baseline gap-2.5 py-2 text-left" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>
          {RESULT_MARK[r.status]}
          <span className="text-[13px] leading-[1.45]">{r.criterion}</span>
        </button>
        {r.status === "untested" && canCheck && (
          <button className="shrink-0 text-xs font-semibold text-text-muted hover:text-text" onClick={() => void act("/api/pipeline/checked", { key: ticketKey, ids: [r.id] }, "Checked by hand").then(ok => ok && changed())}>Checked by hand</button>
        )}
      </div>
      {r.summary && r.status !== "pass" && <p className="m-0 ml-6 pb-2 text-[13px] leading-[1.55] text-text-muted">{r.summary}</p>}
      {isOpen && r.evidence && <p className="m-0 ml-6 pb-3 font-mono text-[11.5px] leading-[1.55] break-words whitespace-pre-wrap text-text-muted">{r.evidence}</p>}
      {canCheck && r.status !== "pass" && <Ask ticketKey={ticketKey} about={`result:${r.id}`} turns={turns} className="mb-2.5 ml-6" />}
      <Evidence ticketKey={ticketKey} files={r.files ?? []} />
    </li>
  )
}

const RESULT_ORDER: TestResult["status"][] = ["fail", "untested", "pass"]
const RESULT_TILES: [TestResult["status"], string, string][] = [["pass", "Pass", "text-work"], ["fail", "Fail", "text-bad"], ["untested", "Untested", "text-ask"]]
export function TestPanel({ state, release }: { state: PipelineState; release: Release | null }) {
  const results = state.results ?? []
  const count = (status: TestResult["status"]) => results.filter(r => r.status === status).length
  const canCheck = state.status === "ready" && !isJob(state)
  return (
    <div className="flex flex-col gap-3">
      {release && <ReleaseRail release={release} after={afterOf(release.env, state)} />}
      <div className="grid grid-cols-3 gap-2">
        {RESULT_TILES.map(([status, label, tone]) => (
          <Tile key={status}><span className="text-[11.5px] text-faint">{label}</span><span className={cn("text-[20px] leading-none font-semibold tabular-nums", count(status) ? tone : "text-faint")}>{count(status)}</span></Tile>
        ))}
      </div>
      {results.length > 0 && <ol className="m-0 list-none p-0">{[...results].sort((a, b) => RESULT_ORDER.indexOf(a.status) - RESULT_ORDER.indexOf(b.status)).map(r => <ResultRow key={r.id} result={r} ticketKey={state.key} canCheck={canCheck} turns={state.threads?.[`result:${r.id}`]} />)}</ol>}
      {release && <Details label="The deploy"><ReleaseSteps ticketKey={state.key} release={release} after={afterOf(release.env, state)} /></Details>}
    </div>
  )
}

// What the board checked of the last run by itself: a line (how many hold,
// how many warn), each one a click away.
function Checks({ checks }: { checks: BoardCheck[] }) {
  const [isOpen, setOpen] = useState(false)
  const warns = checks.filter(c => c.status === "warn")
  return (
    <div className="flex flex-col gap-1.5">
      <button className="inline-flex items-center gap-2 self-start text-xs text-text-muted hover:text-text" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>
        <ShieldCheck size={13} className={warns.length ? "text-ask" : "text-work"} />
        <span className="font-semibold">Checks</span>
        <span className="text-faint tabular-nums">{checks.length - warns.length} ok{warns.length ? ` · ${warns.length} to look at` : ""}</span>
        <ChevronRight size={12} className={cn("transition-transform duration-150", isOpen && "rotate-90")} />
      </button>
      {isOpen && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-5">
          {[...warns, ...checks.filter(c => c.status === "ok")].map(c => (
            <li key={c.id} className="flex items-baseline gap-2 text-xs">
              {c.status === "ok" ? <Check size={11} strokeWidth={2.6} className="shrink-0 text-work" /> : <AlertTriangle size={11} className="shrink-0 text-ask" />}
              <span className={c.status === "ok" ? "text-text-muted" : "text-text"}>{c.label}</span>
              {c.detail && <span className="min-w-0 truncate text-faint">{c.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The column a stage is shown in: the test in staging's, the check in prod's.
const nodeOf = (stage: Stage): Stage => (stage === "test" ? "staging" : stage === "smoke" ? "prod" : stage)

function StagePanel({ stage, state, preview, onRun, onStep }: { stage: Stage; state: PipelineState; preview: Release | null; onRun: (stage?: Stage, fix?: string[]) => void; onStep: OnStep }) {
  const at = stageAt(state)
  const i = STAGE_KEYS.indexOf(stage)
  const release = releaseShown(state, preview, stage)
  // The column's agent stage at work, or done: its findings, the deploy folded.
  if (nodeOf(state.stage) === stage && state.stage !== stage) return state.status === "running"
    ? <div className="flex flex-col gap-3">{release && <ReleaseRail release={release} after={afterOf(stage, state)} />}<AtWork state={state} /></div>
    : <TestPanel state={state} release={release} />
  if (isRelease(stage) && release) return <ReleasePanel ticketKey={state.key} release={release} after={afterOf(stage, state)} isLive={release === state.release && state.status === "running"} isPreview={release === preview} onStep={onStep} />
  if (i > at) return <p className="m-0 text-[13px] text-faint">Starts after {STAGES[i - 1]}.</p>
  if (i === at && state.status === "running") return <AtWork state={state} />
  if (stage === "refine") return <RefinePanel state={state} />
  if (stage === "plan") return <PlanPanel state={state} steps={(state.release ?? preview)?.steps.length ?? null} />
  if (stage === "build") return <BuildPanel state={state} />
  if (stage === "review") return <ReviewPanel state={state} onFix={ids => onRun("build", ids)} />
  return null
}

// ---------- now ----------

// What happens or what the ticket waits for, in a line, and the one button
// that moves it on (Retry and Skip when a release failed; the log of an agent at work).
function Now({ state, preview, now, onRun, onStep }: { state: PipelineState; preview: Release | null; now: number; onRun: (stage?: Stage) => void; onStep: OnStep }) {
  const card = useLive(l => l.snapshot?.cards.find(c => c.id === state.sessionId))
  const isRunning = state.status === "running"
  const release = isRelease(state.stage) ? state.release : null
  // Asked only while an agent works: a release or a stage that ended has no steps to follow.
  const activity = useActivity(state.key, isRunning && !release, isJob(state))
  const step = isRunning && !release ? (activity?.steps.findLast(s => s.isOpen) ?? activity?.steps.at(-1)) : undefined
  // Done with its stage, it says what comes next (the journey already says what it did).
  const line = step?.text ?? (state.status === "ready" && !toFix(state).length ? statusText(state) : liveLine(state, card))
  const isFailed = state.status === "failed"
  const isAsking = state.status === "needs-info" || toFix(state).length > 0
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-surface px-3 py-2.5">
      <PipelineMark state={state} card={card} size={26} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isRunning ? <Shimmer as="span" duration={2.2} className="truncate text-[13.5px] font-semibold [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{line}</Shimmer>
          : <span className={cn("truncate text-[13.5px] font-semibold", isFailed ? "text-bad" : isAsking ? "text-ask" : "text-text")}>{line}</span>}
        <span className="text-[11.5px] text-faint tabular-nums">{STAGES[stageAt(state)]} · {ago(isRunning ? state.startedAt : (state.endedAt ?? state.startedAt), now)}{isAuto(state) ? " · on its own" : ""}
          {state.news?.comments.length ? <span className="font-semibold text-ask"> · {state.news.comments.length} new in Jira</span> : null}</span>
      </div>
      <NowActions state={state} preview={preview} now={now} onRun={onRun} onStep={onStep} />
    </div>
  )
}

// The log of an agent at work; Retry (and Skip, in a release) when it failed;
// else the button that starts what comes next.
function NowActions({ state, preview, now, onRun, onStep }: { state: PipelineState; preview: Release | null; now: number; onRun: (stage?: Stage) => void; onStep: OnStep }) {
  const release = isRelease(state.stage) ? state.release : null
  const next = nextStage(state)
  if (state.status === "running") return (
    <>
      {isAuto(state) && <StopAuto ticketKey={state.key} />}
      {!release && <StopAgent path="/api/pipeline/stop" body={{ key: state.key }} />}
      {state.sessionId && <button className="shrink-0 text-xs font-semibold text-text-muted hover:text-text" onClick={() => openLog(state.sessionId!)}>Log</button>}
    </>
  )
  const isRolledBack = !!release?.rollback && release.steps.every(s => s.status === "done" || s.status === "skipped")
  // Back to an earlier stage, from wherever it waits (not a job's: it has no stages before).
  const back = isJob(state) ? null : <SendBack state={state} now={now} />
  if (state.status === "failed") return (
    <>
      {back}
      <RollBack state={state} />
      {release && !isRolledBack && <SkipFailed release={release} onAct={onStep} />}
      {!isRolledBack && <Button variant="outline" className="h-7 shrink-0 text-xs" onClick={() => onRun()}>{release ? "Retry" : "Run again"}</Button>}
      {/* Rolled back, the environment runs the code from before the ticket: it is built again. */}
      {isRolledBack && <Button className="h-7 shrink-0 text-xs" onClick={() => onRun("build")}>Build again</Button>}
    </>
  )
  // Fixing what the review found starts from its findings.
  return (
    <>
      {back}
      <RollBack state={state} />
      <AfterTest state={state} onRun={onRun} />
      {next && !(state.stage === "review" && next === "build") ? <StartButton stage={next} from={state.stage} reminders={preview?.env === next ? preview.reminders : undefined} onRun={onRun} /> : null}
    </>
  )
}

// A test (or a check in prod) that found something runs again (after a fix, or with
// new data); what failed in staging goes back to Build: new PRs that fix it, then
// review, staging and the test again.
function AfterTest({ state, onRun }: { state: PipelineState; onRun: (stage?: Stage) => void }) {
  if (state.stage !== "test" && state.stage !== "smoke") return null
  const fails = failing(state.results).length
  const isRetest = (state.results ?? []).some(r => r.status !== "pass")
  return (
    <>
      {isRetest && <Button variant="outline" className="h-7 shrink-0 text-xs" onClick={() => onRun(state.stage)}>{state.stage === "test" ? "Test again" : "Check again"}</Button>}
      {state.stage === "test" && fails > 0 && <Button className="h-7 shrink-0 gap-1.5 text-xs" onClick={() => onRun("build")}><Play size={12} className="fill-current" />Fix {fails} with build</Button>}
    </>
  )
}

// Stop the agent at work (it asks once more): the stage (or the job) fails, to run again.
export function StopAgent({ path, body }: { path: string; body: object }) {
  const [isAsking, confirm] = useConfirm()
  return (
    <button className={cn("shrink-0 text-xs font-semibold transition-colors duration-120", isAsking ? "text-bad" : "text-faint hover:text-text")}
      onClick={() => confirm(() => void act(path, body, "Stopped"))}>{isAsking ? "Sure? Stop" : "Stop"}</button>
  )
}

// Running on its own (lib/pipeline.ts autoNext): up to the review, fixing what it finds, and the
// test once staging is deployed; it stops where you decide. A click stops it there.
const isAuto = (state: PipelineState) => !!state.auto && state.status === "running"
function StopAuto({ ticketKey }: { ticketKey: string }) {
  return <button className="shrink-0 text-xs font-semibold text-faint hover:text-text" onClick={() => void act("/api/pipeline/auto", { key: ticketKey }, "It stops after this stage")}>Stop auto</button>
}

// Undoing a release, where one ended in this column: quiet, and it asks twice.
function RollBack({ state }: { state: PipelineState }) {
  const [isAsking, confirm] = useConfirm()
  const env = nodeOf(state.stage)
  const isDeployed = (env === "staging" || env === "prod") && (!!state.deployed?.[env] || (state.release?.env === env && !state.release.rollback && state.status !== "failed"))
  if (!isDeployed || (state.release?.rollback && state.release.env === env)) return null
  const go = () => confirm(() => void act("/api/pipeline/rollback", { key: state.key, env }, `Rolling back ${env}`))
  return (
    <button className={cn("shrink-0 text-xs font-semibold transition-colors duration-120", isAsking ? "text-bad" : "text-faint hover:text-text")} onClick={go}>
      {isAsking ? `Sure? Roll back ${env}` : `Roll back ${env}`}
    </button>
  )
}

// The stage the section opens on: a release about to start, else the stage at hand.
const focusOf = (state: PipelineState) => {
  const next = nextStage(state)
  return nodeOf(next && isRelease(next) ? next : state.stage)
}
const AHEAD = STAGE_KEYS.map(stage => ({ stage, tone: "todo" as const, fact: null }))
const span = (runs: Run[], now: number) => (runs.length ? Math.max(...runs.map(r => r.endedAt ?? now)) - Math.min(...runs.map(r => r.startedAt)) : 0)
const hours = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`)

// A stage just started, as the board will have it: at work, from now.
export const startedState = (state: PipelineState, stage?: Stage): PipelineState =>
  ({ ...state, stage: stage ?? state.stage, status: "running", startedAt: Date.now(), endedAt: null, error: null, sessionId: null, questions: [] })

// A stage run more than once (a fix, a test again) shows each pass apart: the
// latest at first; an earlier one as it left it (its units, findings or results,
// and its document), only to read: no button acts on a past pass.
function StagePasses({ stage, ...props }: { stage: Stage; state: PipelineState; preview: Release | null; onRun: (stage?: Stage, fix?: string[]) => void; onStep: OnStep }) {
  const passes = passesOf(props.state.history ?? [], stage)
  const [picked, setPicked] = useState<number | null>(null)
  const run = passes.find(r => r.n === picked)
  const isPast = !!run && run !== passes.at(-1) && !!run.kept
  return (
    <div className="flex flex-col gap-3">
      {passes.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Passes">
          {passes.map((r, i) => {
            const isOn = r.n === (isPast ? run!.n : passes.at(-1)!.n)
            return (
              <button key={r.n} role="tab" aria-selected={isOn} disabled={!r.kept && i < passes.length - 1} onClick={() => setPicked(i === passes.length - 1 ? null : r.n)}
                title={`Run ${r.n} · ${new Date(r.startedAt).toLocaleString()}`}
                className={cn("h-6 rounded-md px-2 text-[11.5px] font-semibold transition-colors duration-100 disabled:opacity-40", isOn ? "bg-surface text-text" : "text-faint hover:text-text")}>
                Pass {i + 1}{i === passes.length - 1 ? " · latest" : ""}
              </button>
            )
          })}
        </div>
      )}
      {isPast ? <PastPass stage={stage} run={run!} {...props} /> : <StagePanel stage={stage} {...props} state={latestPass(props.state, passes)} />}
    </div>
  )
}

// With more than one pass, the latest also shows only what it left (its buttons stay).
const latestPass = (state: PipelineState, passes: Run[]): PipelineState => {
  const last = passes.at(-1)
  return passes.length > 1 && last?.kept ? { ...state, ...last.kept } : state
}

function PastPass({ stage, run, state, preview, onStep }: { stage: Stage; run: Run; state: PipelineState; preview: Release | null; onStep: OnStep }) {
  const [doc, setDoc] = useState<string | null>(null)
  const [isOpen, setOpen] = useState(false)
  useEffect(() => void get<{ doc: string | null }>(`/api/pipeline/run-doc?key=${encodeURIComponent(state.key)}&n=${run.n}`).then(r => setDoc(r.doc), () => {}), [state.key, run.n])
  // As that pass left it; "failed" keeps every button of the panels away.
  const past: PipelineState = { ...state, ...run.kept, stage: run.stage, status: "failed", threads: {} }
  return (
    <div className="flex flex-col gap-3">
      <StagePanel stage={stage} state={past} preview={preview} onRun={() => {}} onStep={onStep} />
      {doc && <FoldButton label="This pass's document" isOpen={isOpen} onToggle={() => setOpen(o => !o)} />}
      {isOpen && doc && <Markdown className="text-[13px]">{doc}</Markdown>}
    </div>
  )
}

// ---------- the section ----------

export function Pipeline({ ticket, onTaken }: { ticket: Ticket; onTaken: () => void }) {
  const now = useNow()
  const [data, setData] = useState<Data | null>(null)
  const [fold, setFold] = useState<Fold | null>(null)
  const [picked, setPicked] = useState<Stage | null>(null)
  const [isResetting, confirmReset] = useConfirm()
  const load = () => get<Data>(`/api/pipeline?key=${encodeURIComponent(ticket.key)}`).then(setData, () => {})
  const isRunning = data?.state?.status === "running" || Object.values(data?.state?.threads ?? {}).some(t => isWaiting(t))
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), isRunning ? FOLLOW_MS : IDLE_MS)
    // Something you did deep in the section (Checked by hand…): read it again at once.
    const now = () => void load()
    window.addEventListener(CHANGED, now)
    return () => (clearInterval(timer), window.removeEventListener(CHANGED, now))
  }, [ticket.key, isRunning])
  if (!data) return null
  const state = data.state
  const loadSoon = () => setTimeout(() => void load(), 800)
  const step: OnStep = async (id, action, value) => (await act("/api/pipeline/step", { key: ticket.key, step: id, action, value }, action === "skip" ? "Skipped" : "On it")) && loadSoon()
  // At work at once on screen (the board confirms it a moment later), and back as it was if it refuses.
  const start = async (stage?: Stage, fix?: string[]) => {
    const before = data
    if (state) setData({ ...data, state: startedState(state, stage) })
    setPicked(null)
    if (await act("/api/pipeline/start", { key: ticket.key, stage, fix }, stage ? startingText(stage, state?.stage) : "A session starts")) loadSoon()
    else setData(before)
  }
  const reset = () => confirmReset(async () => (await act("/api/pipeline/reset", { key: ticket.key }, "Started over: the comments stay in Jira")) && void load())
  const runs = state?.history ?? []
  const toggle = (f: Fold) => setFold(open => (open === f ? null : f))
  const docs = ([["refine", "Refinement", data.refine], ["plan", "Plan", data.plan], ["build", "Build", data.build], ["review", "Review", data.review], ["test", "Test", data.test], ["smoke", "Prod check", data.smoke]] as const).filter(([, , text]) => text)
  const shown = picked ?? (state ? focusOf(state) : "refine")
  return (
    <section className="overflow-hidden rounded-[12px] border border-line bg-side">
      <header className="flex items-start gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1"><Journey nodes={state ? journeyOf(state, data.preview) : AHEAD} picked={shown} onPick={setPicked} /></div>
        {state && !isRunning && (
          <button className={cn("mt-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold transition-colors duration-120",
            isResetting ? "bg-bad-soft text-bad" : "text-faint hover:bg-hover hover:text-text")} onClick={reset} title="Start over: clears the runs and the labels">
            <RotateCcw size={12} />{isResetting && "Start over?"}
          </button>
        )}
        {state && !(isRunning && isRelease(state.stage)) && <RemoveButton ticketKey={ticket.key} onRemoved={() => void load()} />}
        {data.putAside > 0 && <CleanUp ticketKey={ticket.key} count={data.putAside} onDone={() => void load()} />}
      </header>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {!state && (
          <div className="flex flex-wrap gap-2">
            <RunButton ticket={ticket} onStarted={() => (loadSoon(), ticket.isMine || onTaken())} />
            <RunButton ticket={ticket} auto onStarted={() => (loadSoon(), ticket.isMine || onTaken())} />
          </div>
        )}
        {state && <Now state={state} preview={data.preview} now={now} onRun={stage => void start(stage)} onStep={step} />}
        {state?.checks?.length && state.status !== "running" ? <Checks checks={state.checks} /> : null}
        {state && <Proposed state={state} />}
        {state?.status === "needs-info" ? <Decisions key={state.askedAt} ticketKey={ticket.key} state={state} onSent={() => void load()} />
          : state && <StagePasses key={shown} stage={shown} state={state} preview={data.preview} onRun={(stage, fix) => void start(stage, fix)} onStep={step} />}
      </div>
      {(docs.length > 0 || runs.length > 0) && (
        <footer className="border-t border-line px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {runs.length > 0 && <span className="flex items-center gap-3 text-xs text-faint tabular-nums"><span>≈{dollars(costOf(runs))}</span><span>{runs.length} runs</span><span>{hours(span(runs, now))}</span></span>}
            <span className="ml-auto flex gap-4">
              {docs.map(([key, label]) => <FoldButton key={key} label={label} isOpen={fold === key} onToggle={() => toggle(key)} />)}
              {runs.length > 0 && <FoldButton label="Runs" isOpen={fold === "runs"} onToggle={() => toggle("runs")} />}
            </span>
          </div>
          {docs.map(([key, , text]) => fold === key && <Markdown key={key} className="mt-3 text-[13px]">{text!}</Markdown>)}
          {fold === "runs" && <div className="mt-3"><Runs history={runs} now={now} /></div>}
        </footer>
      )}
    </section>
  )
}
