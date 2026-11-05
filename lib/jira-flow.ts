// The ticket's Jira status, following the pipeline as a person would: a build
// that starts puts the plan's sub-tasks in progress; a PR opened puts its
// sub-task in review, with the PR's link; staging puts them done (Jira's own
// automation then moves the story to Testing). A story with no sub-tasks
// moves by itself through the same statuses. A test that passes makes the
// story ready for prod, and one that fails reopens it, with a [Fix] sub-task
// for each criterion that failed; prod makes it done.
//
// The team's statuses and names live in <data>/pipeline/stages/jira.json
// (none there, nothing moves). Only what is assigned to you moves: the rest is
// a warning that says what to move yourself. Jira never stops the pipeline:
// what it refuses is a warning too.
import type { Check } from "./checks"

export type Status = { id: string; name: string }
export type Flow = {
  statuses: Record<"inProgress" | "inReview" | "done" | "testing" | "reopened" | "readyForProd", Status>
  subtaskType: string // the sub-task's issue type id, for the [Fix] ones
  fixPrefix: string
}
export type Event = "build-started" | "built" | "in-staging" | "tested" | "in-prod"
export type Move = { key: string; to: Status; comment?: string }

type Unit = { subtask?: string | null; subtasks?: string[]; pr?: string | null }
type Result = { id: string; criterion?: string; status: "pass" | "fail" }
export type FlowState = { key: string; units?: Unit[]; fixes?: string[]; results?: Result[] }

export type Jira = {
  issue: (key: string) => Promise<{ status: string; mine: boolean } | null>
  open: (key: string) => Promise<string[]> // the statuses its workflow lets it move to now
  move: (key: string, statusId: string) => Promise<void>
  comment: (key: string, text: string) => Promise<void>
  createSubtask: (parent: string, summary: string, type: string) => Promise<string>
}

const ofUnit = (u: Unit) => [...new Set([...(u.subtasks ?? []), u.subtask].filter(Boolean))] as string[]
const subtasksOf = (state: FlowState) => [...new Set([...(state.units ?? []).flatMap(ofUnit), ...(state.fixes ?? [])])]
const failing = (state: FlowState) => (state.results ?? []).filter(r => r.status === "fail")

// A story with no sub-tasks has nothing for Jira to follow: the story itself moves.
function storyMoves(event: Event, state: FlowState, s: Flow["statuses"]): Move[] {
  const prs = (state.units ?? []).map(u => u.pr).filter(Boolean)
  if (event === "build-started") return [{ key: state.key, to: s.inProgress }]
  if (event === "built") return [{ key: state.key, to: s.inReview, ...(prs.length ? { comment: `PRs:\n${prs.map(p => `- ${p}`).join("\n")}` } : {}) }]
  return [{ key: state.key, to: s.testing }]
}

export function movesFor(event: Event, state: FlowState, flow: Flow): Move[] {
  const { statuses: s } = flow
  const isAlone = !subtasksOf(state).length && (event === "build-started" || event === "built" || event === "in-staging")
  if (isAlone) return storyMoves(event, state, s)
  if (event === "build-started") return subtasksOf(state).map(key => ({ key, to: s.inProgress }))
  if (event === "built") return (state.units ?? []).filter(u => u.pr).flatMap(u => ofUnit(u).map(key => ({ key, to: s.inReview, comment: `PR: ${u.pr}` })))
  if (event === "in-staging") return subtasksOf(state).map(key => ({ key, to: s.done }))
  if (event === "tested") return [{ key: state.key, to: failing(state).length ? s.reopened : s.readyForProd }]
  return [{ key: state.key, to: s.done }]
}

const warn = (key: string, label: string, detail: string | null = null): Check => ({ id: `jira-${key}`, label, status: "warn", detail })
const why = (err: unknown) => String((err as Error)?.message ?? err)

// The team's way, in order: where a move does not lead straight to a status,
// the ticket goes through the ones before it (a re-opened one comes from Testing).
const WAY: (keyof Flow["statuses"])[] = ["inProgress", "inReview", "testing", "readyForProd", "done"]
const before = (to: Status, flow: Flow) => {
  const at = Object.entries(flow.statuses).find(([, s]) => s.id === to.id)?.[0] as keyof Flow["statuses"] | undefined
  const end = at === "reopened" ? WAY.indexOf("testing") + 1 : WAY.indexOf(at!)
  return WAY.slice(0, Math.max(0, end)).map(k => flow.statuses[k].id)
}

// To a status: straight there if Jira opens that move, else as far along the
// way as it opens, and again from there.
async function walk(key: string, to: Status, from: string, flow: Flow, jira: Jira) {
  const way = before(to, flow)
  for (let at = from; at !== to.id; ) {
    const open = await jira.open(key)
    const next = open.includes(to.id) ? to.id : way.slice(way.indexOf(at) + 1).findLast(id => open.includes(id))
    if (!next) throw new Error("No move leads there from where it is")
    await jira.move(key, next)
    at = next
  }
}

// One move: only on what is yours, and not where it already is.
async function apply(move: Move, flow: Flow, jira: Jira): Promise<Check | null> {
  try {
    const issue = await jira.issue(move.key)
    if (!issue) return warn(move.key, `${move.key}: not found in Jira`)
    if (!issue.mine) return warn(move.key, `${move.key} is not yours: move it to ${move.to.name}`)
    if (issue.status === move.to.id) return null
    await walk(move.key, move.to, issue.status, flow, jira)
    if (move.comment) await jira.comment(move.key, move.comment)
    return null
  } catch (err) {
    return warn(move.key, `${move.key}: could not move it to ${move.to.name}`, why(err))
  }
}

// The [Fix] sub-tasks of a test that failed: one a criterion.
async function openFixes(state: FlowState, flow: Flow, jira: Jira) {
  const fixes: string[] = []
  const checks: Check[] = []
  for (const r of failing(state)) {
    try {
      fixes.push(await jira.createSubtask(state.key, `${flow.fixPrefix} ${r.criterion ?? r.id}`, flow.subtaskType))
    } catch (err) {
      checks.push(warn(`${state.key}-${r.id}`, `${state.key}: could not open the [Fix] for ${r.id}`, why(err)))
    }
  }
  return { fixes, checks }
}

export async function followInJira(event: Event, state: FlowState, flow: Flow, jira: Jira): Promise<{ checks: Check[]; fixes?: string[] }> {
  const checks: Check[] = []
  for (const move of movesFor(event, state, flow)) {
    const check = await apply(move, flow, jira)
    if (check) checks.push(check)
  }
  if (event !== "tested" || !failing(state).length) return { checks }
  const opened = await openFixes(state, flow, jira)
  return { checks: [...checks, ...opened.checks], fixes: [...(state.fixes ?? []), ...opened.fixes] }
}

// jira.json, if the team has one: else the pipeline leaves the statuses alone.
export function flowOf(text: string | null): Flow | null {
  if (!text) return null
  try {
    const data = JSON.parse(text)
    return data?.statuses && data.subtaskType ? { fixPrefix: "[Fix]", ...data } : null
  } catch {
    return null
  }
}
