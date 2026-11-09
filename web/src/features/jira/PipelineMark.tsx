// What a ticket's pipeline looks like at a glance, the same in the Pipeline
// view and in the ticket: a mark for its state (an orb: one that works, one
// that waits for you, one at rest, one blinking) and a rail, one segment a
// stage, the current one in the state's colour (it runs while it works).
import { Orb as OrbView } from "@yogesharc/thinking-orbs"
import type { Card } from "@/lib/api-types"
import { useIsDots } from "@/lib/board-style"
import { cn } from "@/lib/utils"
import { doingText, orbOf } from "@/features/conversation/session-events"
import type { PipelineState, PipelineStatus, Stage } from "@server/pipeline"
import { STAGES, failed, stageAt, toFix, untested, waitingStep } from "./pipeline-board"

export { STAGES, stageAt } from "./pipeline-board"

// The state in two words: what the stage does, or what comes next.
const DOING: Record<Stage, string> = { refine: "Refining", plan: "Planning", build: "Building", review: "Reviewing", staging: "Deploying to staging", test: "Testing in staging", prod: "Deploying to prod", smoke: "Checking prod" }
const NEXT: Record<Stage, string> = { refine: "Ready to plan", plan: "Ready to build", build: "Ready to review", review: "Ready for staging", staging: "Ready to test", test: "Ready for prod", prod: "Ready to check", smoke: "Live in prod" }
const START: Record<Stage, string> = { refine: "Run refine", plan: "Run plan", build: "Run build", review: "Run review", staging: "Deploy to staging", test: "Test in staging", prod: "Deploy to prod", smoke: "Check prod" }
// Building after a review fixes what it found.
const isFix = (stage: Stage, from?: Stage) => stage === "build" && from === "review"
export const startText = (stage: Stage, from?: Stage) => (isFix(stage, from) ? "Fix with build" : START[stage])
export const startingText = (stage: Stage, from?: Stage) => `${isFix(stage, from) ? "Fixing" : DOING[stage]}: a session starts`
// A review with something to fix, or a release step, waits for you like a question does.
const lookOf = (state: PipelineState): PipelineStatus => (toFix(state).length || failed(state).length || untested(state).length || waitingStep(state) ? "needs-info" : state.status)
export const statusText = (state: PipelineState) =>
  state.status === "running" && state.release?.rollback ? `Rolling back ${state.release.env}` : toFix(state).length || failed(state).length ? "To fix" : untested(state).length ? "To check by hand" : waitingStep(state) ? "Waiting for you" : state.status === "running" ? DOING[state.stage] : state.status === "ready" ? (state.children?.length ? `Coordinating ${state.children.length} tickets` : NEXT[state.stage]) : state.status === "needs-info" ? "Waiting for you" : "Failed"
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

// A test (or a check in prod) done: what failed, else that all passed.
function testLine(state: PipelineState) {
  const results = state.results ?? []
  const fail = failed(state).length
  const left = untested(state).length
  if (!fail && left) return `${left} to check by hand`
  return fail ? `${fail} ${fail === 1 ? "criterion" : "criteria"} failed` : state.stage === "test" ? `Tested: ${results.length} pass` : `Live in prod: ${results.length} checks pass`
}

// A release at work: its step at hand.
function releaseLine(state: PipelineState) {
  const step = state.release?.steps.find(s => s.status !== "done" && s.status !== "skipped")
  return step ? `${step.title}${step.status === "waiting" ? ": waiting for you" : ""}` : "Finishing"
}

// What a stage that ended well says, by stage (the rest is above).
const DONE_LINE: Partial<Record<Stage, (state: PipelineState) => string>> = {
  review: reviewLine,
  staging: () => "In staging: ready to test",
  test: testLine,
  prod: () => "In prod: ready to check",
  smoke: testLine,
  build: s => (s.fixed?.length ? `Fixed ${plural(s.fixed.length, "finding")}: ready to review` : `Built: ${s.units?.filter(u => u.pr).length ?? 0} draft PRs open`),
  plan: s => `Planned in ${s.units?.length ?? 0} unit${s.units?.length === 1 ? "" : "s"}: ready to build`,
}

// The line a ticket says now: what its agent does, the decisions it waits
// for, what broke, or that it is ready.
export function liveLine(state: PipelineState, card: Card | undefined): string {
  if (state.status === "running" && state.release) return releaseLine(state)
  if (state.status === "running") return doingText(card?.doing) ?? "Starting"
  if (state.status === "needs-info") return `${state.questions.length} decision${state.questions.length === 1 ? "" : "s"} for you`
  if (state.status === "failed") return state.error ?? "The run failed"
  if (state.children?.length) return `Refined as a whole: ${state.children.length} tickets, in order`
  return DONE_LINE[state.stage]?.(state) ?? "Refined: ready to plan"
}

// The orb by state: the session's while its agent works, waiting while it
// waits for you, at rest once done, blinking once it failed (two looks no
// session uses, so a ticket never reads as a session).
const ORB_OF = { ready: { state: "idle", variant: "default" }, failed: { state: "idle", variant: "blink" }, "needs-info": { state: "waiting", variant: "default" } } as const

export function PipelineMark({ state, card, size = 24 }: { state: PipelineState; card?: Card; size?: number }) {
  const isDots = useIsDots()
  const look = lookOf(state)
  const title = statusText(state)
  const orb = look === "running" ? orbOf(card?.doing) : ORB_OF[look]
  return (
    <span className={cn("inline-flex flex-none items-center justify-center", TONE[look].text)} style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
      {isDots ? <OrbView {...orb} size={Math.round(size * 0.86)} /> : <i className={cn("size-2 rounded-full bg-current", look === "running" && "run-dot")} />}
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
