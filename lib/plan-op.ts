// A turn's task list as the desktop app shows it: a full list, then steps
// moving through it. Pure, with no import: the server (lib/transcript.ts,
// lib/plan.ts) and the web app both run it.

export type PlanStep = { content: string; status: "pending" | "in_progress" | "completed" }
export type PlanOp = { advance?: boolean; done?: number[]; start?: number; finish?: boolean }

// The task list the app shows: a full list, then steps moving through it.
export function applyPlanOp(steps: PlanStep[], op: PlanOp): PlanStep[] {
  const next = steps.map(s => ({ ...s }))
  if (op.finish) for (const s of next) if (s.status === "in_progress") s.status = "completed"
  for (const n of op.done ?? []) if (next[n - 1]) next[n - 1]!.status = "completed"
  if (op.advance) {
    const i = next.findIndex(s => s.status === "in_progress")
    if (i >= 0) next[i]!.status = "completed"
    const j = next.findIndex(s => s.status === "pending")
    if (j >= 0) next[j]!.status = "in_progress"
  }
  if (op.start && next[op.start - 1]) {
    for (const s of next) if (s.status === "in_progress") s.status = "pending"
    next[op.start - 1]!.status = "in_progress"
  }
  return next
}
