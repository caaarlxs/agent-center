// Every ticket agents work on (lib/pipeline.ts), by what it waits for: you
// first, then the ones at work, then the ones done. Each row says its stage,
// its state and what its session does now; a click opens the ticket. The stages' sessions show only here.
import { useMemo } from "react"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { dialog } from "@/app/open-dialog"
import { doingText } from "@/features/conversation/session-events"
import { ago } from "@/features/session/state"
import type { PipelineState } from "@server/pipeline"
import { STATUS, Stages } from "./Pipeline"

const GROUPS: { title: string; has: (s: PipelineState) => boolean }[] = [
  { title: "Waiting for you", has: s => s.status === "needs-info" || s.status === "failed" },
  { title: "At work", has: s => s.status === "running" },
  { title: "Done", has: s => s.status === "ready" },
]

// What the row says under the title: what the agent does now, the questions, the error.
function lineOf(s: PipelineState, card: Card | undefined): string | null {
  if (s.status === "running") return doingText(card?.doing) ?? (card ? "Between steps" : "Starting")
  if (s.status === "needs-info") return `${s.questions.length} question${s.questions.length === 1 ? "" : "s"} for you`
  if (s.status === "failed") return s.error
  return card?.recap ?? null
}

function Row({ state, card, now }: { state: PipelineState; card: Card | undefined; now: number }) {
  const status = STATUS[state.status]
  const line = lineOf(state, card)
  return (
    <li>
      <button className="flex w-full flex-col gap-2 rounded-[10px] border border-line bg-side p-3 text-left transition-[border-color,transform] duration-[120ms] hover:border-line-strong active:scale-[0.995]"
        onClick={() => dialog.set({ kind: "ticket", key: state.key })}>
        <span className="flex w-full min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-[13.5px] font-semibold">
            <span className="mr-2 font-mono text-xs text-text-muted">{state.key}</span>{state.summary ?? card?.tickets.find(t => t.key === state.key)?.summary}
          </span>
          <b className={cn("ml-auto shrink-0 text-xs font-semibold", status.tone)}>{status.text}</b>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Stages state={state} />
          <span className="text-xs text-faint">run {state.runs} · {ago(state.endedAt ?? state.startedAt, now)} ago</span>
        </span>
        {line && <span className={cn("block w-full truncate text-[12.5px]", state.status === "failed" ? "text-bad" : "text-text-muted")}>
          {state.status === "running" && <i className="run-dot mr-1.5 inline-block size-1.5 rounded-full bg-work align-middle" />}{line}
        </span>}
      </button>
    </li>
  )
}

export function PipelineView() {
  const now = useNow()
  const states = useLive(l => l.snapshot?.pipelines) ?? []
  const cards = useLive(l => l.snapshot?.cards)
  const byId = useMemo(() => new Map((cards ?? []).map(c => [c.id, c])), [cards])
  if (!states.length) return <p className="m-0 p-5 text-[13px] text-faint">No tickets in the pipeline.</p>
  return (
    <div className="flex max-w-[900px] flex-col gap-5 px-5 pt-3.5 pb-5">
      {GROUPS.map(g => {
        const shown = states.filter(g.has)
        return shown.length ? (
          <section key={g.title} className="flex flex-col gap-2">
            <h2 className="m-0 text-[11px] font-semibold tracking-[0.05em] text-faint uppercase">{g.title}</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {shown.map(s => <Row key={s.key} state={s} card={s.sessionId ? byId.get(s.sessionId) : undefined} now={now} />)}
            </ul>
          </section>
        ) : null
      })}
    </div>
  )
}
