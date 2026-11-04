// A ticket's release: the steps that take its PRs to staging, and then to
// prod, run by the board itself (no agent: the same commands every time, and
// nothing to pay). Each step is a merge, a tag, a branch promoted, a script
// on the data, or something only a person does. Every
// script is simulated first of all, before anything deploys (on the code of
// its PR), and waits for you to look at its report: that is your yes to the
// release. Then the deploys, and each script for real in its place. In
// staging the board merges, and runs a script you approved, on its own; what
// only a person does waits for you. In prod everything but a
// simulation waits for you, with what it is about to do (the tag it would
// push and what goes with it, the simulation's report).
//
// How each repo deploys comes from the team's <data>/pipeline/stages/deploy.json
// (DeployConfig): "merge" (a merge to the default branch deploys), "tag" (a
// version tag deploys), "promote:<branch>" (a PR from the default branch to
// that one), "merge-only" (a merge that deploys nothing by itself),
// "command:<the repo's own command>" (rehearsed with --dry-run first; {key}
// and {summary} say the ticket), "manual:<what to do>", or "skip" (nothing to deploy there: a
// repo of documents that goes to prod only). Testing a release is a stage of
// its own after it (an agent's), not a step of it.
//
// A step moves on each tick (advanceRelease): pending → waiting for you (when
// it is gated and not approved yet) → running → done, or failed. It follows a
// deploy by what GitHub says of its commit: the Actions runs and the
// deployments created since it started.

import type { Advice } from "./gate"
import type { ChecklistItem, Env, PipelineState, PlanScript, Unit } from "./pipeline"

export type StepKind = "merge" | "promote" | "tag" | "simulate" | "execute" | "manual" | "check"
export type StepStatus = "pending" | "waiting" | "running" | "done" | "failed" | "skipped"
export type Link = { label: string; url: string }
export type ReleaseStep = {
  id: string
  kind: StepKind
  title: string
  unit: string | null
  repo: string | null
  script: string | null
  status: StepStatus
  isApproved: boolean
  detail: string | null // what it found or does now, in a line
  items: string[] // what goes with it (the commits a tag takes to prod), or what to test
  links: Link[]
  value: string | null // the tag (proposed, then pushed), or the branch a promote goes to
  sha: string | null // the commit it deploys
  since: number | null // when it started: the runs and deployments since then are its own
  phase: "checks" | "deploy" | "script" | null
  pid: number | null
  report: string | null // a script's report, in <ticket>/scripts
  error: string | null
  advice?: Advice | null // what the agent that looks at a waiting step says (lib/gate.ts)
}
export type Release = { env: Env; steps: ReleaseStep[]; reminders?: string[] }
// The plan's order for a release: a unit, a script, or something a person does.
export type OrderItem = { kind: "unit" | "script" | "manual"; id: string | null; text: string | null; envs: Env[] }

// A repo's way to an environment: one way, or several in a row (a merge, then its own command).
type Way = string | string[]
export type DeployConfig = {
  mergeMethod: "merge" | "squash" | "rebase"
  default: Record<Env, string>
  repos: Record<string, Partial<Record<Env, Way>>>
  secrets?: Record<string, Record<string, string>> // a repo's commands' variables: "keychain:<service>", read when they run
  remind?: Record<string, Partial<Record<Env, string>>> // what a person must have done before a release to an environment starts
  gates?: Partial<Record<Env, "person" | "agent">> // who answers a step that waits: you (the agent only advises), or the agent
  gateAgent?: boolean // whether an agent looks at each step that waits, and says go on or hold
  tag: { bump: "major" | "minor" | "patch" }
  setup: Record<string, string> // a repo's command that readies a checkout to run its scripts
  contextRepo?: string // the team's context for agents: changed only when a ticket makes a rule of it untrue
}
export const DEFAULT_CONFIG: DeployConfig = { mergeMethod: "merge", default: { staging: "merge", prod: "tag" }, repos: {}, tag: { bump: "minor" }, setup: {} }

