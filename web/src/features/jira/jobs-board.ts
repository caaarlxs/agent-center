// The jobs' half of the pipeline's board (lib/jobs.ts): the same columns, each
// one its stage's specialist, with what you handed it.
import type { Job, Resolved } from "@server/jobs"
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

// A job as you write it: what you pasted, kept as you paste more.
export type Draft = { ticket: string | null; prs: string[] }
export function addToDraft(draft: Draft, text: string, takesPrs: boolean): { draft: Draft; error: string | null } {
  const parsed = parseJobInput(text, takesPrs)
  if (parsed.error) return { draft, error: parsed.error }
  return { draft: { ticket: parsed.ticket ?? draft.ticket, prs: [...new Set([...draft.prs, ...parsed.prs])] }, error: null }
}

// What the job sends once looked up: the ticket (yours, or the one the PRs
// name) and every PR you left ticked (yours, and the ones that name the ticket).
export const jobToSend = (draft: Draft, resolved: Resolved | null, dropped: string[]): Draft => ({
  ticket: resolved?.ticket?.key ?? draft.ticket,
  prs: (resolved?.prs.map(p => p.url) ?? draft.prs).filter(u => !dropped.includes(u)),
})

// What stops the job, in a line: what you pasted, what the lookup found wrong, no PR to review.
export function draftProblem(pasteError: string | null, resolved: Resolved | null, takesPrs: boolean): string | null {
  if (pasteError || resolved?.error) return pasteError ?? resolved!.error
  return resolved && takesPrs && !resolved.prs.length ? `No open PR names ${resolved.ticket?.key ?? "the ticket"}` : null
}

// It goes once looked up, with nothing wrong, and with what its specialist needs.
export const canSendDraft = (sent: Draft, resolved: Resolved | null, isLooking: boolean, takesPrs: boolean) =>
  !isLooking && !!resolved && !resolved.error && (takesPrs ? sent.prs.length > 0 : !!resolved.ticket)

export const sendText = (stage: AgentStage, prs: number) => (stage === "review" ? `Review ${prs} PR${prs === 1 ? "" : "s"}` : "Send")
