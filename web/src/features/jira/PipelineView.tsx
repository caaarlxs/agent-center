// Every ticket agents work on (lib/pipeline.ts), on a board of the stages,
// left to right. A ticket sits in the column of its stage; once that stage is
// done, it waits at the next one's door (a dashed card). A stage at work has a
// line flowing in its head (amber when it waits for you), a ticket at work a
// beam round its edge; the stages there is no agent for yet stay dim. A click
// opens the ticket: what to do next and the detail live there.
import { type KeyboardEvent, useLayoutEffect, useMemo, useRef } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { dialog } from "@/app/open-dialog"
import { ago } from "@/features/session/state"
import type { PipelineState } from "@server/pipeline"
import { useActivity } from "./Pipeline"
import { StageEffect } from "./StageEffect"
import { effectOf, sceneOf } from "./stage-effects"
import { PipelineMark, liveLine } from "./PipelineMark"
import { BUILT, STAGES, columnOf, costOf, dollars, isQueued, toFix, waitingStep } from "./pipeline-board"

const openTicket = (key: string) => dialog.set({ kind: "ticket", key })
const onOpenKey = (key: string) => (e: KeyboardEvent) => e.key === "Enter" && e.target === e.currentTarget && openTicket(key)
const shimmer = "[--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]"

// A ticket at a glance, the same size in every column: what it is, the one
// line that matters now (what its agent does, what it waits for, what broke,
// what it came to), and its key, cost and time; its stage's effect on the right.
export function TicketCard({ state, card, now }: { state: PipelineState; card: Card | undefined; now: number }) {
  const isRunning = state.status === "running"
  const isAsking = state.status === "needs-info" || toFix(state).length > 0 || !!waitingStep(state)
  const activity = useActivity(state.key, isRunning && !state.release)
  const effect = effectOf(state)
  const step = isRunning && !state.release ? (activity?.steps.findLast(s => s.isOpen) ?? activity?.steps.at(-1)) : undefined
  const line = step?.text ?? liveLine(state, card)
  const time = ago(isRunning ? state.startedAt : (state.endedAt ?? state.startedAt), now)
  return (
    <article tabIndex={0} data-card={state.key} data-col={columnOf(state)} onClick={() => openTicket(state.key)} onKeyDown={onOpenKey(state.key)} data-edge={isAsking ? "waiting" : undefined}
      className={cn("group/card relative h-[108px] flex-none cursor-pointer rounded-[10px] border px-3 py-3 transition-[border-color,box-shadow] duration-100 hover:shadow-card",
        isRunning && "beam",
        isAsking ? "border-[color-mix(in_srgb,var(--ask)_50%,var(--line))] bg-surface shadow-[0_0_0_3px_var(--ask-soft),0_0_24px_var(--ask-soft)]"
          : isQueued(state) ? "border-dashed border-line-strong bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] hover:border-text-muted"
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
            <span className="font-mono">{state.key}</span>{state.history?.length ? ` · ≈${dollars(costOf(state.history))}` : ""} · {time}
          </span>
        </div>
      </div>
    </article>
  )
}

// A stage's head: its line (flowing while an agent works in it, amber while
// it waits for you), its number and name, and how many tickets it holds.
function StageHead({ n, name, tickets }: { n: number; name: string; tickets: PipelineState[] }) {
  const isWorking = tickets.some(t => t.status === "running")
  const isAsking = tickets.some(t => t.status === "needs-info" || toFix(t).length > 0 || !!waitingStep(t))
  return (
    <header className="mx-1.5 mb-3 flex flex-col gap-2.5">
      <i className={cn("block h-[2px] rounded-full", isWorking ? "flow" : isAsking ? "bg-ask" : "bg-line-strong")} />
      <h2 className="m-0 flex items-center gap-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase">
        <span className="dot-time font-mono text-faint">{String(n).padStart(2, "0")}</span>{name}
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

export function PipelineView() {
  const now = useNow()
  const states = useLive(l => l.snapshot?.pipelines) ?? []
  const cards = useLive(l => l.snapshot?.cards)
  const byId = useMemo(() => new Map((cards ?? []).map(c => [c.id, c])), [cards])
  const board = useGlide(states.map(s => `${s.key}:${columnOf(s)}`).join())
  return (
    <div ref={board} className="grid h-full min-w-min auto-cols-[minmax(290px,1fr)] grid-flow-col gap-3 px-5 pt-3.5 pb-5">
      {STAGES.map((name, i) => {
        const here = states.filter(s => columnOf(s) === i)
        return (
          <section key={name} className={cn("dots-veil flex min-h-0 flex-col rounded-[12px] bg-side px-2 pt-3 pb-2", i >= BUILT && !here.length && "opacity-50")}>
            <StageHead n={i + 1} name={name} tickets={here} />
            <div className="-m-0.5 flex min-h-0 flex-col gap-2 overflow-y-auto p-0.5">
              {here.map(s => <TicketCard key={s.key} state={s} card={s.sessionId ? byId.get(s.sessionId) : undefined} now={now} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
