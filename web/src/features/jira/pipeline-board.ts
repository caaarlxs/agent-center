// Where a ticket stands on the pipeline's board: the column of the stage it
// is at, or, once that stage is done, the next one's, waiting at its door.
import type { Finding, PipelineState, Stage } from "@server/pipeline"
import type { ReleaseStep } from "@server/release"

export const STAGES = ["Refine", "Plan", "Build", "Review", "Staging", "Prod"]
export const BUILT = 6 // the stages that run, from the left
const AT: Record<Stage, number> = { refine: 0, plan: 1, build: 2, review: 3, staging: 4, prod: 5 }
// What a review found that stops the ticket: its blockers and majors.
export const toFix = (state: PipelineState): Finding[] => (state.stage === "review" ? (state.findings ?? []).filter(f => f.severity !== "minor") : [])
// The stage a ticket done with its own may start now, if there is an agent
// for it: after a review with something to fix, the build again.
const AFTER: Partial<Record<Stage, Stage>> = { refine: "plan", plan: "build", build: "review", review: "staging", staging: "prod" }
export const nextStage = (state: PipelineState): Stage | null =>
  state.status !== "ready" ? null : toFix(state).length ? "build" : (AFTER[state.stage] ?? null)
export const stageAt = (state: PipelineState) => AT[state.stage]
// The step of a release at work that waits for you.
export const waitingStep = (state: PipelineState): ReleaseStep | undefined =>
  state.status === "running" ? state.release?.steps.find(s => s.status === "waiting") : undefined
export const isRelease = (stage: Stage) => stage === "staging" || stage === "prod"

// Done with its stage (and nothing to fix), a ticket waits at the next one's door.
// Live in prod, it is done: it waits for nothing.
export const isQueued = (state: PipelineState) => state.status === "ready" && !toFix(state).length && state.stage !== "prod"
export const columnOf = (state: PipelineState) => Math.min(stageAt(state) + (isQueued(state) ? 1 : 0), STAGES.length - 1)

// What runs spent, in a few characters: tokens (3.9M, 55k) and the
// API-equivalent cost ($4.10, $12).
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const dollars = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`)
export const costOf = (runs: { spend?: { cost: number } | null }[]) => runs.reduce((sum, r) => sum + (r.spend?.cost ?? 0), 0)
