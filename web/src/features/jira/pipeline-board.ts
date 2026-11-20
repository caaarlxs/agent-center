// Where a ticket stands on the pipeline's board: the column of the stage it
// is at, or, once that stage is done, the next one's, waiting at its door.
import type { Finding, Kept, PipelineState, Run, Stage, TestResult } from "@server/pipeline"
import type { Release, ReleaseStep } from "@server/release"

export const STAGES = ["Refine", "Plan", "Build", "Review", "Staging", "Prod"]
export const BUILT = 6 // the stages that run, from the left
// The test in staging is in the Staging column; the check in prod, in the Prod one.
const AT: Record<Stage, number> = { refine: 0, plan: 1, build: 2, review: 3, staging: 4, test: 4, prod: 5, smoke: 5 }
// What a review found that stops the ticket: its blockers and majors.
export const toFix = (state: PipelineState): Finding[] => (state.stage === "review" ? (state.findings ?? []).filter(f => f.severity !== "minor") : [])
// What a test (or a check in prod) found failing: it waits for you.
export const failed = (state: PipelineState): TestResult[] =>
  state.stage === "test" || state.stage === "smoke" ? (state.results ?? []).filter(r => r.status === "fail") : []
// What it could not try (no data, no device): it waits for you to check it by hand.
export const untested = (state: PipelineState): TestResult[] =>
  state.stage === "test" || state.stage === "smoke" ? (state.results ?? []).filter(r => r.status === "untested") : []
// The stage a ticket done with its own may start now: after a review with
// something to fix, the build again; after a test with a failure, none (you look first).
const AFTER: Partial<Record<Stage, Stage>> = { refine: "plan", plan: "build", build: "review", review: "staging", staging: "test", test: "prod", prod: "smoke" }
export const nextStage = (state: PipelineState): Stage | null =>
  state.status !== "ready" || failed(state).length || untested(state).length ? null : toFix(state).length ? "build" : (AFTER[state.stage] ?? null)

export const stageAt = (state: PipelineState) => AT[state.stage]
// The column a stage is shown in: the test in staging's, the check in prod's.
export const nodeOf = (stage: Stage): Stage => (stage === "test" ? "staging" : stage === "smoke" ? "prod" : stage)
// The step of a release at work that waits for you.
export const waitingStep = (state: PipelineState): ReleaseStep | undefined =>
  state.status === "running" ? state.release?.steps.find(s => s.status === "waiting") : undefined
export const isRelease = (stage: Stage) => stage === "staging" || stage === "prod"
// A job of a specialist (lib/jobs.ts), not a ticket of the pipeline.
export const isJob = (state: PipelineState) => "loose" in state

// Done with its stage (and nothing to fix or failing), a ticket waits at the
// next one's door (its column). Checked in prod, it is done: it waits for nothing.
export const isQueued = (state: PipelineState) => state.status === "ready" && !toFix(state).length && !failed(state).length && !untested(state).length && !!AFTER[state.stage]
export const columnOf = (state: PipelineState) => {
  const next = isQueued(state) ? nextStage(state) : null
  return next ? AT[next] : stageAt(state)
}
// The tickets of each column, left to right.
export const inColumns = (states: PipelineState[]) => STAGES.map((_, i) => states.filter(s => columnOf(s) === i))

// The stages at a glance: each one's state (done, at work, waiting for you,
// failed, next, still ahead).
export type Tone = "done" | "work" | "ask" | "bad" | "next" | "todo"
export const STAGE_KEYS: Stage[] = ["refine", "plan", "build", "review", "staging", "prod"]

function toneOf(i: number, at: number, state: PipelineState): Tone {
  if (i < at) return "done"
  if (i > at) return i === at + 1 && isQueued(state) ? "next" : "todo"
  if (state.status === "failed") return "bad"
  if (state.status === "needs-info" || toFix(state).length || failed(state).length || untested(state).length || waitingStep(state)) return "ask"
  return state.status === "running" ? "work" : "done"
}
export const tonesOf = (state: PipelineState): Tone[] => STAGE_KEYS.map((_, i) => toneOf(i, stageAt(state), state))

