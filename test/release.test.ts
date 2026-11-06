import { describe, expect, it } from "bun:test"
import { conflictsPrompt } from "../lib/conflicts"
import { DEFAULT_CONFIG, rollbackSteps, approveStep, deployState, isGated, nextTag, releaseSteps, reportOf, skipStep, retryStep, advanceRelease, type Ops, type Release } from "../lib/release"

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
      ["R1", "simulate", "S1"], ["R2", "manual", null], ["R3", "merge", "web-app"], ["R4", "merge", "api-service"], ["R5", "execute", "S1"], ["R6", "manual", "mobile-app"],
    ])
    expect(steps[5]!.title).toBe("mobile-app: Publish the app")
    expect(steps.every(s => s.status === "pending")).toBe(true)
  })
  it("without an order, takes the units in order and then the scripts", () => {
    expect(releaseSteps(state(), "staging", config).map(s => s.kind)).toEqual(["simulate", "merge", "merge", "manual", "execute"])
  })
  it("leaves out a repo whose way to an environment is to skip it", () => {
    const skips = { ...config, repos: { ...config.repos, "web-app": { staging: "skip", prod: "merge" } } }
    expect(releaseSteps(state({ scripts: [] }), "staging", skips).map(s => s.repo)).toEqual(["api-service", "mobile-app"])
    expect(releaseSteps(state({ scripts: [] }), "prod", skips).map(s => [s.kind, s.repo])).toEqual([["tag", "api-service"], ["merge", "web-app"], ["manual", "mobile-app"]])
  })
  it("runs a repo's own command after its merge: rehearsed first (a dry run that waits for a look), then for real", () => {
    const ota = { ...config, repos: { ...config.repos, "mobile-app": { staging: ["merge-only", 'command:pnpm update:preview --message "{key}: {summary}"'] } } }
    const steps = releaseSteps(state({ units: [units[2]], scripts: [], summary: 'Un "aviso" $nuevo' }), "staging", ota as never)
    expect(steps.map(s => [s.kind, s.repo, s.value])).toEqual([
      ["merge", "mobile-app", "no-deploy"],
      ["simulate", "mobile-app", 'pnpm update:preview --message "PP-1: Un aviso nuevo" --dry-run'],
      ["execute", "mobile-app", 'pnpm update:preview --message "PP-1: Un aviso nuevo"'],
    ])
    expect(steps[1]!.title).toBe("mobile-app: pnpm update:preview (dry run)")
  })
  it("takes prod by a tag, or by the repo's own way, each repo once", () => {
    const twice = [...units, unit("U4", "api-service", 10)]
    const steps = releaseSteps(state({ units: twice, scripts: [{ ...script, envs: ["staging"] }] }), "prod", config)
    expect(steps.map(s => [s.kind, s.repo])).toEqual([["tag", "api-service"], ["promote", "web-app"], ["manual", "mobile-app"]])
    expect(steps[1]!.value).toBe("prod")
  })
})

