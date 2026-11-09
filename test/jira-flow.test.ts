import { describe, expect, it } from "bun:test"
import { followInJira, movesFor, type Flow } from "../lib/jira-flow"

const flow: Flow = {
  statuses: {
    inProgress: { id: "3", name: "En curso" },
    inReview: { id: "10053", name: "En review" },
    done: { id: "10020", name: "Finalizada" },
    testing: { id: "10067", name: "Testing" },
    reopened: { id: "10351", name: "Re-abierto" },
    readyForProd: { id: "10219", name: "Listo para producción" },
  },
  subtaskType: "10003",
  fixPrefix: "[Fix]",
}
const units = [
  { id: "U1", repo: "deal-service", subtask: "PP-11", pr: "https://github.com/o/deal-service/pull/7" },
  { id: "U2", repo: "web", subtask: "PP-12", pr: null },
  { id: "U3", repo: "lib", subtask: null, pr: "https://github.com/o/lib/pull/2" },
]
const state = (extra = {}) => ({ key: "PP-10", units, fixes: ["PP-20"], results: [], ...extra }) as never

describe("movesFor", () => {
  it("a build that starts puts the plan's sub-tasks and the open fixes in progress", () => {
    expect(movesFor("build-started", state(), flow)).toEqual([
      { key: "PP-11", to: flow.statuses.inProgress },
      { key: "PP-12", to: flow.statuses.inProgress },
      { key: "PP-20", to: flow.statuses.inProgress },
    ])
  })
  it("a build done puts in review each sub-task with its PR, and says where the PR is", () => {
    expect(movesFor("built", state(), flow)).toEqual([{ key: "PP-11", to: flow.statuses.inReview, comment: "PR: https://github.com/o/deal-service/pull/7" }])
  })
  it("in staging, the sub-tasks and the fixes are done (Jira moves the story to Testing itself)", () => {
    expect(movesFor("in-staging", state(), flow).map(m => [m.key, m.to.id])).toEqual([["PP-11", "10020"], ["PP-12", "10020"], ["PP-20", "10020"]])
  })
  it("a test that passes makes the story ready for prod; one that fails reopens it", () => {
    expect(movesFor("tested", state({ results: [{ id: "T1", status: "pass" }] }), flow)).toEqual([{ key: "PP-10", to: flow.statuses.readyForProd }])
    expect(movesFor("tested", state({ results: [{ id: "T1", status: "fail" }] }), flow)).toEqual([{ key: "PP-10", to: flow.statuses.reopened }])
  })
  it("a story with no sub-tasks moves by itself: in progress, in review with its PRs, Testing once in staging", () => {
    const alone = state({ units: [{ id: "U1", repo: "web", subtask: null, pr: "https://github.com/o/web/pull/3" }], fixes: [] })
    expect(movesFor("build-started", alone, flow)).toEqual([{ key: "PP-10", to: flow.statuses.inProgress }])
    expect(movesFor("built", alone, flow)).toEqual([{ key: "PP-10", to: flow.statuses.inReview, comment: "PRs:\n- https://github.com/o/web/pull/3" }])
    expect(movesFor("in-staging", alone, flow)).toEqual([{ key: "PP-10", to: flow.statuses.testing }])
  })
  it("in prod, the story is done", () => {
    expect(movesFor("in-prod", state(), flow)).toEqual([{ key: "PP-10", to: flow.statuses.done }])
  })
})

// A Jira to follow the moves in: who has what, in which status, and what was done.
// The moves its workflow opens from each status (any, where it says nothing).
function fakeJira(issues: Record<string, { status: string; mine: boolean }>, workflow: Record<string, string[]> = {}) {
  const done: string[] = []
  const all = ["3", "10053", "10067", "10351", "10219", "10020"]
  return {
    done,
    jira: {
      issue: async (key: string) => (issues[key] ? { ...issues[key] } : null),
      open: async (key: string) => workflow[issues[key]!.status] ?? all,
      move: async (key: string, statusId: string) => void (done.push(`move ${key} ${statusId}`), (issues[key]!.status = statusId)),
      comment: async (key: string, text: string) => void done.push(`comment ${key} ${text}`),
      createSubtask: async (parent: string, summary: string) => (done.push(`create ${parent} ${summary}`), `PP-${30 + done.length}`),
    },
  }
}

describe("followInJira", () => {
  it("moves only what is yours, leaves what is already there, and says what you must move yourself", async () => {
    const { jira, done } = fakeJira({ "PP-11": { status: "3", mine: true }, "PP-12": { status: "10017", mine: false }, "PP-20": { status: "10017", mine: true } })
    const out = await followInJira("build-started", state(), flow, jira)
    expect(done).toEqual(["move PP-20 3"])
    expect(out.checks).toEqual([{ id: "jira-PP-12", label: "PP-12 is not yours: move it to En curso", status: "warn", detail: null }])
  })
  it("a failed test reopens the story and opens a [Fix] sub-task for each criterion that failed", async () => {
    const { jira, done } = fakeJira({ "PP-10": { status: "10067", mine: true } })
    const out = await followInJira("tested", state({ fixes: [], results: [{ id: "T1", criterion: "The notice says why", status: "fail" }, { id: "T2", criterion: "x", status: "pass" }] }), flow, jira)
    expect(done).toEqual(["move PP-10 10351", "create PP-10 [Fix] The notice says why"])
    expect(out.fixes).toEqual(["PP-32"])
  })
  it("where Jira opens no move straight there, it goes the team's way round, as far as it can at each step", async () => {
    const workflow = { "10017": ["3", "10053", "10067"], "10067": ["10219", "10351", "3"] }
    const { jira, done } = fakeJira({ "PP-10": { status: "10017", mine: true } }, workflow)
    await followInJira("tested", state({ results: [{ id: "T1", status: "pass" }] }), flow, jira)
    expect(done).toEqual(["move PP-10 10067", "move PP-10 10219"])
  })
  it("never stops the pipeline: what Jira refuses is a warning", async () => {
    const { jira } = fakeJira({ "PP-10": { status: "10067", mine: true } }, { "10067": ["3"] })
    const out = await followInJira("in-prod", state(), flow, jira)
    expect(out.checks).toEqual([{ id: "jira-PP-10", label: "PP-10: could not move it to Finalizada", status: "warn", detail: "No move leads there from where it is" }])
  })
})

