// Where a ticket stands on the pipeline's board: the column of the stage it
// is at, or, once that stage is done, the next one's, waiting at its door.
import type { PipelineState, Stage } from "@server/pipeline"

export const STAGES = ["Refine", "Plan", "Build", "Review", "Staging"]
export const BUILT = 2 // the stages there is an agent for, from the left
const AT: Record<Stage, number> = { refine: 0, plan: 1 }
export const stageAt = (state: PipelineState) => AT[state.stage]

export const columnOf = (state: PipelineState) => Math.min(stageAt(state) + (state.status === "ready" ? 1 : 0), STAGES.length - 1)
export const isQueued = (state: PipelineState) => state.status === "ready"

// What runs spent, in a few characters: tokens (3.9M, 55k) and the
// API-equivalent cost ($4.10, $12).
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const dollars = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`)
export const costOf = (runs: { spend?: { cost: number } | null }[]) => runs.reduce((sum, r) => sum + (r.spend?.cost ?? 0), 0)
