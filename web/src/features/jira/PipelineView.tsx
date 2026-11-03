// Every ticket agents work on (lib/pipeline.ts), laid out like the inbox: the
// ones that need you first, then the ones at work, then the ones done. A row
// says only what matters at a glance: its state (the session orbs), what the
// agent does now or what it waits for, the stage on a rail, and for how long.
// A click opens the ticket; the stages' sessions show only here.
import { useMemo } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { dialog } from "@/app/open-dialog"
import { ago } from "@/features/session/state"
import type { PipelineState } from "@server/pipeline"
import { PipelineMark, Rail, STAGES, liveLine, stageAt } from "./PipelineMark"

const GROUPS: { title: string; dot: string; has: (s: PipelineState) => boolean }[] = [
  { title: "Needs you", dot: "bg-ask", has: s => s.status === "needs-info" || s.status === "failed" },
  { title: "At work", dot: "bg-work", has: s => s.status === "running" },
  { title: "Done", dot: "bg-faint", has: s => s.status === "ready" },
]

function Row({ state, card, now }: { state: PipelineState; card: Card | undefined; now: number }) {
  const line = liveLine(state, card)
  const isRunning = state.status === "running"
  // While it works, for how long; else since when it waits (or ended).
  const time = ago(isRunning ? state.startedAt : (state.endedAt ?? state.startedAt), now)
  return (
    <button onClick={() => dialog.set({ kind: "ticket", key: state.key })}
      className="my-px grid min-h-[52px] w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-5 rounded-[9px] px-2.5 py-2 text-left transition-[background-color] duration-80 hover:bg-hover @max-[640px]:grid-cols-[minmax(0,1fr)_3.5rem]">
      <span className="flex min-w-0 items-center gap-2.5">
        <PipelineMark state={state} card={card} />
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate text-[13.5px] font-[550]">{state.summary ?? card?.tickets.find(t => t.key === state.key)?.summary ?? state.key}</span>
            <span className="shrink-0 font-mono text-[11px] text-faint">{state.key}</span>
          </span>
          <span className={cn("min-w-0 truncate text-[12.5px]", state.status === "needs-info" ? "text-ask" : state.status === "failed" ? "text-bad" : "text-text-muted")}>
            {isRunning ? <Shimmer as="span" duration={2.2} className="[--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{line}</Shimmer> : line}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2.5 @max-[640px]:hidden">
        <span className="text-xs text-faint">{STAGES[stageAt(state)]}</span>
        <Rail state={state} />
      </span>
      <span className="text-right text-xs whitespace-nowrap text-faint tabular-nums">{time}</span>
    </button>
  )
}

export function PipelineView() {
  const now = useNow()
  const states = useLive(l => l.snapshot?.pipelines) ?? []
  const cards = useLive(l => l.snapshot?.cards)
  const byId = useMemo(() => new Map((cards ?? []).map(c => [c.id, c])), [cards])
  if (!states.length) return <p className="m-0 px-5 py-4 text-[13px] text-faint">No tickets in the pipeline.</p>
  return (
    <div className="@container max-w-[1180px] px-3 pt-2 pb-10">
      {GROUPS.map(g => {
        const shown = states.filter(g.has)
        return shown.length ? (
          <section key={g.title} className="mt-1.5">
            <h2 className="m-0 flex h-8 items-center gap-2 px-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase">
              <i className={cn("size-[7px] rounded-full", g.dot)} />{g.title}<span className="font-medium text-faint">{shown.length}</span>
            </h2>
            {shown.map(s => <Row key={s.key} state={s} card={s.sessionId ? byId.get(s.sessionId) : undefined} now={now} />)}
          </section>
        ) : null
      })}
    </div>
  )
}
