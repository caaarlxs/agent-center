// The jobs' half of the pipeline's board (lib/jobs.ts): the same columns, each
// one its stage's specialist, with what you handed it.
import type { Job } from "@server/jobs"
import type { AgentStage } from "@server/pipeline"

// Under each column of the pipeline, its agent: the test in Staging, the check in Prod.
export const SPECIALISTS: { stage: AgentStage; name: string }[] = [
  { stage: "refine", name: "Refiner" }, { stage: "plan", name: "Planner" }, { stage: "build", name: "Builder" },
  { stage: "review", name: "Reviewer" }, { stage: "test", name: "Tester" }, { stage: "smoke", name: "Prod checker" },
]
type JobLike = Pick<Job, "stage" | "ticket"> & { prs: Pick<Job["prs"][number], "repo" | "number">[] }
export const jobColumn = (job: Pick<Job, "stage">) => SPECIALISTS.findIndex(s => s.stage === job.stage)

export const jobLabel = (job: JobLike) =>
  job.ticket ?? (job.prs.length === 1 ? `${job.prs[0]!.repo} #${job.prs[0]!.number}` : `${job.prs.length} PRs`)

// What you paste for a job: one ticket (its key or its link) and, for the reviewer, PR links.
const PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/
const KEY = /^(?:https?:\/\/\S+\/browse\/)?([A-Za-z][A-Za-z0-9]+-\d+)\/?$/
export function parseJobInput(text: string, takesPrs = true): { ticket: string | null; prs: string[]; error: string | null } {
  const tickets: string[] = []
  const prs: string[] = []
  for (const word of text.split(/[\s,]+/).filter(Boolean)) {
    const pr = word.match(PR)?.[0]
    const key = word.match(KEY)?.[1]?.toUpperCase()
    if (pr) prs.includes(pr) || prs.push(pr)
    else if (key) tickets.includes(key) || tickets.push(key)
    else return { ticket: null, prs: [], error: `Not a ticket or a PR: ${word}` }
  }
  const error = tickets.length > 1 ? "One ticket a job" : prs.length && !takesPrs ? "This one takes a ticket" : null
  return { ticket: tickets[0] ?? null, prs, error }
}

// How much of the board the pipeline takes, the jobs the rest: both always in sight.
export const SPLIT = 0.62
export const clampSplit = (v: number) => (Number.isFinite(v) ? Math.min(0.85, Math.max(0.2, v)) : SPLIT)