describe("isGated", () => {
  it("in staging, merges and runs a script you approved on its own; in prod, everything but a simulation waits for you", () => {
    const steps = releaseSteps(state(), "staging", config)
    const [merge, simulate, execute] = ["merge", "simulate", "execute"].map(k => steps.find(s => s.kind === k))
    expect([isGated(merge!, "staging"), isGated(simulate!, "staging"), isGated(execute!, "staging")]).toEqual([false, false, false])
    expect(steps.filter(s => s.kind === "manual").every(s => isGated(s, "staging"))).toBe(true)
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
    agent: async () => 4343,
    isAlive: () => true,
    readText: async () => null,
    exists: () => true,
    secret: async () => null,
  }
  return { calls, ops }
}
const ctx = { key: "PP-1", summary: "A ticket", dir: "/d/PP-1", repos: "/d/repos", stages: "/d/stages", config, units, scripts: [script], checklist: [] }

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
    const order = [{ kind: "manual", id: null, text: "Tell QA", envs: [] }]
    let release: Release = { env: "staging", steps: releaseSteps(state({ units: [], scripts: [], order }), "staging", config) }
    let r = await advanceRelease(release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ kind: "manual", status: "waiting", title: "Tell QA" })
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
  it("rehearses a repo's command on its default branch, with its secrets, and waits for a look", async () => {
    const { calls, ops } = fake({})
    let spawned: { cwd: string; line: string; env: Record<string, string> } | null = null
    ops.spawn = async (cwd, line, env) => ((spawned = { cwd, line, env }), 7)
    ops.secret = async name => (name === "agent-center-expo" ? "tok" : null)
    const files: Record<string, string> = { "/d/PP-1/scripts/mobile-app-staging-simulate.exit": "0\n", "/d/PP-1/scripts/mobile-app-staging-simulate.log": "checks ok\nwould publish preview\n" }
    ops.readText = async path => files[path] ?? null
    const ota = { ...config, repos: { "mobile-app": { staging: ["command:pnpm update:preview"] } }, secrets: { "mobile-app": { EXPO_TOKEN: "keychain:agent-center-expo" } } }
    const release: Release = { env: "staging", steps: releaseSteps(state({ units: [units[2]], scripts: [] }), "staging", ota as never) }
    let r = await advanceRelease(release, { ...ctx, config: ota as never }, ops)
    expect(calls).toContain("git -C /d/repos/mobile-app checkout -q master")
    expect(spawned).toMatchObject({ cwd: "/d/repos/mobile-app", env: { EXPO_TOKEN: "tok" } })
    expect(spawned!.line.endsWith("pnpm update:preview --dry-run")).toBe(true)
    r = await advanceRelease(r.release, { ...ctx, config: ota as never }, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "waiting", detail: "would publish preview" })
  })
  it("merges a repo whose merge deploys nothing, and goes on without waiting for a deploy", async () => {
    const { ops } = fake({ "pr view": JSON.stringify({ state: "MERGED", mergeCommit: { oid: "abc" }, mergedAt: "2026-11-04T10:00:00Z" }) })
    const only = { ...config, repos: { "mobile-app": { staging: "merge-only" } } }
    const release: Release = { env: "staging", steps: releaseSteps(state({ units: [units[2]], scripts: [] }), "staging", only as never) }
    const r = await advanceRelease(release, { ...ctx, config: only as never }, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "done", detail: "Merged" })
    expect(r.isDone).toBe(true)
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

describe("rollbackSteps", () => {
  const done = (kind: string, repo: string | null, extra = {}) => ({ id: "", kind, title: `${repo}: ${kind}`, unit: repo === "api-service" ? "U1" : repo === "web-app" ? "U2" : "U3", repo, script: null, status: "done", isApproved: true, detail: null, items: [], links: [], value: null, sha: "m1", since: 1, phase: null, pid: null, report: null, error: null, ...extra }) as never
  it("undoes a release to staging the other way round: each merge reverted, and what only a person can undo said", () => {
    const staging = { env: "staging", steps: [done("simulate", "api-service", { script: "S1" }), done("manual", null), done("merge", "api-service", { sha: "aaa" }), done("execute", "api-service", { script: "S1", title: "Backfill: run for real", report: "S1-staging-execute.csv" }), done("merge", "mobile-app", { sha: "bbb", value: "no-deploy" }), done("execute", "mobile-app", { value: "pnpm update:preview" }), { ...(done("merge", "web-app") as object), status: "skipped" }] } as never
    const steps = rollbackSteps(staging, { ...config, undo: { "mobile-app": "eas update:republish of the group before" } } as never)
    expect(steps.map(s => [s.id, s.kind, s.repo, s.sha ?? s.value])).toEqual([
      ["R1", "manual", "mobile-app", null],
      ["R2", "revert", "mobile-app", "bbb"],
      ["R3", "manual", "api-service", null],
      ["R4", "revert", "api-service", "aaa"],
    ])
    expect(steps[0]!.title).toContain("eas update:republish")
    expect(steps[2]!.title).toContain("S1-staging-execute.csv")
    expect(steps[1]!.value).toBe("no-deploy")
  })
  it("undoes a release to prod by deploying the tag before again, and says how to undo a release PR", () => {
    const prod = { env: "prod", steps: [done("tag", "api-service", { value: "v0.17.0", previous: "v0.16.1" }), done("promote", "web-app", { value: "prod" })] } as never
    expect(rollbackSteps(prod, config).map(s => [s.kind, s.repo, s.value])).toEqual([["manual", "web-app", null], ["redeploy", "api-service", "v0.16.1"]])
  })
})

describe("rolling back", () => {
  it("reverts a merge by a revert PR it merges, then follows its deploy", async () => {
    const { calls, ops } = fake({
      "pr view https://github.com/acme/api-service/pull/7 --json id": JSON.stringify({ id: "PR_1" }),
      "revertPullRequest": JSON.stringify({ data: { revertPullRequest: { revertPullRequest: { url: "https://github.com/acme/api-service/pull/9" } } } }),
      "pr view https://github.com/acme/api-service/pull/9": JSON.stringify({ state: "MERGED", mergeCommit: { oid: "rev" }, mergedAt: "2026-11-04T10:00:00Z" }),
    })
    const release: Release = { env: "staging", rollback: true, steps: [{ ...releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config)[0]!, kind: "revert", sha: "aaa", title: "api-service: revert" }] }
    const r = await advanceRelease(release, ctx, ops)
    expect(calls).toContain("gh pr merge https://github.com/acme/api-service/pull/9 --merge")
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "deploy", sha: "rev" })
  })
  it("deploys the tag before again by rerunning its last good run, and waits for it", async () => {
    const { calls, ops } = fake({ "run list": JSON.stringify([{ databaseId: 55 }]), "run view 55": JSON.stringify({ status: "in_progress", conclusion: "", attempt: 2, url: "https://x/run/55" }) })
    const step = { ...releaseSteps(state({ units: [units[0]], scripts: [] }), "prod", config)[0]!, kind: "redeploy" as const, value: "v0.16.1", isApproved: true, title: "api-service: deploy v0.16.1 again" }
    let r = await advanceRelease({ env: "prod", rollback: true, steps: [step] }, ctx, ops)
    expect(calls).toContain("gh run list -R acme/api-service --branch v0.16.1 --status success -L 1 --json databaseId")
    expect(calls).toContain("gh run rerun 55 -R acme/api-service")
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "rerun" })
    r = await advanceRelease(r.release, ctx, ops)
    expect(r.release.steps[0]!.status).toBe("running")
  })
})

