// Where a ticket stands on the pipeline's board: the column of the stage it
// is at, or, once that stage is done, the next one's, waiting at its door.
import type { Finding, PipelineState, Stage, TestResult } from "@server/pipeline"
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
// The stage a ticket done with its own may start now: after a review with
// something to fix, the build again; after a test with a failure, none (you look first).
const AFTER: Partial<Record<Stage, Stage>> = { refine: "plan", plan: "build", build: "review", review: "staging", staging: "test", test: "prod", prod: "smoke" }
export const nextStage = (state: PipelineState): Stage | null =>
  state.status !== "ready" || failed(state).length ? null : toFix(state).length ? "build" : (AFTER[state.stage] ?? null)
export const stageAt = (state: PipelineState) => AT[state.stage]
// The step of a release at work that waits for you.
export const waitingStep = (state: PipelineState): ReleaseStep | undefined =>
  state.status === "running" ? state.release?.steps.find(s => s.status === "waiting") : undefined
export const isRelease = (stage: Stage) => stage === "staging" || stage === "prod"

// Done with its stage (and nothing to fix or failing), a ticket waits at the
// next one's door (its column). Checked in prod, it is done: it waits for nothing.
export const isQueued = (state: PipelineState) => state.status === "ready" && !toFix(state).length && !failed(state).length && !!AFTER[state.stage]
export const columnOf = (state: PipelineState) => {
  const next = isQueued(state) ? nextStage(state) : null
  return next ? AT[next] : stageAt(state)
}

// The stages at a glance: each one's state (done, at work, waiting for you,
// failed, next, still ahead) and the one fact that says what it did.
export type Tone = "done" | "work" | "ask" | "bad" | "next" | "todo"
export type JourneyNode = { stage: Stage; tone: Tone; fact: string | null }
export const STAGE_KEYS: Stage[] = ["refine", "plan", "build", "review", "staging", "prod"]
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const isOver = (s: { status: string }) => s.status === "done" || s.status === "skipped"

// A column's agent stage (the test, the check in prod) says what it found.
function testFact(state: PipelineState) {
  const results = state.results ?? []
  return state.status === "running" || !results.length ? null : `${results.filter(r => r.status === "pass").length}/${results.length} pass`
}

function factOf(stage: Stage, state: PipelineState, preview: Release | null): string | null {
  const units = state.units ?? []
  if (stage === "refine") {
    const asked = (state.history ?? []).filter(r => (r.stage ?? "refine") === "refine").reduce((n, r) => n + r.questions, 0)
    return asked ? count(asked, "decision") : "Refined"
  }
  if (stage === "plan") return count(units.length, "unit")
  if (stage === "build") return count(units.filter(u => u.pr).length, "PR")
  if (stage === "review") {
    const findings = state.findings ?? []
    const fix = toFix(state).length
    return fix ? `${fix} to fix` : findings.length ? `${findings.length} minor` : "Clean"
  }
  if (state.stage === (stage === "staging" ? "test" : "smoke")) return testFact(state)
  const release = state.release?.env === stage ? state.release : preview?.env === stage ? preview : null
  if (!release) return null
  return release === state.release ? `${release.steps.filter(isOver).length}/${release.steps.length} steps` : count(release.steps.length, "step")
}

function toneOf(i: number, at: number, state: PipelineState): Tone {
  if (i < at) return "done"
  if (i > at) return i === at + 1 && isQueued(state) ? "next" : "todo"
  if (state.status === "failed") return "bad"
  if (state.status === "needs-info" || toFix(state).length || failed(state).length || waitingStep(state)) return "ask"
  return state.status === "running" ? "work" : "done"
}

export function journeyOf(state: PipelineState, preview: Release | null): JourneyNode[] {
  const at = stageAt(state)
  return STAGE_KEYS.map((stage, i) => {
    const tone = toneOf(i, at, state)
    return { stage, tone, fact: tone === "todo" || (tone === "work" && i === at && !isRelease(stage)) ? null : factOf(stage, state, preview) }
  })
}

// What runs spent, in a few characters: tokens (3.9M, 55k) and the
// API-equivalent cost ($4.10, $12).
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const dollars = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`)
export const costOf = (runs: { spend?: { cost: number } | null }[]) => runs.reduce((sum, r) => sum + (r.spend?.cost ?? 0), 0)
