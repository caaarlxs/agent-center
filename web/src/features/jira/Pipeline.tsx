// The pipeline on a ticket (lib/pipeline.ts), to read at a glance. On top,
// now: what happens or what the ticket waits for, the one button that moves
// it on, and a menu with the rest (TicketMenu.tsx). Under it, a tab each
// stage, marked by its state (StageTabs.tsx), and one for the ticket itself.
// A stage's tab shows the pass you pick (the latest, at first; PassPicker.tsx):
// the units and their PRs, the review's findings, a release's steps, the
// test's results; what the board checked of its last run, the tickets it
// proposed, and its document. When the stage needs you, its decisions take
// its tab: each a question and the agent's proposal, kept unless you change
// it; the answers go to Jira and start the stage again. The Ticket tab holds
// what Jira says of it and every run with what it spent. On someone else's
// ticket it runs only once you take it (two clicks: it is assigned to you).
import { AlertTriangle, Check, ChevronRight, FastForward, Play, ShieldCheck } from "lucide-react"
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
import { Markdown, TicketDocsOf } from "@/features/conversation/Markdown"
import { doingText } from "@/features/conversation/session-events"
import { ago } from "@/features/session/state"
import { repoDot } from "@/features/session/state"
import type { Helper, Step } from "@server/activity"
import { sentBackSince } from "@server/sent-back"
import type { PipelineState, PrFix, Run, Stage, Unit } from "@server/pipeline"
import type { Check as BoardCheck } from "@server/checks"
import { deliverablesOf } from "@server/scope"
import { MODELS } from "@/features/prompt/Settings"
import { PipelineMark, liveLine, startText, startingText, statusText } from "./PipelineMark"
import { STAGES, STAGE_KEYS, releasePasses, releaseShown, costOf, dollars, failed, isJob, isRelease, nextStage, nodeOf, passesOf, stageAt, toFix, tokens, tonesOf } from "./pipeline-board"
import { SkipFailed } from "./Release"
import { StageTabs, type Tab } from "./StageTabs"
import { AskedList, BuildPanel, Checklist, PlanPanel, Summary, RefinePanel, ReleasePanel, ReviewPanel, TestPanel, afterOf, subtasksOf } from "./StagePanels"
import { Details, FoldButton } from "./Fold"
import { PassPicker, type Pass } from "./PassPicker"
import { TicketMenu } from "./TicketMenu"
import { Section } from "./kinds"
import { CHANGED, useConfirm } from "./confirm"
import { act } from "./feedback"
import { Proposed, TicketsIfAgreed } from "./Proposals"
import type { Proposal } from "@server/proposals"
export { useConfirm }
import { Ask, isWaiting } from "./Ask"
import { SendBack } from "./SendBack"
import type { Release } from "@server/release"
import type { PrState, Scenario } from "@server/stage-extras"
import type { DebtEntry } from "@server/debt"
import { StageDataContext } from "./stage-data"
import { DocViewer } from "./DocViewer"

type Data = { putAside: number; docs: number[]; files: string[]; summaries: Partial<Record<Stage, string | null>>; prs: Record<string, PrState>; fixes: Record<string, PrFix>; scenario: Scenario | null; state: PipelineState | null; refine: string | null; plan: string | null; build: string | null; review: string | null; test: string | null; smoke: string | null; preview: Release | null }
type OnStep = (step: string, action: "approve" | "skip", value?: string) => void
const FOLLOW_MS = 5_000
const IDLE_MS = 30_000

// Something changed on the ticket from inside its section: the section reads it again.



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
          <Markdown className="border-l border-line-strong pl-3 text-[13px] text-text-muted">{proposal || "No proposal"}</Markdown>
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

// ---------- the runs ----------

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

// ---------- the stage you pick ----------

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
      <p className="m-0 line-clamp-6 max-w-[72ch] text-[13px] leading-[1.55] whitespace-pre-wrap text-text-muted">{text}</p>
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

