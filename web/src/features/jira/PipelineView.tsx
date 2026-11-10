// Every ticket agents work on (lib/pipeline.ts), on a board of the stages,
// left to right. A ticket sits in the column of its stage; once that stage is
// done, it waits at the next one's door (a dashed card). A stage at work has a
// line flowing in its head (amber when it waits for you), a ticket at work a
// beam round its edge; the stages there is no agent for yet stay dim. A click
// opens the ticket: what to do next and the detail live there.
//
// Under it, the jobs (lib/jobs.ts): the same columns, each one its stage's
// specialist, with what you handed it on its own. Each half scrolls by
// itself, and the line between them moves; the columns always line up.
import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { dialog } from "@/app/open-dialog"
import { ago } from "@/features/session/state"
import type { Job } from "@server/jobs"
import type { AgentStage, PipelineState, Stage } from "@server/pipeline"
import { isJob, useActivity } from "./Pipeline"
import { markRead } from "./pipeline-seen"
import { SPECIALISTS, SPLIT, clampSplit, jobColumn, jobLabel } from "./jobs-board"
import { JobComposer } from "./JobComposer"
import { StageEffect } from "./StageEffect"
import { DebtButton } from "./Debt"
import { effectOf, sceneOf } from "./stage-effects"
import { PipelineMark, liveLine } from "./PipelineMark"
import { BUILT, STAGES, STAGE_KEYS, columnOf, costOf, dollars, isQueued, toFix, waitingStep } from "./pipeline-board"
import { StageHelp } from "./StageHelp"

// A ticket opens the ticket; a job, the job.
// Opened: what it did counts as read (the sidebar's count, pipeline-seen.ts).
const open = (state: PipelineState) => (markRead(state.key), dialog.set(isJob(state) ? { kind: "job", id: state.key } : { kind: "ticket", key: state.key }))
const onOpenKey = (state: PipelineState) => (e: KeyboardEvent) => e.key === "Enter" && e.target === e.currentTarget && open(state)
const shimmer = "[--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]"

// A ticket at a glance, the same size in every column: what it is, the one
// line that matters now (what its agent does, what it waits for, what broke,
// what it came to), and its key, cost and time; its stage's effect on the right.
export function TicketCard({ state, card, now }: { state: PipelineState; card: Card | undefined; now: number }) {
  const isRunning = state.status === "running"
  const isAsking = state.status === "needs-info" || toFix(state).length > 0 || !!waitingStep(state)
  const isLoose = isJob(state)
  const activity = useActivity(state.key, isRunning && !state.release, isLoose)
  const effect = effectOf(state)
  const step = isRunning && !state.release ? (activity?.steps.findLast(s => s.isOpen) ?? activity?.steps.at(-1)) : undefined
  const line = step?.text ?? liveLine(state, card)
  const time = ago(isRunning ? state.startedAt : (state.endedAt ?? state.startedAt), now)
  return (
    <article tabIndex={0} data-card={state.key} data-col={isLoose ? undefined : columnOf(state)} onClick={() => open(state)} onKeyDown={onOpenKey(state)} data-edge={isAsking ? "waiting" : undefined}
      className={cn("group/card relative h-[108px] flex-none cursor-pointer rounded-[10px] border px-3 py-3 transition-[border-color,box-shadow] duration-100 hover:shadow-card",
        isRunning && "beam",
        isAsking ? "border-[color-mix(in_srgb,var(--ask)_50%,var(--line))] bg-surface shadow-[0_0_0_3px_var(--ask-soft),0_0_24px_var(--ask-soft)]"
          : isQueued(state) && !isLoose ? "border-dashed border-line-strong bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] hover:border-text-muted"
          : "border-line bg-surface hover:border-line-strong")}>
      <StageEffect stage={state.stage} effect={effect} scene={sceneOf(state, activity)} />
      <div className="relative flex h-full flex-col pr-[38%]">
        <header className="flex min-w-0 items-start gap-2.5">
          <PipelineMark state={state} card={card} size={32} />
          <h3 className="m-0 line-clamp-2 text-sm leading-[1.35] font-[550] [overflow-wrap:anywhere]">{state.summary ?? card?.tickets.find(t => t.key === state.key)?.summary ?? state.key}</h3>
        </header>
        <div className="mt-auto flex min-w-0 flex-col gap-[3px]">
          {isRunning ? <Shimmer as="p" duration={2.2} className={cn("m-0 truncate text-[12.5px]", shimmer)}>{line}</Shimmer>
            : <p className={cn("m-0 truncate text-[12.5px]", isAsking ? "font-semibold text-ask" : state.status === "failed" ? "text-bad" : "text-text-muted")} title={line}>{line}</p>}
          <span className="dot-time truncate text-[11px] text-faint tabular-nums" title="Its key, the API-equivalent cost of every run, and how long it has been like this">
            <span className="font-mono">{isLoose ? jobLabel(state as Job) : state.key}</span>{state.history?.length ? ` · ≈${dollars(costOf(state.history))}` : ""} · {time}
            {state.news?.comments.length ? <span className="font-semibold text-ask"> · {state.news.comments.length} new</span> : null}
          </span>
        </div>
      </div>
    </article>
  )
}