// ---------- the steps ----------

const blank = (kind: StepKind, title: string, extra: Partial<ReleaseStep> = {}): Omit<ReleaseStep, "id"> => ({
  kind, title, unit: null, repo: null, script: null, status: "pending", isApproved: false, detail: null, items: [], links: [], value: null, sha: null, since: null, phase: null, pid: null, report: null, error: null, ...extra,
})
const prNumber = (url: string | null | undefined) => url?.split("/").pop() ?? ""

// What a command may say of the ticket: its key, and its title without what a shell reads.
const filled = (command: string, key: string, summary: string) =>
  command.replaceAll("{key}", key).replaceAll("{summary}", summary.replace(/["'`$\\]/g, "").replace(/\s+/g, " ").trim())
// A repo's own command (an OTA, a publish): rehearsed first with --dry-run, then for real.
const commandSteps = (command: string, base: Partial<ReleaseStep>, repo: string): Omit<ReleaseStep, "id">[] => {
  const name = command.split(" --")[0]!.trim()
  return [blank("simulate", `${repo}: ${name} (dry run)`, { ...base, value: `${command} --dry-run` }), blank("execute", `${repo}: ${name}`, { ...base, value: command })]
}

// How a unit gets to an environment, by its repo's way (or ways, in a row) of deploying; none for "skip".
function deploySteps(u: Unit, env: Env, config: DeployConfig, key: string, summary: string): Omit<ReleaseStep, "id">[] {
  const ways = [config.repos[u.repo]?.[env] ?? config.default[env]].flat()
  const base = { unit: u.id, repo: u.repo, links: u.pr ? [{ label: `PR #${prNumber(u.pr)}`, url: u.pr }] : [] }
  return ways.flatMap(how => {
    if (how === "skip") return []
    if (how.startsWith("command:")) return commandSteps(filled(how.slice(8).trim(), key, summary), base, u.repo)
    if (how.startsWith("manual:")) return [blank("manual", `${u.repo}: ${how.slice(7).trim()}`, base)]
    if (how.startsWith("promote:")) return [blank("promote", `${u.repo}: release to ${how.slice(8)}`, { ...base, value: how.slice(8) })]
    if (how === "tag") return [blank("tag", `${u.repo}: tag and deploy`, base)]
    if (how === "merge-only") return [blank("merge", `${u.repo}: merge PR #${prNumber(u.pr)}`, { ...base, value: "no-deploy" })]
    return [blank("merge", `${u.repo}: merge PR #${prNumber(u.pr)} and deploy`, base)]
  })
}

// A unit's steps to an environment. A repo goes to prod once (by a tag or a
// branch): a unit whose repo already went keeps only its merges and commands.
function unitSteps(u: Unit, env: Env, config: DeployConfig, state: PipelineState, released: Set<string>) {
  const isOnce = (kind: StepKind) => kind !== "merge" && kind !== "simulate" && kind !== "execute"
  const steps = deploySteps(u, env, config, state.key, state.summary ?? "").filter(s => !isOnce(s.kind) || !released.has(u.repo))
  released.add(u.repo)
  return steps
}

// The steps of a release to an environment: its scripts simulated first;
// then the plan's order (else its units, then its scripts), each script for
// real in its place, a repo released to prod once.
export function releaseSteps(state: PipelineState, env: Env, config: DeployConfig): ReleaseStep[] {
  const units = state.units ?? []
  const scripts = state.scripts ?? []
  const order: OrderItem[] = state.order?.length ? state.order
    : [...units.map(u => ({ kind: "unit" as const, id: u.id, text: null, envs: [] })), ...scripts.map(x => ({ kind: "script" as const, id: x.id, text: null, envs: [] }))]
  const simulations: Omit<ReleaseStep, "id">[] = []
  const steps: Omit<ReleaseStep, "id">[] = []
  const released = new Set<string>()
  for (const item of order) {
    if (item.envs.length && !item.envs.includes(env)) continue
    if (item.kind === "manual" && item.text) steps.push(blank("manual", item.text))
    const u = item.kind === "unit" ? units.find(x => x.id === item.id) : undefined
    if (u) steps.push(...unitSteps(u, env, config, state, released))
    const x = item.kind === "script" ? scripts.find(s => s.id === item.id) : undefined
    if (x && (!x.envs.length || x.envs.includes(env))) {
      const repo = units.find(v => v.id === x.unit)?.repo ?? null
      simulations.push(blank("simulate", `${x.title}: simulate`, { unit: x.unit, repo, script: x.id }))
      steps.push(blank("execute", `${x.title}: run for real`, { unit: x.unit, repo, script: x.id }))
    }
  }
  return [...simulations, ...steps].map((s, i) => ({ ...s, id: `R${i + 1}` }))
}

// What waits for you before it starts: in prod, every step but a simulation;
// in staging, what only a person does and the check (a script for real was
// approved with its simulation). A simulation waits for you once it ends.
export const isGated = (step: ReleaseStep, env: Env) => step.kind !== "simulate" && (env === "prod" || step.kind === "manual" || step.kind === "check")

// The next version after the latest vX.Y.Z tag.
export function nextTag(tags: string[], bump: DeployConfig["tag"]["bump"]) {
  const versions = tags.map(t => t.trim().match(/^v(\d+)\.(\d+)\.(\d+)$/)).filter(Boolean).map(m => [+m![1]!, +m![2]!, +m![3]!] as const)
  if (!versions.length) return null
  const [a, b, c] = [...versions].sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]).at(-1)!
  const next = bump === "major" ? [a + 1, 0, 0] : bump === "minor" ? [a, b + 1, 0] : [a, b, c + 1]
  return { latest: `v${a}.${b}.${c}`, next: `v${next.join(".")}` }
}

// ---------- a deploy ----------

type Run = { name: string; status: string; conclusion: string; url: string; createdAt: string }
type Deployment = { environment: string; state: string; url: string; createdAt: string }
const NO_DEPLOY_MS = 15 * 60_000
const BAD_RUN = ["failure", "cancelled", "timed_out", "startup_failure", "action_required"]
const BAD_DEPLOY = ["failure", "error", "inactive"]
const OPEN_DEPLOY = ["pending", "queued", "in_progress", ""]

// Where a deploy is, by the runs and deployments of its commit since it
// started: none yet, one at work, one failed, or all done.
export function deployState(runs: Run[], deployments: Deployment[], since: number, now: number): Pick<ReleaseStep, "status" | "detail" | "links"> {
  const isOwn = (at: string) => Date.parse(at) >= since - 60_000
  const own = [...runs.filter(r => isOwn(r.createdAt)).map(r => ({ name: r.name, url: r.url, isBad: BAD_RUN.includes(r.conclusion), isOpen: r.status !== "completed" })),
    ...deployments.filter(d => isOwn(d.createdAt)).map(d => ({ name: d.environment, url: d.url, isBad: BAD_DEPLOY.includes(d.state), isOpen: OPEN_DEPLOY.includes(d.state) }))]
  const links = own.filter(o => o.url).map(o => ({ label: o.name, url: o.url }))
  if (!own.length) return now - since > NO_DEPLOY_MS
    ? { status: "waiting", detail: "No deploy showed up on GitHub: check it, then go on", links }
    : { status: "running", detail: "Waiting for the deploy to start", links }
  const bad = own.find(o => o.isBad)
  if (bad) return { status: "failed", detail: `${bad.name} failed`, links }
  const open = own.find(o => o.isOpen)
  if (open) return { status: "running", detail: `Deploying: ${open.name}`, links }
  return { status: "done", detail: `Deployed: ${own.map(o => o.name).join(", ")}`, links }
}

// ---------- a script's report ----------

// A CSV, quotes and all.
function rowsOf(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let isQuoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (isQuoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') isQuoted = false
      else cell += ch
    } else if (ch === '"') isQuoted = true
    else if (ch === ",") row.push(cell), (cell = "")
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cell), rows.push(row), (row = []), (cell = "")
    } else cell += ch
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows.filter(r => r.some(c => c))
}

