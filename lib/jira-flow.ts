// The ticket's Jira status, following the pipeline as a person would: a build
// that starts puts the plan's sub-tasks in progress; a PR opened puts its
// sub-task in review, with the PR's link; staging puts them done (Jira's own
// automation then moves the story to Testing). A story with no sub-tasks
// moves by itself through the same statuses. A test that passes makes the
// story ready for prod, and one that fails reopens it, with a [Fix] sub-task
// for each criterion that failed; prod makes it done.
//
// A ticket that takes in more (scope.ts: an epic's stories of yours) moves each
// of its stories so: one whose sub-tasks the plan follows through them, any
// other by itself; each by the test's results of its own criteria, and the
// [Fix] of a criterion goes under its story.
//
// The team's statuses and names live in <data>/pipeline/stages/jira.json
// (none there, nothing moves). Only what is assigned to you moves: the rest is
// a warning that says what to move yourself. Jira never stops the pipeline:
// what it refuses is a warning too.
import type { Check } from "./checks"
import { fixParent, type Story } from "./scope"

export type Status = { id: string; name: string }
export type Flow = {
  statuses: Record<"inProgress" | "inReview" | "done" | "testing" | "reopened" | "readyForProd", Status>
  subtaskType: string // the sub-task's issue type id, for the [Fix] ones
  fixPrefix: string
}
export type Event = "build-started" | "built" | "in-staging" | "tested" | "in-prod"
export type Move = { key: string; to: Status; comment?: string }

type Unit = { subtask?: string | null; subtasks?: string[]; pr?: string | null }
type Result = { id: string; criterion?: string; status: "pass" | "fail" | "untested"; ticket?: string | null }
// fixOf: the [Fix] sub-task open for each criterion (its id), so that none gets two.
// stories: the ones that move as a story (scope.ts); none, the ticket itself.
export type FlowState = { key: string; units?: Unit[]; fixes?: string[]; fixOf?: Record<string, string>; results?: Result[]; stories?: Story[] }

export type Jira = {
  issue: (key: string) => Promise<{ status: string; mine: boolean } | null>
  open: (key: string) => Promise<string[]> // the statuses its workflow lets it move to now
  move: (key: string, statusId: string) => Promise<void>
  comment: (key: string, text: string) => Promise<void>
  createSubtask: (parent: string, summary: string, type: string) => Promise<string>
}

const ofUnit = (u: Unit) => [...new Set([...(u.subtasks ?? []), u.subtask].filter(Boolean))] as string[]
const subtasksOf = (state: FlowState) => [...new Set([...(state.units ?? []).flatMap(ofUnit), ...(state.fixes ?? [])])]
const failing = (results: Result[] = []) => results.filter(r => r.status === "fail")
// A criterion the test could not try (no data, no device) is no failure: the story waits where it is until a person checks it.
const untried = (results: Result[] = []) => results.filter(r => r.status === "untested")

// The stories that move; with none given, the ticket, with every sub-task the plan follows.
const storiesIn = (state: FlowState): Story[] => (state.stories?.length ? state.stories : [{ key: state.key, subtasks: subtasksOf(state) }])
// A story's own results: the ones of its criteria, and the ones of no story (or one not here).
const resultsOf = (story: Story, state: FlowState, stories: Story[]) =>
  (state.results ?? []).filter(r => !r.ticket || r.ticket === story.key || !stories.some(s => s.key === r.ticket))

// A story none of whose sub-tasks the plan follows has nothing for Jira to follow: it moves itself.
function aloneMoves(event: Event, keys: string[], state: FlowState, s: Flow["statuses"]): Move[] {
  const prs = (state.units ?? []).map(u => u.pr).filter(Boolean)
  const comment = prs.length ? { comment: `PRs:\n${prs.map(p => `- ${p}`).join("\n")}` } : {}
  const to = event === "build-started" ? s.inProgress : event === "built" ? s.inReview : s.testing
  return keys.map(key => ({ key, to, ...(event === "built" ? comment : {}) }))
}

function testedMoves(state: FlowState, stories: Story[], s: Flow["statuses"]): Move[] {
  return stories.flatMap(story => {
    const own = resultsOf(story, state, stories)
    return failing(own).length ? [{ key: story.key, to: s.reopened }] : untried(own).length ? [] : [{ key: story.key, to: s.readyForProd }]
  })
}

export function movesFor(event: Event, state: FlowState, flow: Flow): Move[] {
  const { statuses: s } = flow
  const stories = storiesIn(state)
  if (event === "tested") return testedMoves(state, stories, s)
  if (event === "in-prod") return stories.map(st => ({ key: st.key, to: s.done }))
  const planned = new Set(subtasksOf(state))
  const alone = aloneMoves(event, stories.filter(st => !st.subtasks.some(k => planned.has(k))).map(st => st.key), state, s)
  if (event === "build-started") return [...[...planned].map(key => ({ key, to: s.inProgress })), ...alone]
  if (event === "built") return [...(state.units ?? []).filter(u => u.pr).flatMap(u => ofUnit(u).map(key => ({ key, to: s.inReview, comment: `PR: ${u.pr}` }))), ...alone]
  return [...[...planned].map(key => ({ key, to: s.done })), ...alone]
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

// The [Fix] sub-tasks of a test that failed: one a criterion, never a second one.
async function openFixes(state: FlowState, flow: Flow, jira: Jira) {
  const fixes: string[] = []
  const fixOf = { ...state.fixOf }
  const checks: Check[] = []
  const stories = storiesIn(state)
  for (const r of failing(state.results)) {
    // Its [Fix] still open is the one; one done (it failed again) or gone gets a new one.
    // Jira not answering keeps it: better none new than a second one.
    const old = fixOf[r.id] ? await jira.issue(fixOf[r.id]!).then(i => i ?? "gone", () => "unknown" as const) : "gone"
    if (old === "unknown" || (old !== "gone" && old.status !== flow.statuses.done.id)) continue
    try {
      const key = await jira.createSubtask(fixParent(r.ticket, stories) ?? state.key, `${flow.fixPrefix} ${r.criterion ?? r.id}`, flow.subtaskType)
      fixes.push(key)
      fixOf[r.id] = key
    } catch (err) {
      checks.push(warn(`${state.key}-${r.id}`, `${state.key}: could not open the [Fix] for ${r.id}`, why(err)))
    }
  }
  return { fixes, fixOf, checks }
}

export async function followInJira(event: Event, state: FlowState, flow: Flow, jira: Jira): Promise<{ checks: Check[]; fixes?: string[]; fixOf?: Record<string, string> }> {
  const checks: Check[] = []
  for (const move of movesFor(event, state, flow)) {
    const check = await apply(move, flow, jira)
    if (check) checks.push(check)
  }
  if (event !== "tested" || !failing(state.results).length) return { checks }
  const opened = await openFixes(state, flow, jira)
  return { checks: [...checks, ...opened.checks], fixes: [...(state.fixes ?? []), ...opened.fixes], fixOf: opened.fixOf }
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
