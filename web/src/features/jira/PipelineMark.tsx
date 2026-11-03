// What a ticket's pipeline looks like at a glance, the same in the Pipeline
// view and in the ticket: a mark for its state (the session orbs: one that
// works, one that waits for you; a check, an alert) and a rail, one segment a
// stage, the current one in the state's colour (it runs while it works).
import { Orb as OrbView } from "@yogesharc/thinking-orbs"
import { AlertTriangle, Check } from "lucide-react"
import type { Card } from "@/lib/api-types"
import { useIsDots } from "@/lib/board-style"
import { cn } from "@/lib/utils"
import { doingText, orbOf } from "@/features/conversation/session-events"
import type { PipelineState, PipelineStatus } from "@server/pipeline"

export const STAGES = ["Refine", "Plan", "Build", "Review", "Staging"]
const AT: Record<PipelineState["stage"], number> = { refine: 0 }

export const STATUS_TEXT: Record<PipelineStatus, string> = { running: "Refining", "needs-info": "Waiting for you", ready: "Ready to plan", failed: "Failed" }
const TONE: Record<PipelineStatus, { text: string; bar: string }> = {
  running: { text: "text-work", bar: "bg-[linear-gradient(90deg,var(--work),color-mix(in_srgb,var(--work)_35%,transparent),var(--work))] bg-[length:200%_100%] animate-shimmer" },
  "needs-info": { text: "text-ask", bar: "bg-ask" },
  ready: { text: "text-work", bar: "bg-work" },
  failed: { text: "text-bad", bar: "bg-bad" },
}

// The line a ticket says now: what its agent does, the decisions it waits
// for, what broke, or that it is ready.
export function liveLine(state: PipelineState, card: Card | undefined): string {
  if (state.status === "running") return doingText(card?.doing) ?? "Starting"
  if (state.status === "needs-info") return `${state.questions.length} decision${state.questions.length === 1 ? "" : "s"} for you`
  if (state.status === "failed") return state.error ?? "The run failed"
  return "Refined: ready to plan"
}

export function PipelineMark({ state, card, size = 24 }: { state: PipelineState; card?: Card; size?: number }) {
  const isDots = useIsDots()
  const tone = TONE[state.status].text
  const box = { width: size, height: size }
  const title = STATUS_TEXT[state.status]
  if (state.status === "ready" || state.status === "failed") {
    const Icon = state.status === "ready" ? Check : AlertTriangle
    return (
      <span className={cn("inline-flex flex-none items-center justify-center rounded-full", tone, state.status === "ready" ? "bg-work-soft" : "bg-bad-soft")} style={box} role="img" aria-label={title} title={title}>
        <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    )
  }
  const look = state.status === "running" ? orbOf(card?.doing) : ({ state: "waiting", variant: "default" } as const)
  return (
    <span className={cn("inline-flex flex-none items-center justify-center", tone)} style={box} role="img" aria-label={title} title={title}>
      {isDots ? <OrbView {...look} size={Math.round(size * 0.86)} /> : <i className={cn("size-2 rounded-full bg-current", state.status === "running" && "run-dot")} />}
    </span>
  )
}

// The stages as a rail: short segments in a row, or, with labels, the whole
// width with each stage's name under it.
export function Rail({ state, hasLabels = false, className }: { state: PipelineState | null; hasLabels?: boolean; className?: string }) {
  const at = state ? AT[state.stage] : -1
  return (
    <ol className={cn("m-0 flex list-none p-0", hasLabels ? "gap-1.5" : "gap-[3px]", className)} aria-label={state ? `${STAGES[at]}: ${STATUS_TEXT[state.status]}` : "Not started"}>
      {STAGES.map((name, i) => (
        <li key={name} className={cn("flex flex-col gap-1.5", hasLabels && "min-w-0 flex-1")} title={hasLabels ? undefined : name}>
          <i className={cn("block rounded-full", hasLabels ? "h-1 w-full" : "h-1 w-3.5", i < at ? "bg-text-muted" : i === at && state ? TONE[state.status].bar : "bg-line-strong")} />
          {hasLabels && <span className={cn("truncate text-[11.5px]", i === at && state ? cn("font-semibold", TONE[state.status].text) : "text-faint")}>{name}</span>}
        </li>
      ))}
    </ol>
  )
}