const countBy = (rows: string[][], col: number) => rows.reduce<Record<string, number>>((n, r) => (r[col] ? { ...n, [r[col]!]: (n[r[col]!] ?? 0) + 1 } : n), {})
const said = (counts: Record<string, number>) => Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ")

// A report (scripts.md: id, action, reason, before, after, result, error):
// how many records, by action and by result, and its first rows.
export function reportOf(text: string, keep = 50) {
  const [head = [], ...rows] = rowsOf(text)
  const col = (name: string) => head.indexOf(name)
  const actions = countBy(rows, col("action"))
  const results = countBy(rows, col("result"))
  const outcome = Object.keys(results).filter(k => k !== "simulated").length ? ` · ${said(results)}` : ""
  return { head, total: rows.length, actions, results, rows: rows.slice(0, keep), text: `${rows.length} records${rows.length ? `: ${said(actions)}` : ""}${outcome}` }
}

// ---------- running a release ----------

export type Sh = (cmd: string[], options?: { cwd?: string; timeoutMs?: number }) => Promise<{ ok: boolean; out: string; err: string }>
// What a release does to the world, so that a test can stand in for it.
export type Ops = {
  sh: Sh
  now: () => number
  spawn: (cwd: string, line: string, env: Record<string, string>, log: string, exit: string) => Promise<number>
  isAlive: (pid: number) => boolean
  readText: (path: string) => Promise<string | null>
  exists: (path: string) => boolean
  secret: (name: string) => Promise<string | null> // from the keychain
}
export type Ctx = { key: string; summary: string; dir: string; repos: string; config: DeployConfig; units: Unit[]; scripts: PlanScript[]; checklist: ChecklistItem[] }
type Patch = Partial<ReleaseStep>

