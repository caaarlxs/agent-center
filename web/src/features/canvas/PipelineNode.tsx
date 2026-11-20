// "Pipeline", over "Incoming": the pipeline's tickets, so the Canvas tells you what they do without
// opening their view. A small card each: its stage and moment, in the colour of what it does (at
// work, waiting for you, failed, at rest), a dot when it ended after you last opened it. Waiting for
// you first, then at work. A click opens the ticket.
import { cn } from "@/lib/utils"
import { useLive } from "@/lib/live"
import { dialog } from "@/app/open-dialog"
import type { PipelineState } from "@server/pipeline"
import { headline, waitsForYou } from "@/features/jira/pipeline-board"
import { isToRead, markRead, useSeen } from "@/features/jira/pipeline-seen"
import { TICKET } from "./geometry"

const rank = (s: PipelineState) => (waitsForYou(s) ? 0 : s.status === "running" ? 1 : 2)
const open = (s: PipelineState) => (markRead(s.key), dialog.set({ kind: "ticket", key: s.key }))

function TicketChip({ state, isNew }: { state: PipelineState; isNew: boolean }) {
  const isWaiting = waitsForYou(state)
  const isRunning = state.status === "running" && !isWaiting
  return (
    <button onClick={() => open(state)} title={`${state.key} · ${state.summary ?? ""}`} style={{ width: TICKET.w, height: TICKET.h }}
      className={cn("nodrag relative flex flex-col justify-center gap-0.5 rounded-[9px] border px-2.5 text-left transition-colors duration-100",
        isWaiting ? "border-[color-mix(in_srgb,var(--ask)_55%,var(--line))] bg-ask-soft" : state.status === "failed" ? "border-bad/40 bg-surface" : "border-line bg-surface hover:border-line-strong",
        isRunning && "beam")}>
      <span className="flex min-w-0 items-baseline gap-1.5 text-[12px]">
        <span className="shrink-0 font-mono text-[10.5px] text-faint">{state.key}</span>
        <span className="truncate font-semibold text-text">{state.summary ?? state.key}</span>
      </span>
      <span className={cn("truncate text-[11.5px]", isWaiting ? "font-semibold text-ask" : isRunning ? "text-work" : state.status === "failed" ? "text-bad" : "text-text-muted")}>{headline(state)}</span>
      {isNew && <i className="absolute top-1.5 right-1.5 size-[6px] rounded-full bg-brand" aria-label="New since you last opened it" />}
    </button>
  )
}

export function PipelineNode() {
  const states = useLive(l => l.snapshot?.pipelines) ?? []
  const seen = useSeen()
  const shown = [...states].sort((a, b) => rank(a) - rank(b))
  return (
    <div className="relative size-full rounded-[14px] border-[1.5px] border-dashed border-line-strong px-2.5 pt-5 pb-3">
      <span className="absolute -top-2.5 left-3.5 bg-bg px-2 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Pipeline</span>
      <div className="flex flex-wrap gap-2">
        {shown.map(s => <TicketChip key={s.key} state={s} isNew={isToRead(s, seen)} />)}
      </div>
    </div>
  )
}
