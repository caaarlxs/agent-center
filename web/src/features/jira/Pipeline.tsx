// The pipeline on a ticket (lib/pipeline.ts): the stages on a rail, and below
// it only what this moment asks for. While a stage runs, what its agent does
// now. When it needs you, its decisions: each a question and the agent's
// proposal, kept as it is unless you change it; the answers go to Jira and
// start the stage again. Refined, the next step (plan); planned, its units of
// work in order. When it fails, why, and running it again. The runs and each
// stage's document wait folded at the foot. Start over clears the run and
// the labels; the comments stay. On someone else's ticket it runs only once
// you take it (two clicks: it is assigned to you).
import { ChevronRight, Play, RotateCcw } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Kbd } from "@/components/ui/kbd"
import { get, post } from "@/lib/api"
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
import type { PipelineState, Run, Stage, Unit } from "@server/pipeline"
import { PipelineMark, Rail, liveLine } from "./PipelineMark"

type Data = { state: PipelineState | null; refine: string | null; plan: string | null }
type Fold = "refine" | "plan" | "runs"
const FOLLOW_MS = 5_000
const IDLE_MS = 30_000
const CONFIRM_MS = 4_000

export async function act(path: string, body: object, done: string) {
  try {
    await post(path, body)
    toast(done)
    return true
  } catch (err) {
    toast((err as Error).message || "It did not work")
    return false
  }
}

// A click that asks once more (it turns red) before it does what it says.
function useConfirm(): [boolean, (then: () => void) => void] {
  const [isAsking, setAsking] = useState(false)
  useEffect(() => {
    if (!isAsking) return
    const timer = setTimeout(() => setAsking(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [isAsking])
  return [isAsking, then => (isAsking ? (setAsking(false), then()) : setAsking(true))]
}

const openLog = (id: string) => (dialog.set(null), openSession(id))

// ---------- the decisions ----------

function Decision({ n, question, proposal, text, onChange }: { n: number; question: string; proposal: string; text: string | undefined; onChange: (text: string | undefined) => void }) {
  const isChanging = text !== undefined
  return (
    <li className="flex flex-col gap-2.5 border-t border-line py-4 first:border-t-0 first:pt-1">
      <p className="m-0 flex gap-2.5 text-[13.5px] leading-[1.5] text-text">
        <span className="w-4 shrink-0 text-right font-mono text-xs leading-[1.7] text-faint">{n}</span>{question}
      </p>
      <div className="ml-[26px] flex flex-col gap-1.5">
        {isChanging ? (
          <textarea autoFocus value={text} onChange={e => onChange(e.target.value)} rows={2}
            className="max-h-[280px] min-h-[60px] resize-none rounded-[8px] border border-brand bg-surface px-3 py-2 text-[13px] leading-[1.55] outline-none [field-sizing:content] focus:shadow-[0_0_0_3px_var(--brand-soft)]" />
        ) : (
          <p className="m-0 border-l-2 border-line-strong pl-3 text-[13px] leading-[1.55] text-text-muted">{proposal || "No proposal"}</p>
        )}
        <button className="self-start text-xs font-semibold text-faint transition-colors duration-120 hover:text-text"
          onClick={() => onChange(isChanging ? undefined : proposal)}>
          {isChanging ? "Keep the proposal" : "Change"}
        </button>
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
    if (await act("/api/pipeline/answer", { key: ticketKey, answers: changed }, "Answers sent to Jira: refining again")) onSent()
    setBusy(false)
  }
  const change = (id: string, text: string | undefined) =>
    setChanged(c => (text === undefined ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== id)) : { ...c, [id]: text }))
  return (
    <div className="flex flex-col" onKeyDown={e => e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.preventDefault(), void send())}>
      <h3 className="m-0 mb-2 text-[15px] font-semibold tracking-[-0.01em]">{count} decision{count === 1 ? "" : "s"} for you</h3>
      <ol className="m-0 list-none p-0">
        {state.questions.map((q, i) => <Decision key={q.id} n={i + 1} question={q.question} proposal={q.proposal} text={changed[q.id]} onChange={t => change(q.id, t)} />)}
      </ol>
      <div className="mt-2 flex items-center justify-end gap-2.5">
        <Kbd>⌘↵</Kbd>
        <Button className="h-8 text-xs" disabled={isBusy} onClick={() => void send()}>Send to Jira and continue</Button>
      </div>
    </div>
  )
}

