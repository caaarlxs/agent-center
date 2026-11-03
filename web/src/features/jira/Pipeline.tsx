// The pipeline on a ticket (lib/pipeline.ts): the stages, from refining to
// staging, and where this one stands. Refining runs as a session of its own;
// when it needs a person, its questions show here, each with the agent's
// proposal, and the answers go to Jira and start the stage again. Each run
// keeps a line (what it ended in, its log a click away). Start over
// clears the run and the labels; the comments stay. On a ticket of someone
// else's it runs only once you take it (two clicks: it is assigned to you).
import { ChevronDown, Play, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import type { PipelineState, Run } from "@server/pipeline"

type Data = { state: PipelineState | null; refine: string | null }
export const STAGES = ["Refine", "Plan", "Build", "Review", "Staging"]
const FOLLOW_MS = 5_000
const IDLE_MS = 30_000

export const STATUS: Record<PipelineState["status"], { text: string; tone: string }> = {
  running: { text: "Refining", tone: "text-work" },
  "needs-info": { text: "Waiting for answers", tone: "text-ask" },
  ready: { text: "Ready to plan", tone: "text-work" },
  failed: { text: "Failed", tone: "text-bad" },
}

async function act(path: string, body: object, done: string) {
  try {
    await post(path, body)
    toast(done)
    return true
  } catch (err) {
    toast((err as Error).message || "It did not work")
    return false
  }
}

export function Stages({ state }: { state: PipelineState | null }) {
  return (
    <ol className="m-0 flex list-none items-center gap-1 p-0 text-[11.5px] font-semibold">
      {STAGES.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-3 bg-line" />}
          <span className={cn("rounded-full px-2 py-0.5", i === 0 && state ? "bg-brand text-brand-text" : "bg-hover text-faint")}>{s}</span>
        </li>
      ))}
    </ol>
  )
}

function Questions({ ticketKey, state, onSent }: { ticketKey: string; state: PipelineState; onSent: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(state.questions.map(q => [q.id, q.proposal])))
  const [isBusy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    if (await act("/api/pipeline/answer", { key: ticketKey, answers }, "Answers sent to Jira: refining again")) onSent()
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-3">
      {state.questions.map(q => (
        <label key={q.id} className="flex flex-col gap-1.5">
          <span className="text-[13px]"><b className="mr-1 font-mono text-xs text-text-muted">{q.id}</b>{q.question}</span>
          <textarea value={answers[q.id] ?? ""} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} rows={2}
            className="max-h-[280px] min-h-[44px] resize-none rounded-[8px] border border-line bg-surface px-2.5 py-2 text-[13px] leading-[1.5] outline-none [field-sizing:content] focus:border-brand" />
        </label>
      ))}
      <Button className="h-8 self-end text-xs" disabled={isBusy} onClick={() => void send()}>Send to Jira and continue</Button>
    </div>
  )
}