// What runs spent, in a few characters: tokens (3.9M, 55k) and the
// API-equivalent cost ($4.10, $12).
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const dollars = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`)
export const costOf = (runs: { spend?: { cost: number } | null }[]) => runs.reduce((sum, r) => sum + (r.spend?.cost ?? 0), 0)

// The passes of a stage of the board: each run of its agent that ended, oldest first
// (Staging's are the test's; Prod's, the check's). A release is no pass.
const AGENT_OF: Partial<Record<Stage, Stage>> = { staging: "test", prod: "smoke" }
export const passesOf = (history: Run[], stage: Stage) =>
  history.filter(r => (r.stage ?? "refine") === (AGENT_OF[stage] ?? stage) && r.status !== "running")

// The release a column shows: the one about to start when it waits at that door (a fix goes to
// staging again: its own few steps, not the last release's), else the one that ran there.
export const releaseShown = (state: PipelineState, preview: Release | null, stage: Stage): Release | null => {
  const isThere = state.stage === stage || state.stage === (stage === "staging" ? "test" : stage === "prod" ? "smoke" : stage)
  if (preview?.env === stage && !isThere) return preview
  return state.release?.env === stage ? state.release : preview?.env === stage ? preview : null
}

// Staging's and prod's passes: each release there with the test (or the check) that followed it.
// A pass shows its own steps and its own results; the first of a ticket from before kept its
// steps only in what that environment runs. With a release waiting at the door, the live view is next.
export type ReleasePass = { n: number; startedAt: number; isLive: boolean; past: PipelineState | null }
export function releasePasses(state: PipelineState, stage: Stage): ReleasePass[] {
  const runs = state.history ?? []
  const agent = AGENT_OF[stage]!
  const releases = runs.filter(r => r.stage === stage && r.status !== "running")
  const isThere = state.stage === stage || state.stage === agent
  return releases.map((r, i) => {
    const next = releases[i + 1]
    const test = runs.filter(t => t.stage === agent && t.n > r.n && (!next || t.n < next.n) && t.kept?.results).at(-1)
    const release = r.kept?.release ?? (i === 0 ? state.deployed?.[stage as "staging" | "prod"] : undefined)
    const isLive = isThere && i === releases.length - 1
    const past = isLive ? null : { ...state, release: release ?? null, results: test?.kept?.results ?? [], stage: test ? agent : stage, status: "failed" as const, threads: {} }
    return { n: r.n, startedAt: r.startedAt, isLive, past }
  })
}

// What a pass carries from the passes before it of the same stage: what they
// left (pick) that this one did not leave again (by key), the latest first.
// A test again tries only what failed; a review again looks only at the fix.
function carriedOf<T>(state: PipelineState, pick: (k: Kept) => T[] | undefined, keyOf: (t: T) => string, own: T[] = []): T[] {
  const runs = (state.history ?? []).filter(r => r.stage === state.stage && r.kept && pick(r.kept))
  const at = runs.findIndex(r => pick(r.kept!) === own)
  const seen = new Set(own.map(keyOf))
  return (at >= 0 ? runs.slice(0, at) : runs).reverse().flatMap(r => pick(r.kept!)!).filter(t => !seen.has(keyOf(t)) && !!seen.add(keyOf(t)))
}
export const carriedResults = (state: PipelineState): TestResult[] => carriedOf(state, k => k.results, r => r.id, state.results)
// A review's findings from passes before that this one did not find again: fixed since.
export const carriedFindings = (state: PipelineState): Finding[] => carriedOf(state, k => k.findings, f => f.title, state.findings)

// A stage's summary in plain words, apart from what it says is still pending (its last part, under "Pendiente").
const PENDING = /^(\*\*Pendiente\b|#+\s*Pendiente\b)/m
export function summaryParts(text: string): { done: string; pending: string | null } {
  const body = text.replace(/^#\s.*\n+/, "")
  const cut = body.search(PENDING)
  return cut < 0 ? { done: body.trim(), pending: null } : { done: body.slice(0, cut).trim(), pending: body.slice(cut).trim() }
}

// ---------- the stage and its moment ----------

// The state in two words: what the stage does, or what comes next.
export const DOING: Record<Stage, string> = { refine: "Refining", plan: "Planning", build: "Building", review: "Reviewing", staging: "Deploying to staging", test: "Testing in staging", prod: "Deploying to prod", smoke: "Checking prod" }
export const NEXT: Record<Stage, string> = { refine: "Ready to plan", plan: "Ready to build", build: "Ready to review", review: "Ready for staging", staging: "Ready to test", test: "Ready for prod", prod: "Ready to check", smoke: "Live in prod" }
export const statusText = (state: PipelineState) =>
  state.status === "running" && state.release?.rollback ? `Rolling back ${state.release.env}` : toFix(state).length || failed(state).length ? "To fix" : untested(state).length ? "To check by hand" : waitingStep(state) ? "Waiting for you" : state.status === "running" ? DOING[state.stage] : state.status === "ready" ? NEXT[state.stage] : state.status === "needs-info" ? "Waiting for you" : "Failed"

// The stage and its moment in a line ("Staging · Deploying 3 of 10", "Review · Waiting for your
// answers", "Build · Fixing (2nd pass)"): a stage holds more than one moment (a release, then its
// test; a review, then your choice), and a stage run again says which pass it is.
const AT_WORK: Record<Stage, string> = { refine: "Refining", plan: "Planning", build: "Building", review: "Reviewing", staging: "Deploying", test: "Testing", prod: "Deploying", smoke: "Checking" }
const nth = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`
const passOf = (state: PipelineState) => (state.history ?? []).filter(r => r.stage === state.stage).length || 1
function releaseMoment(state: PipelineState, release: NonNullable<PipelineState["release"]>) {
  const atHand = release.steps.find(s => s.status !== "done" && s.status !== "skipped")
  if (state.status === "failed") return atHand ? `Stopped at ${atHand.id}${state.error === "Stopped by you" ? ", by you" : ""}` : (state.error ?? "Failed")
  if (release.rollback) return "Rolling back"
  if (atHand?.status === "waiting") return `Waiting for you at ${atHand.id}`
  const over = release.steps.filter(s => s.status === "done" || s.status === "skipped").length
  return `Deploying ${Math.min(over + 1, release.steps.length)} of ${release.steps.length}`
}
export function momentOf(state: PipelineState) {
  const again = passOf(state) > 1 ? ` (${nth(passOf(state))} pass)` : ""
  if ((state.stage === "staging" || state.stage === "prod") && state.release && state.status !== "ready") return releaseMoment(state, state.release)
  if (state.status === "running") return `${state.stage === "build" && state.fixing ? "Fixing" : AT_WORK[state.stage]}${again}`
  if (state.status === "needs-info") return "Waiting for your answers"
  if (state.status === "failed") return state.error ? `Failed: ${state.error}` : "Failed"
  return statusText(state)
}
export const headline = (state: PipelineState) => `${STAGES[stageAt(state)]} · ${momentOf(state)}`

// A ticket that waits for you to move: questions, a step of a release, findings to fix, a test that
// failed or left criteria to check by hand, or a run that failed.
export const waitsForYou = (state: PipelineState) =>
  state.status === "needs-info" || state.status === "failed" || toFix(state).length > 0 || failed(state).length > 0 || untested(state).length > 0 || !!waitingStep(state)