// A stage's head: its line (flowing while an agent works in it, amber while
// it waits for you), its number and name, and how many tickets it holds.
function StageHead({ n, name, stage, tickets }: { n: number; name: string; stage: Stage; tickets: PipelineState[] }) {
  const isWorking = tickets.some(t => t.status === "running")
  const isAsking = tickets.some(t => t.status === "needs-info" || toFix(t).length > 0 || !!waitingStep(t))
  return (
    <header className="mx-1.5 mb-3 flex flex-col gap-2.5">
      <i className={cn("block h-[2px] rounded-full", isWorking ? "flow" : isAsking ? "bg-ask" : "bg-line-strong")} />
      <h2 className="m-0 flex items-center gap-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase">
        <span className="dot-time font-mono text-faint">{String(n).padStart(2, "0")}</span>{name}
        <StageHelp stage={stage} name={name} />
        <span className="ml-auto font-medium text-faint">{tickets.length || ""}</span>
      </h2>
    </header>
  )
}

// A card that moves to another column glides there from where it was.
const GLIDE = { duration: 450, easing: "cubic-bezier(0.77, 0, 0.175, 1)" }
function useGlide(deps: unknown) {
  const board = useRef<HTMLDivElement>(null)
  const was = useRef(new Map<string, { col: string; box: DOMRect }>())
  useLayoutEffect(() => {
    const isStill = matchMedia("(prefers-reduced-motion: reduce)").matches
    const now = new Map<string, { col: string; box: DOMRect }>()
    for (const el of board.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []) {
      const at = { col: el.dataset.col!, box: el.getBoundingClientRect() }
      const before = was.current.get(el.dataset.card!)
      if (before && before.col !== at.col && !isStill)
        el.animate([{ transform: `translate(${before.box.left - at.box.left}px, ${before.box.top - at.box.top}px)` }, { transform: "none" }], GLIDE)
      now.set(el.dataset.card!, at)
    }
    was.current = now
  }, [deps])
  return board
}

// The share of the board the pipeline takes (the jobs, the rest), as you left it.
const SPLIT_KEY = "pipeline-split"
const savedSplit = () => {
  try {
    return clampSplit(Number(localStorage.getItem(SPLIT_KEY) ?? SPLIT))
  } catch {
    return SPLIT
  }
}
function useSplit() {
  const [split, setSplit] = useState(savedSplit)
  const keep = (v: number) => {
    const next = clampSplit(v)
    setSplit(next)
    try {
      localStorage.setItem(SPLIT_KEY, String(next))
    } catch {}
  }
  return [split, keep] as const
}

// The line between the halves: drag it, or move it with the arrows; a double click puts it back.
function Divider({ split, onSplit, box }: { split: number; onSplit: (v: number) => void; box: RefObject<HTMLDivElement | null> }) {
  const at = (e: PointerEvent | ReactPointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return (e.clientY - r.top) / r.height
  }
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (m: PointerEvent) => onSplit(at(m))
    const end = () => (window.removeEventListener("pointermove", move), window.removeEventListener("pointerup", end))
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
  }
  const key = (e: KeyboardEvent) => (e.key === "ArrowUp" ? onSplit(split - 0.05) : e.key === "ArrowDown" ? onSplit(split + 0.05) : null)
  return (
    <div role="separator" aria-orientation="horizontal" aria-label="Pipeline and jobs" aria-valuenow={Math.round(split * 100)} tabIndex={0}
      onPointerDown={start} onDoubleClick={() => onSplit(SPLIT)} onKeyDown={key}
      className="group/split flex h-3 flex-none cursor-row-resize items-center px-6 outline-none">
      <i className="block h-px w-full bg-line transition-colors duration-100 group-hover/split:bg-line-strong group-focus-visible/split:bg-brand" />
    </div>
  )
}

