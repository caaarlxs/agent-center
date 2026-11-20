import { describe, expect, it } from "bun:test"
import { conflictsPrompt } from "../lib/conflicts"
import { DEFAULT_CONFIG, setupFor, rollbackSteps, approveStep, deployState, isGated, nextTag, releaseSteps, reportOf, seenDone, manualStep, skipStep, unskipStep, addressStep, relookStep, outcomesIn, laterIn, itemOf, itemsOf, retryStep, stopRelease, advanceRelease, type Ops, type Release, rollupOf } from "../lib/release"

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

describe("a person's step", () => {
  const why = { why: "Meta approves every template", how: ["Open WhatsApp Manager", "Send the three"], done: "Meta lists them", check: null }
  const order = [{ kind: "manual", id: null, text: "Ask Meta", envs: ["staging"], note: why }, { kind: "unit", id: "U1", text: null, envs: [] }, { kind: "manual", id: null, text: "Tell sales", envs: ["prod"] }] as never
  it("carries the plan's note, with an id by its place among the person's steps, the same in each environment", () => {
    expect(releaseSteps(state({ order, scripts: [] }), "staging", config)[0]!.note).toEqual({ id: "M1", ...why })
    expect(releaseSteps(state({ order, scripts: [] }), "prod", config).find(s => s.kind === "manual")!.note).toEqual({ id: "M2", why: null, how: [], done: null, check: null })
    expect(manualStep(order, "M2")?.text).toBe("Tell sales")
  })
  it("is seen done by its tag (that one, or the lowest above a version) or by its PR merged", async () => {
    const { ops } = fake({ "repos/acme/lib/tags": "v1.42.0\nv1.41.0\nv1.40.1", "pr view https://github.com/acme/api/pull/3": "MERGED", "pr view https://github.com/acme/api/pull/4": "OPEN" })
    expect(await seenDone({ tag: { repo: "acme/lib", name: null, above: "v1.40.1" } }, ops.sh)).toBe("Done: v1.41.0 is on acme/lib")
    expect(await seenDone({ tag: { repo: "acme/lib", name: "v1.43.0", above: null } }, ops.sh)).toBeNull()
    expect(await seenDone({ tag: { repo: "acme/lib", name: null, above: "v1.42.0" } }, ops.sh)).toBeNull()
    expect(await seenDone({ merged: "https://github.com/acme/api/pull/3" }, ops.sh)).toBe("Done: PR #3 is merged")
    expect(await seenDone({ merged: "https://github.com/acme/api/pull/4" }, ops.sh)).toBeNull()
  })
  it("goes by itself once the board sees it done; until then it waits, looked at again a minute later", async () => {
    const check = { ...why, check: { merged: "https://github.com/acme/api/pull/3" } }
    const one = [{ kind: "manual", id: null, text: "Merge the lib", envs: [], note: check }] as never
    const steps = releaseSteps(state({ order: one, units: [], scripts: [] }), "staging", config)
    const open = fake({ "pull/3": "OPEN" })
    let r = await advanceRelease({ env: "staging", steps }, ctx, open.ops)
    expect(r.release.steps[0]).toMatchObject({ status: "waiting", seenAt: 2_000_000 })
    r = await advanceRelease(r.release, ctx, open.ops)
    expect(open.calls.filter(c => c.includes("pull/3"))).toHaveLength(1)
    const merged = fake({ "pull/3": "MERGED" })
    r = await advanceRelease(r.release, ctx, { ...merged.ops, now: () => 2_060_000 })
    expect(r.release.steps[0]).toMatchObject({ status: "done", detail: "Done: PR #3 is merged" })
    expect(r.isDone).toBe(true)
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
  it("a tag taken meanwhile is chosen again on Retry: the next one, waiting for you", async () => {
    const { ops } = fake({ "tag --list": "v0.17.0\nv0.16.1", "rev-parse": "abc123", "rev-list -n 1 v0.17.0": "other" })
    const release: Release = { env: "prod", steps: [{ ...releaseSteps(state({ units: [units[0]], scripts: [] }), "prod", config)[0]!, status: "pending", isApproved: true, value: "v0.17.0", sha: "abc123" }] }
    let r = await advanceRelease(release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "failed", error: "v0.17.0 is already there, on another commit" })
    r = await advanceRelease(retryStep(r.release, "R1"), ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "waiting", value: "v0.18.0" })
  })
  it("a tag already there on its own commit goes on to its deploy, without pushing again", async () => {
    const { calls, ops } = fake({ "tag --list": "v0.17.0", "rev-list -n 1 v0.17.0": "abc123" })
    const release: Release = { env: "prod", steps: [{ ...releaseSteps(state({ units: [units[0]], scripts: [] }), "prod", config)[0]!, status: "pending", isApproved: true, value: "v0.17.0", sha: "abc123" }] }
    const r = await advanceRelease(release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "deploy" })
    expect(calls.some(c => c.includes("push"))).toBe(false)
  })
  it("a release PR with no checks at all merges a while after it opened", async () => {
    const pr = "https://github.com/acme/web-app/pull/99"
    const step = { ...releaseSteps(state({ units: [units[1]], scripts: [] }), "prod", config)[0]!, status: "running" as const, phase: "checks" as const, since: 1_000_000, links: [{ label: "Release PR #99", url: pr }] }
    const { calls, ops } = fake({ [`pr view ${pr} --json state`]: JSON.stringify({ state: "OPEN", statusCheckRollup: [] }) })
    let r = await advanceRelease({ env: "prod", steps: [{ ...step, since: 1_900_000 }] }, ctx, ops)
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
    r = await advanceRelease({ env: "prod", steps: [step] }, ctx, ops)
    expect(calls).toContain(`gh pr merge ${pr} --merge`)
    expect(r.release.steps[0]).toMatchObject({ phase: "deploy" })
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
  it("leaves a step still to come out of the release, while an earlier one goes on; never one that ran", async () => {
    const { ops } = fake({ "pr view": JSON.stringify({ state: "OPEN", isDraft: false }) })
    const release: Release = { env: "staging", steps: releaseSteps(state({ units: [units[0], units[1]], scripts: [] }), "staging", config) }
    const r = await advanceRelease(release, ctx, ops)
    expect(r.release.steps.map(s => s.status)).toEqual(["running", "pending"])
    expect(skipStep(r.release, "R2").steps.map(s => s.status)).toEqual(["running", "skipped"])
    const ran = { ...r.release, steps: r.release.steps.map(s => ({ ...s, status: "done" as const })) }
    expect(() => skipStep(ran, "R1")).toThrow("Only the step at hand, or one still to come, can be skipped")
  })
  it("puts a step you left out back in while the release has not got past it", async () => {
    const { ops } = fake({ "pr view": JSON.stringify({ state: "OPEN", isDraft: false }) })
    const r = await advanceRelease({ env: "staging", steps: releaseSteps(state({ units: [units[0], units[1]], scripts: [] }), "staging", config) }, ctx, ops)
    const left = skipStep(r.release, "R2")
    expect(unskipStep(left, "R2").steps[1]!.status).toBe("pending")
    const passed = { ...left, steps: left.steps.map(s => (s.id === "R1" ? { ...s, status: "done" as const } : s)) }
    expect(() => unskipStep(passed, "R2")).toThrow("The release got past that step")
    expect(() => unskipStep(r.release, "R1")).toThrow("The release got past that step")
  })
  it("says a PR closed on GitHub is closed: no agent on its conflicts, no merge", async () => {
    const { calls, ops } = fake({ "pr view": JSON.stringify({ state: "CLOSED", isDraft: true, mergeable: "CONFLICTING" }) })
    const r = await advanceRelease({ env: "staging", steps: releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config) }, ctx, { ...ops, agent: async () => { throw new Error("no agent") } })
    expect(r.release.steps[0]).toMatchObject({ status: "failed", error: "PR #7 was closed on GitHub: Skip this step if it is not needed, or reopen the PR and Retry" })
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
  })
  it("waits for the agent you sent to a PR's conflicts: never a second one on its branch", async () => {
    const { calls, ops } = fake({ "pr view": JSON.stringify({ state: "OPEN", isDraft: false, mergeable: "CONFLICTING", headRefName: "feat/U1", baseRefName: "main" }) })
    const steps = releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config)
    const r = await advanceRelease({ env: "staging", steps }, ctx, { ...ops, isFixing: async () => true, agent: async () => { throw new Error("no second agent") } })
    expect(r.release.steps[0]).toMatchObject({ status: "pending", detail: "An agent resolves its conflicts (Resolve conflicts): waiting for it" })
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
  })
})

