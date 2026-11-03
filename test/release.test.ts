import { describe, expect, it } from "bun:test"
import { DEFAULT_CONFIG, approveStep, deployState, isGated, nextTag, releaseSteps, reportOf, skipStep, retryStep, advanceRelease, type Ops, type Release } from "../lib/release"

const unit = (id: string, repo: string, n: number) => ({ id, repo, subtask: null, branch: `feat/${id}`, title: id, dependsOn: [], status: "done" as const, pr: `https://github.com/acme/${repo}/pull/${n}` })
const units = [unit("U1", "api-service", 7), unit("U2", "web-app", 8), unit("U3", "mobile-app", 9)]
const script = { id: "S1", unit: "U1", title: "Backfill", command: "python scripts/backfill.py", when: "", envs: [] as ("staging" | "prod")[] }
const config = { ...DEFAULT_CONFIG, repos: { "web-app": { prod: "promote:prod" }, "mobile-app": { staging: "manual:Publish the app", prod: "manual:Publish the app" } } }
const state = (extra = {}) => ({ key: "PP-1", stage: "review", status: "ready", units, scripts: [script], ...extra }) as never

describe("releaseSteps", () => {
  it("simulates the scripts first, then takes each unit to staging in the plan's order, runs the scripts for real in their place, and checks at the end", () => {
    const order = [{ kind: "manual", id: null, text: "Tell QA", envs: ["staging"] }, { kind: "unit", id: "U2", text: null, envs: [] }, { kind: "unit", id: "U1", text: null, envs: [] }, { kind: "script", id: "S1", text: null, envs: [] }, { kind: "unit", id: "U3", text: null, envs: [] }]
    const steps = releaseSteps(state({ order }), "staging", config)
    expect(steps.map(s => [s.id, s.kind, s.script ?? s.repo])).toEqual([
      ["R1", "simulate", "S1"], ["R2", "manual", null], ["R3", "merge", "web-app"], ["R4", "merge", "api-service"], ["R5", "execute", "S1"], ["R6", "manual", "mobile-app"], ["R7", "check", null],
    ])
    expect(steps[5]!.title).toBe("mobile-app: Publish the app")
    expect(steps.every(s => s.status === "pending")).toBe(true)
  })
  it("without an order, takes the units in order and then the scripts", () => {
    expect(releaseSteps(state(), "staging", config).map(s => s.kind)).toEqual(["simulate", "merge", "merge", "manual", "execute", "check"])
  })
  it("takes prod by a tag, or by the repo's own way, each repo once", () => {
    const twice = [...units, unit("U4", "api-service", 10)]
    const steps = releaseSteps(state({ units: twice, scripts: [{ ...script, envs: ["staging"] }] }), "prod", config)
    expect(steps.map(s => [s.kind, s.repo])).toEqual([["tag", "api-service"], ["promote", "web-app"], ["manual", "mobile-app"], ["check", null]])
    expect(steps[1]!.value).toBe("prod")
  })
})

describe("isGated", () => {
  it("in staging, merges and runs a script you approved on its own; in prod, everything but a simulation waits for you", () => {
    const steps = releaseSteps(state(), "staging", config)
    const [merge, simulate, execute] = ["merge", "simulate", "execute"].map(k => steps.find(s => s.kind === k))
    expect([isGated(merge!, "staging"), isGated(simulate!, "staging"), isGated(execute!, "staging")]).toEqual([false, false, false])
    expect(steps.filter(s => s.kind === "manual" || s.kind === "check").every(s => isGated(s, "staging"))).toBe(true)
    expect(releaseSteps(state(), "prod", config).every(s => s.kind === "simulate" || isGated(s, "prod"))).toBe(true)
  })
})

