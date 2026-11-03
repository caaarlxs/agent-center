// Where a ticket stands on the pipeline's board: the column of the stage it
// is at, or, once that stage is done, the next one's, waiting at its door.
import type { PipelineState, Stage } from "@server/pipeline"

export const STAGES = ["Refine", "Plan", "Build", "Review", "Staging"]
export const BUILT = 2 // the stages there is an agent for, from the left
const AT: Record<Stage, number> = { refine: 0, plan: 1 }
export const stageAt = (state: PipelineState) => AT[state.stage]

export const columnOf = (state: PipelineState) => Math.min(stageAt(state) + (state.status === "ready" ? 1 : 0), STAGES.length - 1)
export const isQueued = (state: PipelineState) => state.status === "ready"