describe("rollbackSteps", () => {
  const done = (kind: string, repo: string | null, extra = {}) => ({ id: "", kind, title: `${repo}: ${kind}`, unit: repo === "api-service" ? "U1" : repo === "web-app" ? "U2" : "U3", repo, script: null, status: "done", isApproved: true, detail: null, items: [], links: [], value: null, sha: "m1", since: 1, phase: null, pid: null, report: null, error: null, ...extra }) as never
  it("undoes a release to staging the other way round: each merge reverted, and what only a person can undo said", () => {
    const staging = { env: "staging", steps: [done("simulate", "api-service", { script: "S1" }), done("manual", null), done("merge", "api-service", { sha: "aaa" }), done("execute", "api-service", { script: "S1", title: "Backfill: run for real", report: "S1-staging-execute.csv" }), done("merge", "mobile-app", { sha: "bbb", value: "no-deploy" }), done("execute", "mobile-app", { value: "pnpm update:preview" }), { ...(done("merge", "web-app") as object), status: "skipped", sha: null }] } as never
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
    expect(prompt).toContain("/d/PP-1/conflicts/0-R1-1.json")
    r = await advanceRelease(r.release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "conflicts" })
    ops.readText = async path => (path === "/d/PP-1/conflicts/0-R1-1.json" ? `{"resolved": true, "reason": "Kept both"}` : null)
    answers["pr view"] = JSON.stringify({ ...JSON.parse(view("MERGEABLE")), statusCheckRollup: [{ conclusion: "SUCCESS" }] })
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

describe("stopRelease", () => {
  it("fails the step at hand, with what it started to end", () => {
    const release = { env: "prod", steps: [{ id: "R1", status: "done" }, { id: "R2", status: "running", phase: "script", pid: 77 }, { id: "R3", status: "pending" }] } as never
    const { release: stopped, pid } = stopRelease(release)
    expect(pid).toBe(77)
    expect(stopped.steps.map(s => s.status)).toEqual(["done", "failed", "pending"])
    expect(stopped.steps[1]).toMatchObject({ error: "Stopped by you", pid: null })
    expect(() => stopRelease({ env: "prod", steps: [{ id: "R1", status: "done" }] } as never)).toThrow()
  })
})

describe("conflictsPrompt", () => {
  it("works on a branch of its own (the PR's may be open in the build's worktree), pushes to the PR's, and cleans up", () => {
    const text = conflictsPrompt("PP-1", "el merge del release de PP-1 a staging", { url: "https://github.com/o/api/pull/7", repo: "api", head: "feat/x", base: "master" }, { dir: "/d/PP-1", clone: "/r/api", stages: "/s", answer: "/d/PP-1/conflicts/R1-1.json" })
    expect(text).toContain("worktree add -b conflicts/PP-1-7 /d/PP-1/conflicts/api-7 origin/feat/x")
    expect(text).toContain("git push origin HEAD:feat/x")
    expect(text).toContain("branch -D conflicts/PP-1-7")
    expect(text).toContain("Nunca rebase, nunca --force")
    expect(text).toContain("antes de el merge del release de PP-1 a staging")
  })
})

describe("a release after a fix", () => {
  const shipped = { env: "staging", steps: [{ id: "R1", kind: "merge", unit: "U1", repo: "api-service", status: "done" }] } as never
  it("takes the fix's new units after the plan's order, and leaves out what that environment already runs", () => {
    const fix = { id: "X1", repo: "api-service", subtask: null, subtasks: ["PP-9"], branch: "fix/PP-1-CA3", title: "Fix", dependsOn: [], status: "done", pr: "https://github.com/acme/api-service/pull/8" }
    const s = state({ units: [units[0], fix], scripts: [], order: [{ kind: "unit", id: "U1", text: null, envs: [] }], deployed: { staging: shipped } })
    expect(releaseSteps(s, "staging", config).map(x => x.unit)).toEqual(["X1"])
  })
})

describe("what reaches prod", () => {
  it("a release PR merges only once its checks are there and pass; one that needs a person fails", () => {
    expect(rollupOf([])).toBe("pending")
    expect(rollupOf([{ conclusion: "SUCCESS" }, { state: "SKIPPED" }])).toBe("pass")
    expect(rollupOf([{ conclusion: "SUCCESS" }, { status: "IN_PROGRESS" }])).toBe("pending")
    expect(rollupOf([{ conclusion: "ACTION_REQUIRED" }])).toBe("fail")
    expect(rollupOf([{ conclusion: "STARTUP_FAILURE" }])).toBe("fail")
  })
  it("tags what staging ran for that repo, not the default branch's head", async () => {
    const { calls, ops } = fake({ "tag --list": "v0.16.1", "log --first-parent": "Merge pull request #7" })
    const release: Release = { env: "prod", steps: releaseSteps(state({ units: [units[0]], scripts: [] }), "prod", config) }
    const r = await advanceRelease(release, { ...ctx, tested: { "api-service": "sha-in-staging" } }, ops)
    expect(r.release.steps[0]).toMatchObject({ kind: "tag", status: "waiting", sha: "sha-in-staging" })
    expect(calls.some(c => c.includes("rev-parse origin/HEAD"))).toBe(false)
  })
  it("a merge after an agent resolved its conflicts waits for the PR's checks", async () => {
    const view = (rollup: unknown[]) => JSON.stringify({ state: "OPEN", isDraft: false, mergeable: "MERGEABLE", statusCheckRollup: rollup })
    const answers: Record<string, string> = { "pr view": view([{ status: "IN_PROGRESS" }]) }
    const { calls, ops } = fake(answers)
    const resolved: Release = { env: "staging", steps: releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config).map(s => ({ ...s, attempts: 1 })) }
    let r = await advanceRelease(resolved, ctx, ops)
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
    expect(r.release.steps[0]!.status).toBe("pending")
    answers["pr view"] = view([{ conclusion: "SUCCESS" }])
    r = await advanceRelease(r.release, ctx, ops)
    expect(calls.some(c => c.includes("pr merge"))).toBe(true)
  })
  it("a repo's own command runs once a release, however many of its units go", () => {
    const ota = { ...config, repos: { "mobile-app": { staging: ["command:pnpm update:preview"] } } }
    const two = [units[2], { ...units[2], id: "U4", pr: "https://github.com/acme/mobile-app/pull/10" }]
    const steps = releaseSteps(state({ units: two, scripts: [] }), "staging", ota as never)
    expect(steps.filter(s => s.kind === "execute")).toHaveLength(1)
  })
})

describe("a repo's command rehearsed", () => {
  const ota = (dryRun?: unknown) => ({ ...config, repos: { "mobile-app": { staging: ["command:pnpm update:preview"] } }, ...(dryRun === undefined ? {} : { dryRun: { "mobile-app": dryRun } }) }) as never
  const first = (c: never) => releaseSteps(state({ units: [units[2]], scripts: [] }), "staging", c)[0]!
  it("with --dry-run by default, the repo's own rehearsal, or a person where it has none", () => {
    expect(first(ota())).toMatchObject({ kind: "simulate", value: "pnpm update:preview --dry-run" })
    expect(first(ota("pnpm update:preview:check"))).toMatchObject({ kind: "simulate", value: "pnpm update:preview:check" })
    expect(first(ota(false)).kind).toBe("manual")
  })
})

describe("a rollback", () => {
  it("undoes a merge that went even if its deploy failed or was skipped past", () => {
    const steps = [{ id: "R1", kind: "merge", unit: "U1", repo: "api-service", status: "failed", sha: "abc", links: [], value: null }, { id: "R2", kind: "merge", unit: "U2", repo: "web-app", status: "skipped", sha: null, links: [], value: null }]
    expect(rollbackSteps({ env: "staging", steps } as never, config).map(s => s.kind)).toEqual(["revert"])
  })
})

describe("a release after a Send back", () => {
  it("takes only what that environment does not have: no tag again, no manual step again", () => {
    const u1 = { id: "U1", repo: "api-service", subtask: null, branch: "b", title: "t", dependsOn: [], status: "done" as const, pr: "https://github.com/acme/api-service/pull/1" }
    const x1 = { ...u1, id: "X1", pr: "https://github.com/acme/api-service/pull/9" }
    const prod = { env: "prod" as const, steps: [
      { ...releaseSteps(state({ units: [u1], scripts: [] }), "prod", config)[0]!, status: "done" as const },
      { id: "M", kind: "manual" as const, title: "Turn the flag on", unit: null, repo: null, script: null, status: "done" as const, isApproved: true, detail: null, items: [], links: [], value: null, sha: null, since: null, phase: null, pid: null, report: null, error: null },
    ] }
    const s = state({ units: [u1, x1], scripts: [], order: [{ kind: "manual", id: null, text: "Turn the flag on", envs: [] }, { kind: "unit", id: "U1", text: null, envs: [] }], deployed: { prod } })
    expect(releaseSteps(s, "prod", config).map(x => x.unit ?? x.title)).toEqual(["X1"])
  })
})

describe("what a script needs ready", () => {
  it("a Python script, the venv only; a Node command, its packages only", () => {
    expect(setupFor("python scripts/backfill.py")).not.toContain("npm")
    expect(setupFor("pnpm update:preview --message x")).not.toContain("venv")
    expect(setupFor("./run.sh")).toContain("venv")
  })
})

describe("a script for real whose simulation was skipped", () => {
  it("waits for you in staging; with its simulation done, it goes on its own", () => {
    const steps = releaseSteps(state({ units: [], scripts: [{ id: "S1", unit: null, title: "Backfill", command: "python b.py", when: "", envs: ["staging"] }] }), "staging", config)
    const run = steps.find(s => s.kind === "execute")!
    expect(isGated(run, "staging", steps.map(s => (s.kind === "simulate" ? { ...s, status: "skipped" as const } : s)))).toBe(true)
    expect(isGated(run, "staging", steps.map(s => (s.kind === "simulate" ? { ...s, status: "done" as const } : s)))).toBe(false)
  })
})

describe("what you skipped in an environment", () => {
  const script = { id: "S1", unit: null, title: "Backfill", command: "python b.py", when: "", envs: ["staging" as const] }
  const skippedIn = (steps: ReturnType<typeof releaseSteps>) => ({ env: "staging" as const, steps: steps.map(s => ({ ...s, status: "skipped" as const })) })
  it("is left for later, as items (a unit's steps together), while what you never skipped is not", () => {
    const all = releaseSteps(state({ units: [units[2]], scripts: [script] }), "staging", config)
    const s = state({ units: [units[2]], scripts: [script], deployed: { staging: skippedIn(all.filter(x => x.unit === "U3")) } })
    expect(laterIn(s, "staging", config).map(itemOf)).toEqual(["unit:U3"])
    expect(itemsOf(laterIn(s, "staging", config))).toEqual([{ key: "unit:U3", title: "mobile-app: 1 step", steps: ["mobile-app: Publish the app"] }])
    expect(releaseSteps(s, "staging", config).map(itemOf)).toEqual(["script:S1", "unit:U3", "script:S1"])
  })
  it("goes there with only what you chose, or never once you leave it out", () => {
    const all = releaseSteps(state({ units: [units[2]], scripts: [script] }), "staging", config)
    const s = state({ units: [units[2]], scripts: [script], deployed: { staging: skippedIn(all) } })
    expect(releaseSteps(s, "staging", config, ["script:S1"]).map(x => [x.id, x.kind])).toEqual([["R1", "simulate"], ["R2", "execute"]])
    const out = state({ units: [units[2]], scripts: [script], deployed: { staging: skippedIn(all) }, leftOut: { staging: ["script:S1"] } })
    expect(laterIn(out, "staging", config).map(itemOf)).toEqual(["unit:U3"])
  })
  it("in prod, a unit staging still lacks starts left out, unless you chose it", () => {
    const merge = releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config)
    const s = state({ units: [units[0]], scripts: [], deployed: { staging: skippedIn(merge) } })
    expect(releaseSteps(s, "prod", config)[0]).toMatchObject({ kind: "tag", status: "skipped", detail: "Not in staging: left out of prod" })
    expect(releaseSteps(s, "prod", config, ["unit:U1"])[0]).toMatchObject({ kind: "tag", status: "pending" })
  })
})

describe("a script a fix's build added", () => {
  it("goes in the next release after the plan's order", () => {
    const s = state({ units: [], scripts: [{ id: "S2", unit: "X1", title: "Copy", command: "python sync.py", when: "", envs: ["staging", "prod"] }], order: [{ kind: "manual", id: null, text: "Flag on", envs: [] }] })
    expect(releaseSteps(s, "staging", config).map(x => `${x.kind}:${x.script ?? x.title}`)).toEqual(["simulate:S2", "manual:Flag on", "execute:S2"])
  })
  it("runs in its unit's repo, even when that unit is already there", () => {
    const x1 = { id: "X1", repo: "notification-service-v2", subtask: null, branch: "b", title: "t", dependsOn: [], status: "done" as const, pr: "https://github.com/acme/n/pull/71" }
    const merged = { env: "staging" as const, steps: [{ ...releaseSteps(state({ units: [x1], scripts: [] }), "staging", config)[0]!, status: "done" as const }] }
    const s = state({ units: [x1], scripts: [{ id: "S2", unit: "X1", title: "Copy", command: "python sync.py", when: "", envs: ["staging"] }], deployed: { staging: merged } })
    expect(releaseSteps(s, "staging", config).map(x => x.repo)).toEqual(["notification-service-v2", "notification-service-v2"])
  })
})

describe("what people said on a PR, before its merge", () => {
  const open = JSON.stringify({ state: "OPEN", isDraft: false, mergeable: "MERGEABLE", headRefName: "feat/U1", baseRefName: "main", statusCheckRollup: [{ conclusion: "SUCCESS" }] })
  const comments = [{ author: "ana", body: "LGTM", url: null, path: null }, { author: "luis", body: "Usa «Letter of Intent», no «indicative offer»", url: null, path: null }]
  const steps = () => releaseSteps(state({ units: [units[0]], scripts: [] }), "staging", config)
  // Answers the agents leave, by file: the judge's and the fixer's.
  const withAnswers = (answers: Record<string, string>) => {
    const { calls, ops } = fake({ "pr view": open })
    return { calls, ops: { ...ops, prComments: async () => comments, judge: async () => 77, agent: async () => 78, isAlive: () => false, readText: async (p: string) => answers[Object.keys(answers).find(k => p.endsWith(k)) ?? ""] ?? null } }
  }
  it("never reads what an agent of an earlier release left: each release has files of its own", async () => {
    const { calls, ops } = withAnswers({ "3-R1-judge.json": '{"act": []}' })
    let r = await advanceRelease({ env: "staging", steps: steps() }, { ...ctx, run: 4 }, { ...ops, isAlive: () => true })
    r = await advanceRelease(r.release, { ...ctx, run: 4 }, { ...ops, isAlive: () => true })
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "feedback" })
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
  })
  it("merges at once when no one said anything", async () => {
    const { calls, ops } = fake({ "pr view": open })
    let r = await advanceRelease({ env: "staging", steps: steps() }, ctx, { ...ops, prComments: async () => [], judge: async () => 1 })
    expect(r.release.steps[0]!.feedback).toEqual({ state: "clear", items: [] })
    r = await advanceRelease(r.release, ctx, { ...ops, prComments: async () => [], judge: async () => 1 })
    expect(calls).toContain("gh pr merge https://github.com/acme/api-service/pull/7 --merge")
  })
  it("merges when an agent sees that no comment asks for a change (a LGTM)", async () => {
    const { calls, ops } = withAnswers({ "0-R1-judge.json": '{"act": []}' })
    let r = await advanceRelease({ env: "staging", steps: steps() }, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "feedback", detail: "2 comments on its PR: an agent looks at them" })
    r = await advanceRelease(r.release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "pending", detail: "The comments on its PR ask for no change" })
    r = await advanceRelease(r.release, ctx, ops)
    expect(calls).toContain("gh pr merge https://github.com/acme/api-service/pull/7 --merge")
  })
  it("waits for you on a comment that asks for a change: merge it anyway, or have an agent make the change and look at it first", async () => {
    const { calls, ops } = withAnswers({ "0-R1-judge.json": '{"act": [{"i": 1, "why": "Cambiar el glosario"}]}', "0-R1-fix.json": '{"resolved": true, "reason": "Glosario cambiado"}' })
    let r = await advanceRelease({ env: "staging", steps: steps() }, ctx, ops)
    r = await advanceRelease(r.release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "waiting", items: ["luis: Cambiar el glosario"], detail: "1 comment asks for a change on its PR" })
    expect(calls.some(c => c.includes("pr merge"))).toBe(false)
    const anyway = await advanceRelease(approveStep(r.release, "R1"), ctx, ops)
    expect(anyway.release.steps[0]).toMatchObject({ status: "running", phase: "deploy" })
    r = await advanceRelease(addressStep(r.release, "R1"), ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "addressing" })
    r = await advanceRelease(r.release, ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "waiting", detail: "Changes pushed: Glosario cambiado", feedback: { state: "addressed" } })
    const again = relookStep(r.release, "R1")
    expect(again.steps[0]).toMatchObject({ status: "pending", feedback: null, isApproved: false, items: [] })
    r = await advanceRelease(approveStep(r.release, "R1"), ctx, ops)
    expect(r.release.steps[0]).toMatchObject({ status: "running", phase: "deploy" })
    expect(() => relookStep(r.release, "R1")).toThrow()
  })
})

describe("outcomesIn", () => {
  it("reads what the agent did with each comment, from its list or else from the lines of its reason", () => {
    expect([...outcomesIn('{"resolved": true, "reason": "x", "items": [{"i": 0, "status": "already", "why": "Commit 5469"}, {"i": 2, "status": "skipped", "why": "Producto"}]}')])
      .toEqual([[0, { status: "already", why: "Commit 5469" }], [2, { status: "skipped", why: "Producto" }]])
    expect([...outcomesIn('{"resolved": true, "reason": "Commit 0f8f.\\n0: ya estaba. El commit 5469…\\n1: aplicado. La query espera…\\n7: no aplicado: pide producto"}')])
      .toEqual([[0, { status: "already", why: "El commit 5469…" }], [1, { status: "applied", why: "La query espera…" }], [7, { status: "skipped", why: "pide producto" }]])
  })
})