describe("nextTag", () => {
  it("bumps the latest version tag", () => {
    expect(nextTag(["v0.15.0", "v0.16.1", "v0.9.9", "test_1"], "minor")).toEqual({ latest: "v0.16.1", next: "v0.17.0" })
    expect(nextTag(["v1.2.3"], "patch")).toEqual({ latest: "v1.2.3", next: "v1.2.4" })
    expect(nextTag(["v1.2.3"], "major")).toEqual({ latest: "v1.2.3", next: "v2.0.0" })
    expect(nextTag(["release-1"], "minor")).toBeNull()
  })
})

describe("deployState", () => {
  const since = 1_000_000
  const run = (status: string, conclusion: string, at = since + 1000) => ({ name: "Deploy", status, conclusion, url: "https://x/run/1", createdAt: new Date(at).toISOString() })
  it("waits for a deploy to start, then for it to end", () => {
    expect(deployState([], [], since, since + 60_000).status).toBe("running")
    expect(deployState([run("in_progress", "")], [], since, since + 60_000).status).toBe("running")
    expect(deployState([run("completed", "success")], [], since, since + 60_000)).toMatchObject({ status: "done", links: [{ label: "Deploy", url: "https://x/run/1" }] })
  })
  it("fails with a failed run or deployment, and ignores the ones from before", () => {
    expect(deployState([run("completed", "failure")], [], since, since + 60_000).status).toBe("failed")
    expect(deployState([], [{ environment: "Production", state: "error", url: "https://v/1", createdAt: new Date(since + 5).toISOString() }], since, since + 60_000).status).toBe("failed")
    expect(deployState([run("completed", "failure", since - 3_600_000)], [], since, since + 60_000).status).toBe("running")
  })
  it("asks you when no deploy shows up on GitHub", () => {
    expect(deployState([], [], since, since + 20 * 60_000).status).toBe("waiting")
  })
})

describe("reportOf", () => {
  it("counts a script's report by action and result, and keeps its first rows", () => {
    const csv = `id,action,reason,before,after,result,error\nc1,write,"low, revenue","{""r"":null}","{""r"":""LOW""}",simulated,\nc2,skip,passes,,,simulated,\nc3,write,x,,,simulated,\n`
    const r = reportOf(csv, 2)
    expect(r.total).toBe(3)
    expect(r.actions).toEqual({ write: 2, skip: 1 })
    expect(r.results).toEqual({ simulated: 3 })
    expect(r.rows).toEqual([["c1", "write", "low, revenue", '{"r":null}', '{"r":"LOW"}', "simulated", ""], ["c2", "skip", "passes", "", "", "simulated", ""]])
    expect(r.text).toBe("3 records: 2 write, 1 skip")
    expect(reportOf(`id,action,reason,before,after,result,error\nc1,write,,,,written,\nc2,write,,,,error,boom\n`).text).toBe("2 records: 2 write · 1 written, 1 error")
  })
})

// A release, run with fake commands: what each step asks of GitHub and git.
function fake(answers: Record<string, string>) {
  const calls: string[] = []
  const ops: Ops = {
    sh: async cmd => {
      const line = cmd.join(" ")
      calls.push(line)
      const hit = Object.keys(answers).find(k => line.includes(k))
      return hit ? { ok: !answers[hit]!.startsWith("!"), out: answers[hit]!.replace(/^!/, ""), err: answers[hit]!.startsWith("!") ? answers[hit]!.slice(1) : "" } : { ok: true, out: "", err: "" }
    },
    now: () => 2_000_000,
    spawn: async () => 4242,
    isAlive: () => true,
    readText: async () => null,
    exists: () => true,
  }
  return { calls, ops }
}
const ctx = { key: "PP-1", summary: "A ticket", dir: "/d/PP-1", repos: "/d/repos", config, units, scripts: [script], checklist: [] }