describe("a PR with conflicts", () => {
  const view = (mergeable: string) => JSON.stringify({ state: "OPEN", isDraft: false, mergeable, headRefName: "feat/U1", baseRefName: "master" })
  const start = () => ({ env: "staging", steps: releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config) }) as Release
  it("hands them to an agent instead of failing, and merges once it resolved them", async () => {
    const answers: Record<string, string> = { "pr view": view("CONFLICTING") }
    const { calls, ops } = fake(answers)
    let prompt = ""
    ops.agent = async (_dir, text) => ((prompt = text), 77)
    let r = await advanceRelease(start(), ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "conflicts", pid: 77, attempts: 1 })
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
    expect(prompt).toContain("feat/U1")
    expect(prompt).toContain("/d/PP-1/conflicts/R1-1.json")
    r = await advanceRelease(r.release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "conflicts" })
    ops.readText = async path => (path === "/d/PP-1/conflicts/R1-1.json" ? `{"resolved": true, "reason": "Kept both"}` : null)
    answers["pr view"] = view("MERGEABLE")
    r = await advanceRelease(r.release, ctx, ops)
    r = await advanceRelease(r.release, ctx, ops)
    expect(calls).toContain("gh pr merge https://github.com/acme/api-service/pull/7 --merge")
  })
  it("stops when the agent could not resolve them, or ended without a word, saying why", async () => {
    const { ops } = fake({ "pr view": view("CONFLICTING") })
    ops.agent = async () => 77
    const running = (await advanceRelease(start(), ctx, ops)).release
    ops.readText = async () => `{"resolved": false, "reason": "Which copy wins is a product decision"}`
    expect((await advanceRelease(running, ctx, ops)).release.steps[0]).toMatchObject({ status: "failed", error: "Conflicts not resolved: Which copy wins is a product decision" })
    ops.readText = async () => null
    ops.isAlive = () => false
    expect((await advanceRelease(running, ctx, ops)).release.steps[0]).toMatchObject({ status: "failed" })
  })
  it("never hands the same conflicts to an agent twice; Retry lets it try again", async () => {
    const { ops } = fake({ "pr view": view("CONFLICTING") })
    ops.agent = async () => 77
    const again = { ...start(), steps: start().steps.map(s => ({ ...s, attempts: 1 })) }
    const r = await advanceRelease(again, ctx, ops)
    expect(r.release.steps[0]!.status).toBe("failed")
    expect(retryStep(r.release, "R1").steps[0]!.attempts).toBe(0)
  })
  it("waits while GitHub works out whether it merges", async () => {
    const { calls, ops } = fake({ "pr view": view("UNKNOWN") })
    const r = await advanceRelease(start(), ctx, ops)
    expect(r.release.steps[0]!.status).toBe("pending")
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
  })
})

describe("conflictsPrompt", () => {
  it("works on a branch of its own (the PR's may be open in the build's worktree), pushes to the PR's, and cleans up", () => {
    const text = conflictsPrompt("PP-1", "staging", { url: "https://github.com/o/api/pull/7", repo: "api", head: "feat/x", base: "master" }, { dir: "/d/PP-1", clone: "/r/api", stages: "/s", answer: "/d/PP-1/conflicts/R1-1.json" })
    expect(text).toContain("worktree add -b conflicts/PP-1-7 /d/PP-1/conflicts/api-7 origin/feat/x")
    expect(text).toContain("git push origin HEAD:feat/x")
    expect(text).toContain("branch -D conflicts/PP-1-7")
    expect(text).toContain("Nunca rebase, nunca --force")
  })
})
