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
import type { PipelineState, PipelineStatus, Stage } from "@server/pipeline"
import { STAGES, stageAt, toFix, waitingStep } from "./pipeline-board"

export { STAGES, stageAt } from "./pipeline-board"

// The state in two words: what the stage does, or what comes next.
const DOING: Record<Stage, string> = { refine: "Refining", plan: "Planning", build: "Building", review: "Reviewing", staging: "Deploying to staging", prod: "Deploying to prod" }
const NEXT: Record<Stage, string> = { refine: "Ready to plan", plan: "Ready to build", build: "Ready to review", review: "Ready for staging", staging: "Ready for prod", prod: "Live in prod" }
const START: Record<Stage, string> = { refine: "Run refine", plan: "Run plan", build: "Run build", review: "Run review", staging: "Deploy to staging", prod: "Deploy to prod" }
// Building after a review fixes what it found.
const isFix = (stage: Stage, from?: Stage) => stage === "build" && from === "review"
export const startText = (stage: Stage, from?: Stage) => (isFix(stage, from) ? "Fix with build" : START[stage])
export const startingText = (stage: Stage, from?: Stage) => `${isFix(stage, from) ? "Fixing" : DOING[stage]}: a session starts`
// A review with something to fix, or a release step, waits for you like a question does.
const lookOf = (state: PipelineState): PipelineStatus => (toFix(state).length || waitingStep(state) ? "needs-info" : state.status)
export const statusText = (state: PipelineState) =>
  toFix(state).length ? "To fix" : waitingStep(state) ? "Waiting for you" : state.status === "running" ? DOING[state.stage] : state.status === "ready" ? NEXT[state.stage] : state.status === "needs-info" ? "Waiting for you" : "Failed"
const TONE: Record<PipelineStatus, { text: string; bar: string }> = {
  running: { text: "text-work", bar: "bg-[linear-gradient(90deg,var(--work),color-mix(in_srgb,var(--work)_35%,transparent),var(--work))] bg-[length:200%_100%] animate-shimmer" },
  "needs-info": { text: "text-ask", bar: "bg-ask" },
  ready: { text: "text-work", bar: "bg-work" },
  failed: { text: "text-bad", bar: "bg-bad" },
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// A review done: what is left to fix, else the minor findings, else nothing.
function reviewLine(state: PipelineState) {
  const fix = toFix(state).length
  const minor = (state.findings?.length ?? 0) - fix
  return fix ? `${plural(fix, "finding")} to fix` : minor ? `Reviewed: ${minor} minor` : "Reviewed: nothing to fix"
}

// A release at work: its step at hand.
function releaseLine(state: PipelineState) {
  const step = state.release?.steps.find(s => s.status !== "done" && s.status !== "skipped")
  return step ? `${step.title}${step.status === "waiting" ? ": waiting for you" : ""}` : "Finishing"
}

// The line a ticket says now: what its agent does, the decisions it waits
// for, what broke, or that it is ready.
export function liveLine(state: PipelineState, card: Card | undefined): string {
  if (state.status === "running" && state.release) return releaseLine(state)
  if (state.status === "running") return doingText(card?.doing) ?? "Starting"
  if (state.status === "needs-info") return `${state.questions.length} decision${state.questions.length === 1 ? "" : "s"} for you`
  if (state.status === "failed") return state.error ?? "The run failed"
  if (state.stage === "review") return reviewLine(state)
  if (state.stage === "staging") return "In staging: ready for prod"
  if (state.stage === "prod") return "Live in prod"
  if (state.stage === "build" && state.fixed?.length) return `Fixed ${plural(state.fixed.length, "finding")}: ready to review`
  if (state.stage === "build") return `Built: ${state.units?.filter(u => u.pr).length ?? 0} draft PRs open`
  if (state.stage === "plan") return `Planned in ${state.units?.length ?? 0} unit${state.units?.length === 1 ? "" : "s"}: ready to build`
  return "Refined: ready to plan"
}

export function PipelineMark({ state, card, size = 24 }: { state: PipelineState; card?: Card; size?: number }) {
  const isDots = useIsDots()
  const look = lookOf(state)
  const tone = TONE[look].text
  const box = { width: size, height: size }
  const title = statusText(state)
  if (look === "ready" || look === "failed") {
    const Icon = look === "ready" ? Check : AlertTriangle
    return (
      <span className={cn("inline-flex flex-none items-center justify-center rounded-full", tone, look === "ready" ? "bg-work-soft" : "bg-bad-soft")} style={box} role="img" aria-label={title} title={title}>
        <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    )
  }
  const orb = state.status === "running" ? orbOf(card?.doing) : ({ state: "waiting", variant: "default" } as const)
  return (
    <span className={cn("inline-flex flex-none items-center justify-center", tone)} style={box} role="img" aria-label={title} title={title}>
      {isDots ? <OrbView {...orb} size={Math.round(size * 0.86)} /> : <i className={cn("size-2 rounded-full bg-current", state.status === "running" && "run-dot")} />}
    </span>
  )
}

// The stages as a rail: short segments in a row, or, with labels, the whole
// width with each stage's name under it.
export function Rail({ state, hasLabels = false, className }: { state: PipelineState | null; hasLabels?: boolean; className?: string }) {
  const at = state ? stageAt(state) : -1
  return (
    <ol className={cn("m-0 flex list-none p-0", hasLabels ? "gap-1.5" : "gap-[3px]", className)} aria-label={state ? `${STAGES[at]}: ${statusText(state)}` : "Not started"}>
      {STAGES.map((name, i) => (
        <li key={name} className={cn("flex flex-col gap-1.5", hasLabels && "min-w-0 flex-1")} title={hasLabels ? undefined : name}>
          <i className={cn("block rounded-full", hasLabels ? "h-1 w-full" : "h-1 w-3.5", i < at ? "bg-text-muted" : i === at && state ? TONE[lookOf(state)].bar : "bg-line-strong")} />
          {hasLabels && <span className={cn("truncate text-[11.5px]", i === at && state ? cn("font-semibold", TONE[lookOf(state)].text) : "text-faint")}>{name}</span>}
        </li>
      ))}
    </ol>
  )
}