// ---------- the moment ----------

// While a stage runs: what its agent does now, for how long, and its log.
function Working({ state, now }: { state: PipelineState; now: number }) {
  const card = useLive(l => l.snapshot?.cards.find(c => c.id === state.sessionId))
  return (
    <div className="flex items-center gap-2.5">
      <PipelineMark state={state} card={card} size={22} />
      <Shimmer as="span" duration={2.2} className="min-w-0 truncate text-[13.5px] [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{liveLine(state, card)}</Shimmer>
      <span className="ml-auto shrink-0 text-xs text-faint tabular-nums">{ago(state.startedAt, now)}</span>
      {state.sessionId && <button className="shrink-0 text-xs font-semibold text-text-muted hover:text-text" onClick={() => openLog(state.sessionId!)}>Log</button>}
    </div>
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
          <span className="font-mono text-[11px] text-faint">{u.subtask ?? ""}</span>
          <span />
          <span className="min-w-0 truncate font-mono text-[11px] text-faint">{u.branch}{u.dependsOn.length > 0 && <span className="font-sans"> · after {u.dependsOn.map(d => units.findIndex(x => x.id === d) + 1 || d).join(", ")}</span>}</span>
        </li>
      ))}
    </ol>
  )
}

// A stage that ended: what it left, and the next step (or running it again).
function Outcome({ state, onRun }: { state: PipelineState; onRun: (stage?: Stage) => void }) {
  const isFailed = state.status === "failed"
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5">
        <PipelineMark state={state} size={22} />
        <span className={cn("min-w-0 flex-1 text-[13.5px]", isFailed ? "text-bad" : "font-semibold text-work")}>{liveLine(state, undefined)}</span>
        {isFailed && <Button variant="outline" className="h-7 shrink-0 text-xs" onClick={() => onRun()}>Run again</Button>}
        {!isFailed && state.stage === "refine" && <Button className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => onRun("plan")}><Play size={13} className="fill-current" />Run plan</Button>}
      </div>
      {!isFailed && state.stage === "plan" && state.units?.length ? <Units units={state.units} /> : null}
    </div>
  )
}

// Run, on yours; on someone else's, take it first (a second click confirms).
function RunButton({ ticket, onStarted }: { ticket: Ticket; onStarted: () => void }) {
  const [isAsking, confirm] = useConfirm()
  const run = async () => {
    const done = ticket.isMine ? "Refining: a session starts" : `${ticket.key} is yours: refining`
    if (await act("/api/pipeline/start", { key: ticket.key, take: !ticket.isMine }, done)) onStarted()
  }
  const label = ticket.isMine ? "Run pipeline" : !isAsking ? "Assign to me and run" : ticket.assignee ? `Sure? Take it from ${ticket.assignee}` : "Sure? Assign it to me"
  return (
    <Button variant={isAsking ? "destructive" : "default"} className="h-8 self-start gap-1.5 text-xs" onClick={() => (ticket.isMine ? void run() : confirm(() => void run()))}>
      <Play size={13} className="fill-current" />{label}
    </Button>
  )
}

// ---------- the foot ----------