describe("advanceRelease", () => {
  it("merges a draft PR to staging, then follows its deploy until it ends", async () => {
    const { calls, ops } = fake({
      "pr view https://github.com/acme/api-service/pull/7": JSON.stringify({ state: "OPEN", isDraft: true, mergeCommit: null }),
    })
    let release: Release = { env: "staging", steps: releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config) }
    ;({ release } = await advanceRelease(release, ctx, ops))
    expect(calls).toContain("gh pr ready https://github.com/acme/api-service/pull/7")
    expect(calls).toContain("gh pr merge https://github.com/acme/api-service/pull/7 --merge")
    expect(release.steps[0]).toMatchObject({ status: "running", phase: "deploy" })
  })
  it("stops at a step that waits for you, and goes on once you approve it", async () => {
    const { ops } = fake({})
    let release: Release = { env: "staging", steps: releaseSteps(state({ units: [], scripts: [], checklist: [{ id: "C1", text: "Ver el aviso", unit: null }] }), "staging", config) }
    let r = await advanceRelease(release, { ...ctx, checklist: [{ id: "C1", text: "Ver el aviso", unit: null }] }, ops)
    expect(r.release.steps[0]).toMatchObject({ kind: "check", status: "waiting", items: ["Ver el aviso"] })
    expect(r.isDone).toBe(false)
    r = await advanceRelease(approveStep(r.release, "R1"), ctx, ops)
    expect(r.release.steps[0]!.status).toBe("done")
    expect(r.isDone).toBe(true)
  })
  it("pushes the tag you approved, never one already there", async () => {
    const { calls, ops } = fake({ "tag --list": "v0.16.1\nv0.16.0", "rev-parse": "abc123", "log --first-parent": "Merge pull request #7\nfix: x" })
    let release: Release = { env: "prod", steps: releaseSteps(state({ units: [units[0]], scripts: [] }), "prod", config) }
    let r = await advanceRelease(release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ kind: "tag", status: "waiting", value: "v0.17.0", sha: "abc123", items: ["Merge pull request #7", "fix: x"] })
    expect(calls.some(c => c.includes("push"))).toBe(false)
    r = await advanceRelease(approveStep(r.release, "R1", "v0.16.1"), ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "failed" })
    expect(calls.some(c => c.includes("push"))).toBe(false)
    r = await advanceRelease(approveStep(retryStep(r.release, "R1"), "R1", "v0.17.0"), ctx, ops)
    expect(calls).toContain("git -C /d/repos/api-service push origin v0.17.0")
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "deploy" })
  })
  it("simulates on the PR's branch before it is deployed, then waits for you to look at it", async () => {
    const { calls, ops } = fake({})
    const files: Record<string, string> = { "/d/PP-1/scripts/S1-staging-simulate.exit": "0\n", "/d/PP-1/scripts/S1-staging-simulate.csv": "id,action,reason,before,after,result,error\nc1,write,,,,simulated,\n" }
    ops.readText = async path => files[path] ?? null
    const release: Release = { env: "staging", steps: releaseSteps(state({ units: [units[0]] }), "staging", config) }
    let r = await advanceRelease(release, ctx, ops)
    expect(calls).toContain("git -C /d/PP-1/release/api-service checkout -q --detach origin/feat/U1")
    expect(r.release.steps[0]).toMatchObject({ kind: "simulate", status: "running", report: "S1-staging-simulate.csv" })
    r = await advanceRelease(r.release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "waiting", detail: "1 records: 1 write" })
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
    r = await advanceRelease(approveStep(r.release, "R1"), ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "done", detail: "1 records: 1 write" })
    expect(calls.some(c => c.includes("pr merge"))).toBe(true)
  })
  it("fails a step whose command fails, and lets you skip it", async () => {
    const { ops } = fake({ "pr view": JSON.stringify({ state: "OPEN", isDraft: false }), "pr merge": "!not mergeable" })
    let release: Release = { env: "staging", steps: releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config) }
    const r = await advanceRelease(release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "failed", error: "not mergeable" })
    expect(r.failed).toBe("R1")
    expect(skipStep(r.release, "R1").steps[0]!.status).toBe("skipped")
  })
})