// A stage's pass in its own shape (StagePanels.tsx); all: every unit of the ticket, for a build's pass.
function StagePanel({ stage, state, preview, all, onRun, onStep }: { stage: Stage; state: PipelineState; preview: Release | null; all?: Unit[]; onRun: (stage?: Stage, fix?: string[]) => void; onStep: OnStep }) {
  const at = stageAt(state)
  const i = STAGE_KEYS.indexOf(stage)
  const release = releaseShown(state, preview, stage)
  // The column's agent stage at work, or done: its findings, the deploy folded.
  if (nodeOf(state.stage) === stage && state.stage !== stage) return state.status === "running" ? <AtWork state={state} /> : <TestPanel state={state} release={release} />
  if (isRelease(stage) && release) return <ReleasePanel ticketKey={state.key} release={release} after={afterOf(stage, state)} isPreview={release === preview} threads={isJob(state) ? undefined : (state.threads ?? {})} onStep={release === state.release && state.status === "running" ? onStep : undefined} />
  if (i > at) return <p className="m-0 text-[13px] text-faint">Starts after {STAGES[i - 1]}.</p>
  if (i === at && state.status === "running") return <AtWork state={state} />
  if (stage === "refine") return <RefinePanel state={state} />
  if (stage === "plan") return <PlanPanel state={state} />
  if (stage === "build") return <BuildPanel state={state} all={all} />
  if (stage === "review") return <ReviewPanel state={state} onFix={ids => onRun("build", ids)} />
  return null
}

// ---------- now ----------

// What happens or what the ticket waits for, in a line, and the one button
// that moves it on (Retry and Skip when a release failed; the log of an agent at work); the rest, in its menu.
function Now({ state, preview, now, putAside, onRun, onStep, onChanged }: { state: PipelineState; preview: Release | null; now: number; putAside: number; onRun: (stage?: Stage) => void; onStep: OnStep; onChanged: () => void }) {
  const card = useLive(l => l.snapshot?.cards.find(c => c.id === state.sessionId))
  const isRunning = state.status === "running"
  const release = isRelease(state.stage) ? state.release : null
  // Asked only while an agent works: a release or a stage that ended has no steps to follow.
  const activity = useActivity(state.key, isRunning && !release, isJob(state))
  const step = isRunning && !release ? (activity?.steps.findLast(s => s.isOpen) ?? activity?.steps.at(-1)) : undefined
  // Done with its stage, it says what comes next (its tab already says what it did).
  const line = step?.text ?? (state.status === "ready" && !toFix(state).length ? statusText(state) : liveLine(state, card))
  const isFailed = state.status === "failed"
  const isAsking = state.status === "needs-info" || toFix(state).length > 0
  return (
    <div className="flex min-h-8 items-center gap-2.5">
      <PipelineMark state={state} card={card} size={20} />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        {isRunning ? <Shimmer as="span" duration={2.2} className="truncate text-[13.5px] font-semibold [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{line}</Shimmer>
          : <span className={cn("truncate text-[13.5px] font-semibold", isFailed ? "text-bad" : isAsking ? "text-ask" : "text-text")}>{line}</span>}
        <span className="shrink-0 text-xs text-faint tabular-nums">{ago(isRunning ? state.startedAt : (state.endedAt ?? state.startedAt), now)}{isAuto(state) ? " · on its own" : ""}
          {state.news?.comments.length ? <span className="font-semibold text-ask"> · {state.news.comments.length} new in Jira</span> : null}</span>
      </div>
      <NowActions state={state} preview={preview} now={now} onRun={onRun} onStep={onStep} />
      <TicketMenu state={state} putAside={putAside} onChanged={onChanged} />
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
      <StopAgent path="/api/pipeline/stop" body={{ key: state.key }} />
      {state.sessionId && <button className="shrink-0 text-xs font-semibold text-text-muted hover:text-text" onClick={() => openLog(state.sessionId!)}>Log</button>}
    </>
  )
  const isRolledBack = !!release?.rollback && release.steps.every(s => s.status === "done" || s.status === "skipped")
  // Back to an earlier stage, from wherever it waits (not a job's: it has no stages before).
  const back = isJob(state) ? null : <SendBack state={state} now={now} />
  if (state.status === "failed") return (
    <>
      {back}
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
      <AfterTest state={state} preview={preview} onRun={onRun} />
      {next && !(state.stage === "review" && next === "build") ? <StartButton stage={next} from={state.stage} reminders={preview?.env === next ? preview.reminders : undefined} onRun={onRun} /> : null}
    </>
  )
}