const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`
const DONE: Record<Stage, (r: Run) => string> = { refine: () => "Refined", plan: r => `Planned in ${r.units} unit${r.units === 1 ? "" : "s"}` }
const sayRun = (r: Run, doing: string | null) =>
  r.status === "running" ? (doing ?? "Starting") : r.status === "needs-info" ? `Asked ${r.questions} question${r.questions === 1 ? "" : "s"}` : r.status === "failed" ? (r.error ?? "Failed") : DONE[r.stage ?? "refine"](r)

// Every run, the latest first: what it ended in (or does now), how long, its log.
function Runs({ history, now }: { history: Run[]; now: number }) {
  const cards = useLive(l => l.snapshot?.cards)
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
      {[...history].reverse().map(r => {
        const card = r.status === "running" ? cards?.find(c => c.id === r.sessionId) : undefined
        return (
          <li key={r.n} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_2rem] items-baseline gap-2">
            <span className="font-mono text-faint">#{r.n}</span>
            <span className={cn("truncate", r.status === "failed" ? "text-bad" : "text-text-muted")}>{sayRun(r, doingText(card?.doing))}</span>
            <span className="text-faint tabular-nums">{minutes((r.endedAt ?? now) - r.startedAt)} · {ago(r.endedAt ?? r.startedAt, now)}</span>
            {r.sessionId ? <button className="text-right font-semibold text-text-muted hover:text-text" onClick={() => openLog(r.sessionId!)}>Log</button> : <span />}
          </li>
        )
      })}
    </ol>
  )
}

function FoldButton({ label, isOpen, onToggle }: { label: ReactNode; isOpen: boolean; onToggle: () => void }) {
  return (
    <button className={cn("inline-flex items-center gap-1 text-xs font-semibold transition-colors duration-120", isOpen ? "text-text" : "text-text-muted hover:text-text")} onClick={onToggle} aria-expanded={isOpen}>
      <ChevronRight size={13} className={cn("transition-transform duration-150 ease-(--ease-out)", isOpen && "rotate-90")} />{label}
    </button>
  )
}

// ---------- the section ----------

export function Pipeline({ ticket, onTaken }: { ticket: Ticket; onTaken: () => void }) {
  const now = useNow()
  const [data, setData] = useState<Data | null>(null)
  const [fold, setFold] = useState<Fold | null>(null)
  const [isResetting, confirmReset] = useConfirm()
  const load = () => get<Data>(`/api/pipeline?key=${encodeURIComponent(ticket.key)}`).then(setData, () => {})
  const isRunning = data?.state?.status === "running"
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), isRunning ? FOLLOW_MS : IDLE_MS)
    return () => clearInterval(timer)
  }, [ticket.key, isRunning])
  if (!data) return null
  const state = data.state
  const loadSoon = () => setTimeout(() => void load(), 800)
  const start = async (stage?: Stage) => (await act("/api/pipeline/start", { key: ticket.key, stage }, stage === "plan" ? "Planning: a session starts" : "A session starts")) && loadSoon()
  const reset = () => confirmReset(async () => (await act("/api/pipeline/reset", { key: ticket.key }, "Started over: the comments stay in Jira")) && void load())
  const runs = state?.history ?? []
  const toggle = (f: Fold) => setFold(open => (open === f ? null : f))
  const docs = ([["refine", "Refinement", data.refine], ["plan", "Plan", data.plan]] as const).filter(([, , text]) => text)
  return (
    <section className="overflow-hidden rounded-[12px] border border-line bg-side">
      <header className="flex items-start gap-4 px-4 pt-3.5 pb-3">
        <Rail state={state} hasLabels className="flex-1" />
        {state && !isRunning && (
          <button className={cn("-mt-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold transition-colors duration-120",
            isResetting ? "bg-bad-soft text-bad" : "text-faint hover:bg-hover hover:text-text")} onClick={reset} title="Start over: clears the runs and the labels">
            <RotateCcw size={12} />{isResetting && "Start over?"}
          </button>
        )}
      </header>
      <div className="px-4 pb-4">
        {!state && <RunButton ticket={ticket} onStarted={() => (loadSoon(), ticket.isMine || onTaken())} />}
        {state?.status === "running" && <Working state={state} now={now} />}
        {state?.status === "needs-info" && <Decisions key={state.askedAt} ticketKey={ticket.key} state={state} onSent={() => void load()} />}
        {(state?.status === "ready" || state?.status === "failed") && <Outcome state={state} onRun={stage => void start(stage)} />}
      </div>
      {(docs.length > 0 || runs.length > 0) && (
        <footer className="border-t border-line px-4 py-2.5">
          <div className="flex gap-5">
            {docs.map(([key, label]) => <FoldButton key={key} label={label} isOpen={fold === key} onToggle={() => toggle(key)} />)}
            {runs.length > 0 && <FoldButton label={<>Runs<span className="font-medium text-faint">{runs.length}</span></>} isOpen={fold === "runs"} onToggle={() => toggle("runs")} />}
          </div>
          {docs.map(([key, , text]) => fold === key && <Markdown key={key} className="mt-3 text-[13px]">{text!}</Markdown>)}
          {fold === "runs" && <div className="mt-3"><Runs history={runs} now={now} /></div>}
        </footer>
      )}
    </section>
  )
}