const COLUMNS = "grid auto-cols-[minmax(290px,1fr)] grid-flow-col gap-3 px-5"
const COLUMN = "dots-veil flex min-h-0 flex-col rounded-[12px] bg-side px-2 pt-3 pb-2"

// A specialist's head: its line (flowing while it works), its name, how many
// jobs it holds, and the + that hands it one (the ones that take jobs).
function SpecialistHead({ name, jobs, canTake, onAdd }: { name: string; jobs: Job[]; canTake: boolean; onAdd: () => void }) {
  const isWorking = jobs.some(j => j.status === "running")
  return (
    <header className="mx-1.5 mb-3 flex flex-col gap-2.5">
      <i className={cn("block h-[2px] rounded-full", isWorking ? "flow" : "bg-line")} />
      <h2 className="m-0 flex h-5 items-center gap-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase">
        {name}
        <span className="ml-auto font-medium text-faint">{jobs.length || ""}</span>
        {canTake && (
          <button onClick={onAdd} aria-label={`A job for the ${name.toLowerCase()}`} title={`A job for the ${name.toLowerCase()}`}
            className="-mr-1 inline-flex size-5 items-center justify-center rounded-md text-faint transition-[background-color,color,transform] duration-100 hover:bg-hover hover:text-text active:scale-[0.94]">
            <Plus size={14} />
          </button>
        )}
      </h2>
    </header>
  )
}

function JobsHalf({ jobs, byId, now, loose }: { jobs: Job[]; byId: Map<string, Card>; now: number; loose: AgentStage[] }) {
  const [writing, setWriting] = useState<AgentStage | null>(null)
  return (
    <div className={cn(COLUMNS, "min-h-0 flex-1 pt-1 pb-5")}>
      {SPECIALISTS.map(({ stage, name }, i) => {
        const here = jobs.filter(j => jobColumn(j) === i)
        const canTake = loose.includes(stage)
        return (
          <section key={stage} className={cn(COLUMN, !canTake && !here.length && "opacity-50")}>
            <SpecialistHead name={name} jobs={here} canTake={canTake} onAdd={() => setWriting(stage)} />
            <div className="-m-0.5 flex min-h-0 flex-col gap-2 overflow-y-auto p-0.5">
              {writing === stage && <JobComposer stage={stage} onDone={() => setWriting(null)} />}
              {here.map(j => <TicketCard key={j.id} state={j} card={j.sessionId ? byId.get(j.sessionId) : undefined} now={now} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function PipelineView() {
  const now = useNow()
  const states = useLive(l => l.snapshot?.pipelines) ?? []
  const jobs = useLive(l => l.snapshot?.jobs) ?? []
  const loose = useLive(l => l.snapshot?.loose) ?? []
  const cards = useLive(l => l.snapshot?.cards)
  const byId = useMemo(() => new Map((cards ?? []).map(c => [c.id, c])), [cards])
  const board = useGlide(states.map(s => `${s.key}:${columnOf(s)}`).join())
  const halves = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useSplit()
  return (
    <div className="flex h-full min-w-min flex-col">
      <div className="sticky left-0 self-start px-6 pt-2"><DebtButton /></div>
      <div ref={halves} className="flex min-h-0 flex-1 flex-col">
        <div ref={board} className={cn(COLUMNS, "min-h-0 flex-none pt-2 pb-2")} style={{ height: `${split * 100}%` }}>
          {STAGES.map((name, i) => {
            const here = states.filter(s => columnOf(s) === i)
            return (
              <section key={name} className={cn(COLUMN, i >= BUILT && !here.length && "opacity-50")}>
                <StageHead n={i + 1} name={name} stage={STAGE_KEYS[i]!} tickets={here} />
                <div className="-m-0.5 flex min-h-0 flex-col gap-2 overflow-y-auto p-0.5">
                  {here.map(s => <TicketCard key={s.key} state={s} card={s.sessionId ? byId.get(s.sessionId) : undefined} now={now} />)}
                </div>
              </section>
            )
          })}
        </div>
        <Divider split={split} onSplit={setSplit} box={halves} />
        <JobsHalf jobs={jobs} byId={byId} now={now} loose={loose} />
      </div>
    </div>
  )
}