describe("a unit with several sub-tasks", () => {
  const one = { key: "PP-2774", units: [{ id: "U1", repo: "deale-frontend", subtasks: ["PP-2795", "PP-2792", "PP-2793", "PP-2794"], pr: "https://github.com/o/fe/pull/9" }], fixes: [] } as never
  it("moves each of them, and each in review says where the PR is", () => {
    expect(movesFor("build-started", one, flow).map(m => m.key)).toEqual(["PP-2795", "PP-2792", "PP-2793", "PP-2794"])
    expect(movesFor("built", one, flow).map(m => [m.key, m.comment])).toEqual(["PP-2795", "PP-2792", "PP-2793", "PP-2794"].map(k => [k, "PR: https://github.com/o/fe/pull/9"]))
    expect(movesFor("in-staging", one, flow)).toHaveLength(4)
  })
})

describe("criteria the test could not try", () => {
  it("leave the story where it is: they are no failure, and they open no [Fix]", async () => {
    expect(movesFor("tested", state({ results: [{ id: "T1", status: "pass" }, { id: "T2", status: "untested" }] }), flow)).toEqual([])
    const { jira, done } = fakeJira({ "PP-10": { status: "10067", mine: true } })
    const out = await followInJira("tested", state({ fixes: [], results: [{ id: "T2", criterion: "x", status: "untested" }] }), flow, jira)
    expect(done).toEqual([])
    expect(out.fixes).toBeUndefined()
  })
  it("a failure with its [Fix] already open opens no other one", async () => {
    const { jira, done } = fakeJira({ "PP-10": { status: "10067", mine: true }, "PP-20": { status: "3", mine: true } })
    const results = [{ id: "T1", criterion: "Old", status: "fail" }, { id: "T2", criterion: "New", status: "fail" }]
    const out = await followInJira("tested", state({ fixes: ["PP-20"], fixOf: { T1: "PP-20" }, results }), flow, jira)
    expect(done).toEqual(["move PP-10 10351", "create PP-10 [Fix] New"])
    expect(out.fixOf).toEqual({ T1: "PP-20", T2: out.fixes!.at(-1)! })
  })
})

describe("a criterion that fails again", () => {
  it("gets a new [Fix] when its old one is already done; keeps the open one otherwise", async () => {
    const { jira, done } = fakeJira({ "PP-10": { status: "10067", mine: true }, "PP-20": { status: "10020", mine: true }, "PP-21": { status: "3", mine: true } })
    const results = [{ id: "T1", criterion: "Old", status: "fail" }, { id: "T2", criterion: "Open", status: "fail" }]
    const out = await followInJira("tested", state({ fixes: ["PP-20", "PP-21"], fixOf: { T1: "PP-20", T2: "PP-21" }, results }), flow, jira)
    expect(done).toEqual(["move PP-10 10351", "create PP-10 [Fix] Old"])
    expect(out.fixOf!.T1).not.toBe("PP-20")
    expect(out.fixOf!.T2).toBe("PP-21")
  })
})

describe("a ticket that takes in several stories (scope.ts)", () => {
  const stories = [{ key: "PP-30", subtasks: ["PP-11", "PP-12"] }, { key: "PP-40", subtasks: [] }]
  const epic = (extra = {}) => ({ key: "PP-1", units, results: [], stories, ...extra }) as never
  it("a story whose sub-tasks the plan follows moves through them; one with none moves itself", () => {
    expect(movesFor("build-started", epic(), flow)).toEqual([
      { key: "PP-11", to: flow.statuses.inProgress },
      { key: "PP-12", to: flow.statuses.inProgress },
      { key: "PP-40", to: flow.statuses.inProgress },
    ])
    expect(movesFor("in-staging", epic(), flow).map(m => [m.key, m.to.id])).toEqual([["PP-11", "10020"], ["PP-12", "10020"], ["PP-40", "10067"]])
  })
  it("each story by the results of its own criteria; prod makes them all done", () => {
    const results = [{ id: "C1", status: "fail", ticket: "PP-30" }, { id: "C2", status: "pass", ticket: "PP-40" }]
    expect(movesFor("tested", epic({ results }), flow)).toEqual([{ key: "PP-30", to: flow.statuses.reopened }, { key: "PP-40", to: flow.statuses.readyForProd }])
    expect(movesFor("in-prod", epic(), flow).map(m => m.key)).toEqual(["PP-30", "PP-40"])
  })
  it("the [Fix] of a criterion goes under its story", async () => {
    const parents: string[] = []
    const jira = { issue: async () => ({ status: "x", mine: true }), open: async () => [], move: async () => {}, comment: async () => {}, createSubtask: async (parent: string) => (parents.push(parent), `PP-9${parents.length}`) }
    await followInJira("tested", epic({ results: [{ id: "C1", status: "fail", ticket: "PP-40" }, { id: "C2", status: "fail" }] }), flow, jira)
    expect(parents).toEqual(["PP-40", "PP-30"])
  })
})
