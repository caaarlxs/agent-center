// Sending a ticket back to an earlier stage (lib/pipeline.ts sendBack): where it can go, where
// it goes unless you pick, and what happens then, in a line.
import type { AgentStage, PipelineState } from "@server/pipeline"

export const BACK: AgentStage[] = ["refine", "plan", "build"]
export const BACK_NAMES: Record<string, string> = { refine: "Refine", plan: "Plan", build: "Build" }
const BEFORE: Partial<Record<AgentStage, AgentStage>> = { plan: "refine", build: "plan" }

// A stage can take it once the one before it was done.
export const canGoBack = (state: PipelineState, stage: AgentStage) => {
  const need = BEFORE[stage]
  return !need || (state.history ?? []).some(r => r.stage === need && r.status === "ready")
}

// With news from Jira, the refinement (what is asked may change); else the stage it is in, at most Build.
export const backDefault = (state: PipelineState): AgentStage =>
  state.news?.comments.length ? "refine" : BACK.includes(state.stage as AgentStage) ? (state.stage as AgentStage) : "build"

// What happens: that stage goes on with what you write, then the ones after it, as the ticket runs.
export function backLine(state: PipelineState, stage: AgentStage) {
  const after = ["Plan", "Build", "Review"].slice(BACK.indexOf(stage))
  const then = after.length > 1 ? `${after.slice(0, -1).join(", ")} and ${after.at(-1)}` : after[0]
  return `${BACK_NAMES[stage]} picks up where it left off, with what you write. Then ${then}${state.auto ? ", on their own" : ", each when you start it"}.`
}

// What runs in staging or prod stays: the change goes in new PRs.
export const deployedTo = (state: PipelineState) => Object.keys(state.deployed ?? {})