const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`
const sayRun = (r: Run, doing: string | null) =>
  r.status === "running" ? (doing ?? "Starting") : r.status === "needs-info" ? `Asked ${r.questions} question${r.questions === 1 ? "" : "s"}` : r.status === "failed" ? (r.error ?? "Failed") : "Refined: ready to plan"

// Every run, the latest first: what it ended in (or does now), how long, its log.
function Runs({ history, now }: { history: Run[]; now: number }) {
  const cards = useLive(l => l.snapshot?.cards)
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
      {[...history].reverse().map(r => {
        const card = r.status === "running" ? cards?.find(c => c.id === r.sessionId) : undefined
        return (
          <li key={r.n} className="flex items-baseline gap-2">
            <span className="w-6 shrink-0 font-mono text-faint">#{r.n}</span>
            <span className={cn("min-w-0 flex-1 truncate", r.status === "failed" ? "text-bad" : "text-text-muted")}>
              {r.status === "running" && <i className="run-dot mr-1.5 inline-block size-1.5 rounded-full bg-work align-middle" />}{sayRun(r, doingText(card?.doing))}
            </span>
            <span className="shrink-0 text-faint tabular-nums">{minutes((r.endedAt ?? now) - r.startedAt)} · {ago(r.endedAt ?? r.startedAt, now)} ago</span>
            {r.sessionId && (
              <button className="shrink-0 font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => (dialog.set(null), openSession(r.sessionId))}>Log</button>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// Run, on yours; on someone else's, take it first (a second click confirms).
function RunButton({ ticket, onStarted }: { ticket: Ticket; onStarted: () => void }) {
  const [isTaking, setTaking] = useState(false)
  const run = async () => {
    if (!ticket.isMine && !isTaking) return void (setTaking(true), setTimeout(() => setTaking(false), 4000))
    setTaking(false)
    const done = ticket.isMine ? "Refining: a session starts" : `${ticket.key} is yours: refining`
    if (await act("/api/pipeline/start", { key: ticket.key, take: !ticket.isMine }, done)) onStarted()
  }
  const label = ticket.isMine ? "Run pipeline" : !isTaking ? "Assign to me and run" : ticket.assignee ? `Sure? Take it from ${ticket.assignee}` : "Sure? Assign it to me"
  return (
    <Button variant={isTaking ? "destructive" : "default"} className="h-8 self-start gap-1.5 text-xs" onClick={() => void run()}>
      <Play size={13} className="fill-current" />{label}
    </Button>
  )
}

export function Pipeline({ ticket, onTaken }: { ticket: Ticket; onTaken: () => void }) {
  const now = useNow()
  const [data, setData] = useState<Data | null>(null)
  const [isOpen, setOpen] = useState(false) // the refinement, whole
  const [isConfirming, setConfirming] = useState(false)
  const load = () => get<Data>(`/api/pipeline?key=${encodeURIComponent(ticket.key)}`).then(setData, () => {})
  const isRunning = data?.state?.status === "running"
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), isRunning ? FOLLOW_MS : IDLE_MS)
    return () => clearInterval(timer)
  }, [ticket.key, isRunning])
  if (!data) return null
  const state = data.state
  const start = async () => (await act("/api/pipeline/start", { key: ticket.key }, "Refining: a session starts")) && setTimeout(() => void load(), 800)
  const reset = async () => {
    if (!isConfirming) return void (setConfirming(true), setTimeout(() => setConfirming(false), 4000))
    setConfirming(false)
    if (await act("/api/pipeline/reset", { key: ticket.key }, "Started over: the comments stay in Jira")) void load()
  }
  const status = state && STATUS[state.status]
  return (
    <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-side p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stages state={state} />
        {state && state.status !== "running" && (
          <button className={cn("inline-flex items-center gap-1 text-xs font-semibold", isConfirming ? "text-bad" : "text-text-muted hover:text-text")} onClick={() => void reset()}>
            <RotateCcw size={12} />{isConfirming ? "Sure? Start over" : "Start over"}
          </button>
        )}
      </div>
      {!state && <RunButton ticket={ticket} onStarted={() => setTimeout(() => (void load(), ticket.isMine || onTaken()), 800)} />}
      {state && status && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
          <b className={cn("font-semibold", status.tone)}>{status.text}</b>
          {state.status === "failed" && <Button variant="outline" className="ml-auto h-7 text-xs" onClick={() => void start()}>Run again</Button>}
        </div>
      )}
      {state?.status === "needs-info" && <Questions key={state.askedAt} ticketKey={ticket.key} state={state} onSent={() => void load()} />}
      {state?.history?.length ? <Runs history={state.history} now={now} /> : null}
      {data.refine && (
        <div className="flex flex-col gap-2">
          <button className="inline-flex items-center gap-1 self-start text-xs font-semibold text-text-muted hover:text-text" onClick={() => setOpen(v => !v)} aria-expanded={isOpen}>
            <ChevronDown size={13} className={cn("transition-transform", !isOpen && "-rotate-90")} />Refinement
          </button>
          {isOpen && <Markdown className="text-[13px]">{data.refine}</Markdown>}
        </div>
      )}
    </section>
  )
}
