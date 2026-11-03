// Every ticket agents work on (lib/pipeline.ts), on a board of the stages,
// left to right. A ticket sits in the column of its stage; once that stage is
// done, it waits at the next one's door (a dashed card, the button that
// starts it). A stage at work has a line flowing in its head (amber when it
// waits for you), a ticket at work a beam round its edge; the stages there is
// no agent for yet stay dim. A click opens the ticket; the stages' sessions
// show only here.
import { Play } from "lucide-react"
import { type KeyboardEvent, useMemo } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Button } from "@/components/ui/button"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { dialog } from "@/app/open-dialog"
import { ago, repoDot } from "@/features/session/state"
import type { PipelineState, Unit } from "@server/pipeline"
import { act } from "./Pipeline"
import { PipelineMark, liveLine, startText, startingText } from "./PipelineMark"
import { BUILT, STAGES, columnOf, costOf, dollars, isQueued, nextStage } from "./pipeline-board"

const openTicket = (key: string) => dialog.set({ kind: "ticket", key })
const onOpenKey = (key: string) => (e: KeyboardEvent) => e.key === "Enter" && e.target === e.currentTarget && openTicket(key)

// The repos a plan's units touch, each once, in its colour.
function Repos({ units }: { units: Unit[] }) {
  const repos = [...new Set(units.map(u => u.repo))]
  return (
    <span className="flex flex-wrap gap-x-2.5 gap-y-1">
      {repos.map(r => <span key={r} className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted"><i className="repo-dot size-[7px] rounded-[2px]" style={{ background: repoDot(r) }} />{r}</span>)}
    </span>
  )
}

function TicketCard({ state, card, now }: { state: PipelineState; card: Card | undefined; now: number }) {
  const isRunning = state.status === "running"
  const isAsking = state.status === "needs-info"
  const isWaiting = isQueued(state)
  // Done with its stage, the next one starts from here (if there is an agent for it).
  const next = nextStage(state)
  const time = ago(isRunning ? state.startedAt : (state.endedAt ?? state.startedAt), now)
  return (
    <article tabIndex={0} onClick={() => openTicket(state.key)} onKeyDown={onOpenKey(state.key)} data-edge={isAsking ? "waiting" : undefined}
      className={cn("group/card relative flex cursor-pointer flex-col gap-2.5 rounded-[10px] border px-3 pt-3 pb-2.5 transition-[border-color,box-shadow] duration-100 hover:shadow-card",
        isRunning && "beam",
        isAsking ? "border-[color-mix(in_srgb,var(--ask)_50%,var(--line))] bg-surface shadow-[0_0_0_3px_var(--ask-soft),0_0_24px_var(--ask-soft)]"
          : isWaiting ? "border-dashed border-line-strong bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] hover:border-text-muted"
          : "border-line bg-surface hover:border-line-strong")}>
      <header className="flex min-w-0 items-start gap-2.5">
        <PipelineMark state={state} card={card} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h3 className="m-0 line-clamp-2 text-sm leading-[1.35] font-[550] [overflow-wrap:anywhere]">{state.summary ?? card?.tickets.find(t => t.key === state.key)?.summary ?? state.key}</h3>
          <span className="flex items-center gap-2 text-xs">
            <span className="font-mono text-[11px] text-faint">{state.key}</span>
            <span className="dot-time ml-auto text-xs whitespace-nowrap text-faint tabular-nums" title="API-equivalent cost of every run, and how long it has been like this">
              {state.history?.length ? `≈${dollars(costOf(state.history))} · ` : ""}{time}
            </span>
          </span>
        </div>
      </header>
      <p className={cn("m-0 line-clamp-2 text-[12.5px] leading-[1.45]", isAsking ? "font-semibold text-ask" : state.status === "failed" ? "text-bad" : "text-text-muted")}>
        {isRunning ? <Shimmer as="span" duration={2.2} className="[--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{liveLine(state, card)}</Shimmer> : liveLine(state, card)}
      </p>
      {state.units?.length ? <Repos units={state.units} /> : null}
      {next && (
        <Button className="h-7 self-start gap-1.5 text-xs"
          onClick={e => (e.stopPropagation(), void act("/api/pipeline/start", { key: state.key, stage: next }, startingText(next)))}>
          <Play size={12} className="fill-current" />{startText(next)}
        </Button>
      )}
    </article>
  )
}

// A stage's head: its line (flowing while an agent works in it, amber while
// it waits for you), its number and name, and how many tickets it holds.
function StageHead({ n, name, tickets }: { n: number; name: string; tickets: PipelineState[] }) {
  const isWorking = tickets.some(t => t.status === "running")
  const isAsking = tickets.some(t => t.status === "needs-info")
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

export function PipelineView() {
  const now = useNow()
  const states = useLive(l => l.snapshot?.pipelines) ?? []
  const cards = useLive(l => l.snapshot?.cards)
  const byId = useMemo(() => new Map((cards ?? []).map(c => [c.id, c])), [cards])
  return (
    <div className="grid h-full min-w-min auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 px-5 pt-3.5 pb-5">
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