const slugOf = (url: string | null | undefined) => url?.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1] ?? null
const prOf = (step: ReleaseStep, ctx: Ctx) => ctx.units.find(u => u.id === step.unit)?.pr ?? null
const cloneOf = (step: ReleaseStep, ctx: Ctx) => `${ctx.repos}/${step.repo}`
const must = async (ops: Ops, cmd: string[], options?: { cwd?: string; timeoutMs?: number }) => {
  const r = await ops.sh(cmd, options)
  if (!r.ok) throw new Error(r.err || `${cmd.slice(0, 3).join(" ")} failed`)
  return r.out
}
const jsonOf = (text: string) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
const lines = (text: string) => text.split("\n").map(l => l.trim()).filter(Boolean)
const defaultBranch = async (slug: string, ops: Ops) => (await ops.sh(["gh", "repo", "view", slug, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"])).out || "master"

// What a step waiting for you shows: what it is about to do.
async function prepare(step: ReleaseStep, release: Release, ctx: Ctx, ops: Ops): Promise<Patch> {
  if (step.kind === "check") return { items: ctx.checklist.map(c => c.text) }
  if (step.kind === "execute") {
    const sim = release.steps.find(s => s.kind === "simulate" && s.script === step.script)
    return { detail: sim?.detail ? `Simulation: ${sim.detail}` : null, report: sim?.report ?? null }
  }
  if (step.kind === "tag") {
    const clone = cloneOf(step, ctx)
    await ops.sh(["git", "-C", clone, "fetch", "-q", "--tags", "origin"], { timeoutMs: 60_000 })
    const tag = nextTag(lines((await ops.sh(["git", "-C", clone, "tag", "--list", "v*"])).out), ctx.config.tag.bump)
    const sha = await must(ops, ["git", "-C", clone, "rev-parse", "origin/HEAD"])
    if (!tag) return { sha, detail: "No vX.Y.Z tag yet: write the first one" }
    const items = lines((await ops.sh(["git", "-C", clone, "log", "--first-parent", "--format=%s", `${tag.latest}..${sha}`, "-n", "30"])).out)
    return { sha, value: step.value ?? tag.next, items, detail: `${items.length} change${items.length === 1 ? "" : "s"} since ${tag.latest} go to prod` }
  }
  if (step.kind === "promote") {
    const slug = slugOf(prOf(step, ctx))
    if (!slug) return { detail: "No PR to tell the repo by" }
    const head = await defaultBranch(slug, ops)
    const out = lines((await ops.sh(["gh", "api", `repos/${slug}/compare/${step.value}...${head}`, "--jq", ".total_commits, (.commits[] | .commit.message | split(\"\\n\")[0])"])).out)
    return { items: out.slice(1).slice(-30), detail: `${out[0] ?? "?"} commits go from ${head} to ${step.value}` }
  }
  return {}
}

// Where a script runs: a checkout of what the environment runs, once its
// repo is deployed; before that, of what is about to be (in staging, its PR's
// branch; in prod, what staging runs).
async function checkout(step: ReleaseStep, release: Release, ctx: Ctx, ops: Ops) {
  const clone = cloneOf(step, ctx)
  await must(ops, ["git", "-C", clone, "fetch", "-q", "--tags", "origin"], { timeoutMs: 60_000 })
  const shipped = release.steps.find(s => s.repo === step.repo && ["merge", "tag", "promote"].includes(s.kind) && s.status === "done")
  const branch = ctx.units.find(u => u.id === step.unit)?.branch
  const ref = shipped?.kind === "tag" ? shipped.value!
    : shipped?.kind === "promote" ? `origin/${shipped.value}`
    : !shipped && release.env === "staging" && branch ? `origin/${branch}` : "origin/HEAD"
  const path = `${ctx.dir}/release/${step.repo}`
  if (ops.exists(path)) await must(ops, ["git", "-C", path, "checkout", "-q", "--detach", ref])
  else await must(ops, ["git", "-C", clone, "worktree", "add", "-q", "--detach", path, ref])
  return path
}
// Readies a checkout for its scripts (once): the repo's own way, else its venv or its packages.
const SETUP = `if [ -f requirements.txt ] && [ ! -x .venv/bin/python ]; then python$(cat .python-version 2>/dev/null || echo 3) -m venv .venv && .venv/bin/pip install -q -r requirements.txt; fi; if [ -f package.json ] && [ ! -d node_modules ]; then if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else npm ci; fi; fi`

// A repo's own command runs in its clone, on its default branch, up to date
// (its own checks may refuse anything else), with its secrets.
async function startCommand(step: ReleaseStep, release: Release, ctx: Ctx, ops: Ops): Promise<Patch> {
  const clone = cloneOf(step, ctx)
  const slug = slugOf(prOf(step, ctx))
  const branch = slug ? await defaultBranch(slug, ops) : "master"
  await must(ops, ["git", "-C", clone, "checkout", "-q", branch])
  await must(ops, ["git", "-C", clone, "pull", "-q", "--ff-only"], { timeoutMs: 60_000 })
  const env: Record<string, string> = { STAGE: release.env }
  for (const [name, from] of Object.entries(ctx.config.secrets?.[step.repo!] ?? {})) {
    const value = from.startsWith("keychain:") ? await ops.secret(from.slice(9)) : from
    if (!value) throw new Error(`${name} is not in the keychain (${from.slice(9)}): add it, then retry`)
    env[name] = value
  }
  const mode = step.kind === "execute" ? "execute" : "simulate"
  const base = `${ctx.dir}/scripts/${step.repo}-${release.env}-${mode}`
  const pid = await ops.spawn(clone, `${ctx.config.setup[step.repo!] ?? SETUP} && ${step.value}`, env, `${base}.log`, `${base}.exit`)
  return { status: "running", phase: "script", pid, report: `${step.repo}-${release.env}-${mode}.csv`, since: ops.now(), detail: mode === "execute" ? "Running" : "Dry run" }
}

async function startScript(step: ReleaseStep, release: Release, ctx: Ctx, ops: Ops): Promise<Patch> {
  if (!step.script && step.value) return startCommand(step, release, ctx, ops)
  const script = ctx.scripts.find(x => x.id === step.script)
  if (!script || !step.repo) throw new Error("The plan has no such script, or no repo for it")
  const cwd = await checkout(step, release, ctx, ops)
  const mode = step.kind === "execute" ? "execute" : "simulate"
  const base = `${ctx.dir}/scripts/${script.id}-${release.env}-${mode}`
  const report = `${script.id}-${release.env}-${mode}.csv`
  const env: Record<string, string> = { STAGE: release.env, REPORT: `${ctx.dir}/scripts/${report}`, ...(mode === "execute" ? { EXECUTE: "true" } : {}) }
  const pid = await ops.spawn(cwd, `${ctx.config.setup[step.repo] ?? SETUP} && ${script.command}`, env, `${base}.log`, `${base}.exit`)
  return { status: "running", phase: "script", pid, report, since: ops.now(), detail: mode === "execute" ? "Running for real" : "Simulating" }
}

async function checkScript(step: ReleaseStep, ctx: Ctx, ops: Ops): Promise<Patch> {
  const base = `${ctx.dir}/scripts/${step.report!.replace(/\.csv$/, "")}`
  const exit = await ops.readText(`${base}.exit`)
  if (exit === null) return ops.isAlive(step.pid ?? 0) ? {} : { status: "failed", error: "The script stopped before it ended" }
  const report = await ops.readText(`${ctx.dir}/scripts/${step.report}`)
  // A command leaves no report: its last line says what it did.
  const last = lines((await ops.readText(`${base}.log`)) ?? "").at(-1) ?? "Done"
  const detail = !step.script ? last : report ? reportOf(report).text : "No report: the script does not follow scripts.md"
  // A simulation waits for you to look at it; that is your yes to the release.
  if (exit.trim() === "0") return { status: step.kind === "simulate" ? "waiting" : "done", detail }
  const log = lines((await ops.readText(`${base}.log`)) ?? "").slice(-3).join(" · ")
  return { status: "failed", detail, error: `Exit ${exit.trim()}${log ? `: ${log}` : ""}` }
}

async function checkDeploy(step: ReleaseStep, ctx: Ctx, ops: Ops): Promise<Patch> {
  const slug = slugOf(prOf(step, ctx))
  if (!slug || !step.sha) return { status: "waiting", detail: "The commit it deploys is unknown: check it, then go on" }
  const runs: Run[] = jsonOf((await ops.sh(["gh", "run", "list", "-R", slug, "--commit", step.sha, "--json", "name,status,conclusion,url,createdAt", "-L", "20"])).out) ?? []
  const found: { id: number; environment: string; created_at: string }[] = jsonOf((await ops.sh(["gh", "api", `repos/${slug}/deployments?sha=${step.sha}`, "--jq", "[.[] | {id, environment, created_at}]"])).out) ?? []
  const deployments = await Promise.all(found.map(async d => {
    const s = jsonOf((await ops.sh(["gh", "api", `repos/${slug}/deployments/${d.id}/statuses?per_page=1`, "--jq", ".[0] // {} | {state, target_url}"])).out) ?? {}
    return { environment: d.environment, state: s.state ?? "", url: s.target_url ?? "", createdAt: d.created_at }
  }))
  return deployState(runs, deployments, step.since ?? 0, ops.now())
}

async function merge(step: ReleaseStep, ctx: Ctx, ops: Ops): Promise<Patch> {
  const url = prOf(step, ctx)
  if (!url) throw new Error("The unit has no PR")
  const view = async () => jsonOf(await must(ops, ["gh", "pr", "view", url, "--json", "state,isDraft,mergeCommit,mergedAt"])) ?? {}
  let pr = await view()
  if (pr.state !== "MERGED") {
    if (pr.isDraft) await must(ops, ["gh", "pr", "ready", url])
    await must(ops, ["gh", "pr", "merge", url, `--${ctx.config.mergeMethod}`], { timeoutMs: 60_000 })
    pr = await view()
  }
  // A merge that deploys nothing (the repo's own command does) is done once merged.
  if (step.value === "no-deploy") return { status: "done", sha: pr.mergeCommit?.oid ?? null, detail: "Merged" }
  return { status: "running", phase: "deploy", sha: pr.mergeCommit?.oid ?? null, since: pr.mergedAt ? Date.parse(pr.mergedAt) : ops.now(), detail: "Merged: waiting for the deploy" }
}

async function tag(step: ReleaseStep, ctx: Ctx, ops: Ops): Promise<Patch> {
  const clone = cloneOf(step, ctx)
  const name = step.value ?? ""
  if (!/^v\d+\.\d+\.\d+$/.test(name)) throw new Error(`${name || "No tag"} is not a vX.Y.Z version`)
  if (lines((await ops.sh(["git", "-C", clone, "tag", "--list", "v*"])).out).includes(name)) throw new Error(`${name} is already there`)
  if (!step.sha) throw new Error("No commit to tag")
  await must(ops, ["git", "-C", clone, "tag", name, step.sha])
  await must(ops, ["git", "-C", clone, "push", "origin", name], { timeoutMs: 60_000 })
  return { status: "running", phase: "deploy", since: ops.now(), detail: `${name} pushed: waiting for the deploy` }
}

// A promote: a PR from the default branch to the target (the one there, or a new one).
async function promote(step: ReleaseStep, ctx: Ctx, ops: Ops): Promise<Patch> {
  const slug = slugOf(prOf(step, ctx))
  if (!slug) throw new Error("No PR to tell the repo by")
  const head = await defaultBranch(slug, ops)
  const open = jsonOf((await ops.sh(["gh", "pr", "list", "-R", slug, "--base", step.value!, "--head", head, "--state", "open", "--json", "url"])).out)?.[0]?.url
  const url = open ?? (await must(ops, ["gh", "pr", "create", "-R", slug, "--base", step.value!, "--head", head, "--title", `Release ${ctx.key}: ${ctx.summary}`, "--body", `Release of ${ctx.key}, from Agent Center.`]))
  return { status: "running", phase: "checks", links: [...step.links, { label: `Release PR #${prNumber(url)}`, url }], value: step.value, detail: "Waiting for the release checks" }
}

async function checkPromote(step: ReleaseStep, ops: Ops): Promise<Patch> {
  const url = step.links.find(l => l.label.startsWith("Release PR"))?.url
  if (!url) return { status: "failed", error: "The release PR is gone" }
  const pr = jsonOf(await must(ops, ["gh", "pr", "view", url, "--json", "state,statusCheckRollup,mergeCommit,mergedAt"])) ?? {}
  if (pr.state !== "MERGED") {
    const checks: { conclusion?: string; state?: string; status?: string }[] = pr.statusCheckRollup ?? []
    const states = checks.map(c => (c.conclusion || c.state || c.status || "").toUpperCase())
    if (states.some(s => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT"].includes(s))) return { status: "failed", error: "A release check failed" }
    if (!states.every(s => ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(s))) return {}
    await must(ops, ["gh", "pr", "merge", url, "--merge"], { timeoutMs: 60_000 })
    return { phase: "deploy", since: ops.now(), detail: "Merged: waiting for the deploy", ...(await mergedSha(url, ops)) }
  }
  return { phase: "deploy", since: pr.mergedAt ? Date.parse(pr.mergedAt) : ops.now(), sha: pr.mergeCommit?.oid ?? null }
}
const mergedSha = async (url: string, ops: Ops) => ({ sha: jsonOf(await must(ops, ["gh", "pr", "view", url, "--json", "mergeCommit"]))?.mergeCommit?.oid ?? null })

function start(step: ReleaseStep, release: Release, ctx: Ctx, ops: Ops): Promise<Patch> {
  if (step.kind === "merge") return merge(step, ctx, ops)
  if (step.kind === "tag") return tag(step, ctx, ops)
  if (step.kind === "promote") return promote(step, ctx, ops)
  if (step.kind === "simulate" || step.kind === "execute") return startScript(step, release, ctx, ops)
  return Promise.resolve({ status: "done" })
}

function check(step: ReleaseStep, ctx: Ctx, ops: Ops): Promise<Patch> {
  if (step.phase === "script") return checkScript(step, ctx, ops)
  if (step.phase === "checks") return checkPromote(step, ops)
  return checkDeploy(step, ctx, ops)
}

const isOver = (s: ReleaseStep) => s.status === "done" || s.status === "skipped"
const withStep = (release: Release, id: string, patch: Patch): Release => ({ ...release, steps: release.steps.map(s => (s.id === id ? { ...s, ...patch } : s)) })
const MOVES_A_TICK = 8

// Takes a release as far as it goes now: each step that can go on, until one
// waits (for you, or for GitHub), fails, or the release is done.
export async function advanceRelease(release: Release, ctx: Ctx, ops: Ops): Promise<{ release: Release; isDone: boolean; failed: string | null }> {
  for (let i = 0; i < MOVES_A_TICK; i++) {
    const step = release.steps.find(s => !isOver(s))
    if (!step) return { release, isDone: true, failed: null }
    if (step.status === "waiting" || step.status === "failed") return { release, isDone: false, failed: step.status === "failed" ? step.id : null }
    let patch: Patch
    try {
      patch = step.status === "pending" && isGated(step, release.env) && !step.isApproved
        ? { ...(await prepare(step, release, ctx, ops)), status: "waiting" }
        : step.status === "pending" ? await start(step, release, ctx, ops) : await check(step, ctx, ops)
    } catch (err) {
      patch = { status: "failed", error: (err as Error).message }
    }
    release = withStep(release, step.id, patch)
    const now = release.steps.find(s => s.id === step.id)!
    if (!isOver(now)) return { release, isDone: false, failed: now.status === "failed" ? now.id : null }
  }
  return { release, isDone: !release.steps.some(s => !isOver(s)), failed: null }
}

// Your answers to a step: go on (with the tag you chose), again, or past it.
const current = (release: Release, id: string) => release.steps.find(s => !isOver(s))?.id === id
export function approveStep(release: Release, id: string, value?: string): Release {
  if (!current(release, id)) throw new Error("That step does not wait for you")
  const step = release.steps.find(s => s.id === id)!
  if (step.status !== "waiting" && step.status !== "pending") throw new Error("That step does not wait for you")
  // "Go on" past a deploy nobody saw: you checked it. A simulation you looked at is done.
  if (step.phase === "deploy") return withStep(release, id, { status: "done", detail: "Checked by you" })
  if (step.phase === "script" && step.status === "waiting") return withStep(release, id, { status: "done" })
  return withStep(release, id, { status: "pending", isApproved: true, ...(value?.trim() ? { value: value.trim() } : {}) })
}
export function retryStep(release: Release, id: string): Release {
  if (!current(release, id) || release.steps.find(s => s.id === id)!.status !== "failed") throw new Error("That step has not failed")
  return withStep(release, id, { status: "pending", error: null, phase: null, pid: null, advice: null })
}
export function skipStep(release: Release, id: string): Release {
  if (!current(release, id)) throw new Error("Only the step at hand can be skipped")
  return withStep(release, id, { status: "skipped" })
}