// A test (or a check in prod) that found something runs again (after a fix, or with
// new data); what failed in staging goes back to Build: new PRs that fix it, then
// review, staging and the test again.
// Something a fix added that staging does not run yet (a script on the data): it goes there first, then the test.
function AfterTest({ state, preview, onRun }: { state: PipelineState; preview: Release | null; onRun: (stage?: Stage) => void }) {
  if (state.stage !== "test" && state.stage !== "smoke") return null
  const fails = failed(state).length
  const isRetest = (state.results ?? []).some(r => r.status !== "pass")
  const hasPending = state.stage === "test" && preview?.env === "staging" && preview.steps.length > 0
  return (
    <>
      {isRetest && <Button variant="outline" className="h-7 shrink-0 text-xs" onClick={() => onRun(state.stage)}>{state.stage === "test" ? "Test again" : "Check again"}</Button>}
      {state.stage === "test" && fails > 0 && <Button variant={hasPending ? "outline" : "default"} className="h-7 shrink-0 gap-1.5 text-xs" onClick={() => onRun("build")}><Play size={12} className="fill-current" />Fix {fails} with build</Button>}
      {hasPending && <StartButton stage="staging" from={state.stage} reminders={preview.reminders} onRun={onRun} />}
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

// The tab it opens on: a release about to start, else the stage at hand.
const focusOf = (state: PipelineState): Tab => {
  const next = nextStage(state)
  return nodeOf(next && isRelease(next) ? next : state.stage)
}
const span = (runs: Run[], now: number) => (runs.length ? Math.max(...runs.map(r => r.endedAt ?? now)) - Math.min(...runs.map(r => r.startedAt)) : 0)
const hours = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`)

// A stage just started, as the board will have it: at work, from now.
export const startedState = (state: PipelineState, stage?: Stage): PipelineState =>
  ({ ...state, stage: stage ?? state.stage, status: "running", startedAt: Date.now(), endedAt: null, error: null, sessionId: null, questions: [] })

// A stage's document, folded.
function Doc({ text }: { text: string }) {
  const [isOpen, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <FoldButton label="Document" isOpen={isOpen} onToggle={() => setOpen(o => !o)} />
      {isOpen && <Markdown className="text-[13px]">{text}</Markdown>}
    </div>
  )
}

type PassProps = { stage: Stage; doc: string | null; summary: string | null; state: PipelineState; preview: Release | null; onRun: (stage?: Stage, fix?: string[]) => void; onStep: OnStep }
const Passes = (props: { passes: Pass[]; picked: number; onPick: (key: number) => void }) =>
  props.passes.length > 1 ? <div className="-mb-1 flex justify-end"><PassPicker {...props} /></div> : null

// A stage run more than once (a fix, a test again) shows each pass apart: the
// latest at first; an earlier one as it left it (its units, findings or results,
// and its document), only to read: no button acts on a past pass.
// Staging and prod: a pass is a release there and the test that followed it; one waiting at the door is next.
function ReleasePasses({ stage, doc, summary, ...props }: PassProps) {
  const passes = releasePasses(props.state, stage)
  // A release about to start: at the door, or from the test (what a fix added that staging does not run yet).
  const isLive = passes.some(p => p.isLive)
  const hasNext = props.preview?.env === stage && props.preview.steps.length > 0 && (!isLive || props.state.stage === (stage === "staging" ? "test" : "smoke"))
  const next = isLive && hasNext ? { ...props.state, stage, release: props.preview } : null
  const all = [...passes.map(p => ({ key: p.n, at: p.startedAt, past: p.past })), ...(hasNext ? [{ key: -1, at: null, past: next }] : [])]
  const [picked, setPicked] = useState<number | null>(null)
  // At first, the pass at hand (the latest), not one still to come.
  const shown = all.find(t => t.key === picked) ?? (isLive && hasNext ? all.at(-2) : all.at(-1))
  return (
    <div className="flex flex-col gap-3">
      {shown && <Passes passes={all} picked={shown.key} onPick={setPicked} />}
      {!shown?.past && summary && <Summary text={summary} />}
      {shown?.past ? <StagePanel stage={stage} {...props} state={shown.past} onRun={() => {}} /> : <StagePanel stage={stage} {...props} />}
      {!shown?.past && doc && <Doc text={doc} />}
    </div>
  )
}

// A pass there is something to see of: what it left, its document, or why it failed (the latest, always).
const isShown = (r: Run, i: number, all: Run[], docs: number[]) => !!r.kept || docs.includes(r.n) || r.status === "failed" || i === all.length - 1
function StagePasses({ docs, ...props }: PassProps & { docs: number[] }) {
  const { stage, doc, summary } = props
  if (isRelease(stage)) return <ReleasePasses {...props} />
  const passes = passesOf(props.state.history ?? [], stage).filter((r, i, all) => isShown(r, i, all, docs))
  const [picked, setPicked] = useState<number | null>(null)
  const latest = passes.at(-1)
  const run = passes.find(r => r.n === picked)
  const isPast = !!run && run !== latest
  return (
    <div className="flex flex-col gap-3">
      {latest && <Passes passes={passes.map(r => ({ key: r.n, at: r.startedAt, isFailed: r.status === "failed", why: r.status === "failed" ? r.error : r.cause }))}
        picked={isPast ? run.n : latest.n} onPick={n => setPicked(n === latest.n ? null : n)} />}
      {isPast ? <PastPass run={run} {...props} /> : <>{summary && <Summary text={summary} />}<StagePanel {...props} all={props.state.units} state={latestPass(props.state, passes)} />{doc && <Doc text={doc} />}</>}
    </div>
  )
}

// With more than one pass, the latest also shows only what it left (its buttons stay).
const latestPass = (state: PipelineState, passes: Run[]): PipelineState => {
  const last = passes.at(-1)
  return passes.length > 1 && last?.kept ? { ...state, ...last.kept } : state
}

// A pass that failed: why, and its log.
function Failed({ run }: { run: Run }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <AlertTriangle size={13} className="shrink-0 translate-y-[2px] text-bad" />
      <span className="min-w-0 flex-1 text-text-muted">{run.error ?? "Failed"}</span>
      {run.sessionId && <button className="shrink-0 text-xs font-semibold text-text-muted hover:text-text" onClick={() => openLog(run.sessionId!)}>Log</button>}
    </div>
  )
}

function PastPass({ stage, run, state, preview, onStep }: PassProps & { run: Run }) {
  const [doc, setDoc] = useState<string | null>(null)
  useEffect(() => void get<{ doc: string | null }>(`/api/pipeline/run-doc?key=${encodeURIComponent(state.key)}&n=${run.n}`).then(r => setDoc(r.doc), () => {}), [state.key, run.n])
  // As that pass left it; "failed" keeps every button of the panels away. One that left nothing shows no panel (it would show today's).
  const past: PipelineState = { ...state, ...run.kept, stage: run.stage, status: "failed", threads: {} }
  return (
    <div className="flex flex-col gap-3">
      {run.status === "failed" && <Failed run={run} />}
      {run.kept?.asked?.length ? <AskedList asked={run.kept.asked} /> : null}
      {run.kept && !(run.kept.asked && Object.keys(run.kept).length === 1) && <StagePanel stage={stage} state={past} preview={preview} all={state.units} onRun={() => {}} onStep={onStep} />}
      {doc && <Doc text={doc} />}
    </div>
  )
}

// ---------- the section ----------

// A stage's document: the test's in Staging, the check's in Prod.
const DOC: Record<Stage, "refine" | "plan" | "build" | "review" | "test" | "smoke"> = { refine: "refine", plan: "plan", build: "build", review: "review", staging: "test", test: "test", prod: "smoke", smoke: "smoke" }

// A stage's tab: the decisions it waits for; else what the board checked of its last run, the tickets it proposed, and its passes.
function StageBody({ stage, data, onRun, onStep, onSent }: { stage: Stage; data: Data & { state: PipelineState }; onRun: (stage?: Stage, fix?: string[]) => void; onStep: OnStep; onSent: () => void }) {
  const { state } = data
  const isHere = nodeOf(state.stage) === stage
  if (isHere && state.status === "needs-info") return <Decisions key={state.askedAt} ticketKey={state.key} state={state} onSent={onSent} />
  return (
    <div className="flex flex-col gap-4">
      {isHere && state.checks?.length && state.status !== "running" ? <Checks checks={state.checks} /> : null}
      <Proposed state={state} stage={stage} />
      <StagePasses key={stage} stage={stage} docs={data.docs ?? []} doc={data[DOC[stage]]} summary={data.summaries?.[DOC[stage]] ?? null} state={state} preview={data.preview} onRun={onRun} onStep={onStep} />
    </div>
  )
}

// Every run of the ticket: what they cost, and how long it has been in the pipeline.
function RunsSection({ runs, now }: { runs: Run[]; now: number }) {
  return (
    <Section title="Runs" extra={`${runs.length} · ≈${dollars(costOf(runs))} · ${hours(span(runs, now))}`}>
      <Runs history={runs} now={now} />
    </Section>
  )
}

// A ticket and the pipeline: what it waits for and its one action, above every tab;
// a tab each stage, and one the ticket itself (details: what Jira says of it).
// Not in the pipeline yet: the buttons that start it, and the ticket.
export function Pipeline({ ticket, details, onTaken }: { ticket: Ticket; details: ReactNode; onTaken: () => void }) {
  const now = useNow()
  const [data, setData] = useState<Data | null>(null)
  const [debt, setDebt] = useState<DebtEntry[]>([])
  const [doc, setDoc] = useState<string | null>(null)
  const [picked, setPicked] = useState<Tab | null>(null)
  useEffect(() => void get<{ debt: DebtEntry[] }>("/api/pipeline/debt").then(r => setDebt(r.debt), () => {}), [ticket.key])
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
  if (!state) return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <RunButton ticket={ticket} onStarted={() => (loadSoon(), ticket.isMine || onTaken())} />
        <RunButton ticket={ticket} auto onStarted={() => (loadSoon(), ticket.isMine || onTaken())} />
      </div>
      {details}
    </div>
  )
  const step: OnStep = async (id, action, value) => (await act("/api/pipeline/step", { key: ticket.key, step: id, action, value }, action === "skip" ? "Skipped" : "On it")) && loadSoon()
  // At work at once on screen (the board confirms it a moment later), and back as it was if it refuses.
  const start = async (stage?: Stage, fix?: string[]) => {
    const before = data
    setData({ ...data, state: startedState(state, stage) })
    setPicked(null)
    if (await act("/api/pipeline/start", { key: ticket.key, stage, fix }, stage ? startingText(stage, state.stage) : "A session starts")) loadSoon()
    else setData(before)
  }
  const runs = state.history ?? []
  const shown = picked ?? focusOf(state)
  return (
    <TicketDocsOf.Provider value={{ key: ticket.key, names: data.files ?? [], open: setDoc }}>
    <StageDataContext.Provider value={{ prs: data.prs ?? {}, fixes: data.fixes ?? {}, onResolve: url => void act("/api/pipeline/conflicts", { key: ticket.key, url }, "An agent resolves the conflicts").then(ok => ok && loadSoon()),
      onReady: url => void act("/api/pipeline/ready", { key: ticket.key, url }, "Ready for review").then(ok => ok && loadSoon()), scenario: data.scenario ?? null, comments: ticket.comments, debt }}>
    <div className="flex flex-col gap-3">
      <Now state={state} preview={data.preview} now={now} putAside={data.putAside} onRun={stage => void start(stage)} onStep={step} onChanged={() => void load()} />
      <StageTabs tones={tonesOf(state)} picked={shown} onPick={setPicked} />
      {shown === "ticket"
        ? <div className="flex flex-col gap-5 pt-1">{details}{runs.length > 0 && <RunsSection runs={runs} now={now} />}</div>
        : <div className="pt-1"><StageBody stage={shown} data={{ ...data, state }} onRun={(stage, fix) => void start(stage, fix)} onStep={step} onSent={() => void load()} /></div>}
    </div>
    {doc && <DocViewer ticketKey={ticket.key} name={doc} onClose={() => setDoc(null)} />}
    </StageDataContext.Provider>
    </TicketDocsOf.Provider>
  )
}
