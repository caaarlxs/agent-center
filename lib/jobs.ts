// A job: one specialist of the pipeline (its stage's agent: the same
// instructions, the same limits), on its own, out of the chain. You hand it a
// ticket (with its children) and, to the reviewer, the PRs; it leaves its
// result here and nothing else: no Jira, no GitHub, no next stage.
//
// The reviewer fills in what you leave out: a ticket the PRs name (their
// title, branch or text), or the open PRs that name the ticket or its
// children. Without a ticket it reviews the code alone, and says so. Each PR's
// code is checked out for it, in a worktree of the job's own, removed once it ends.
//
// Each job keeps its state in <data>/pipeline/jobs/<JOB-n>/: state.json,
// ticket.md, prs.json, and the stage's files (review.md, review.json…).

import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, rename } from "node:fs/promises"
import { join } from "node:path"
import { DATA_DIR } from "./config"
import { writeJsonAtomic } from "./files"
import { jiraSetup, keysIn } from "./jira"
import { activityOf } from "./activity"
import { applyAction } from "./board"
import { exec } from "./proc"
import { AS_AGENT, STAGES_DIR, TAG, isAlive, linkedPages, linksFigma, parseResult, putAway, snapshotOf, spawnStage, stateIn, ticketWithFamily, verbOf, withRun, withSpend, writeContextPages, type AgentStage, type PipelineState, type Unit } from "./pipeline"

export type PrInfo = { url: string; repo: string; number: number; title: string; head: string; base: string; body: string; worktree: string | null }
export type JobInput = { ticket: string | null; prs: string[] }
export type Job = PipelineState & { id: string; loose: true; ticket: string | null; prs: PrInfo[] }

const ROOT = join(DATA_DIR, "pipeline")
const JOBS = join(ROOT, "jobs")
const REPOS = join(ROOT, "repos")
const dirOf = (id: string) => join(JOBS, id)
const isJobId = (id: string) => /^JOB-\d+$/.test(id)
const isKey = (key: string) => /^[A-Z][A-Z0-9]+-\d+$/.test(key)
// The specialists that take jobs, so far.
export const LOOSE: AgentStage[] = ["review"]
export const isLoose = (v: unknown): v is AgentStage => LOOSE.includes(v as AgentStage)
const NAME: Record<AgentStage, string> = { refine: "Refine", plan: "Plan", build: "Build", review: "Review", test: "Test", smoke: "Smoke" }

// ---------- what a job is ----------

export function prRef(text: string) {
  const m = text.trim().match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/)
  return m ? { url: `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}`, owner: m[1]!, repo: m[2]!, number: Number(m[3]) } : null
}

// What is missing or wrong in a job, or null.
export function validJob(stage: AgentStage, input: JobInput): string | null {
  if (input.ticket && !isKey(input.ticket)) return `Not a ticket key: ${input.ticket}`
  const bad = input.prs.find(p => !prRef(p))
  if (bad) return `Not a PR: ${bad}`
  if (stage === "review") return input.ticket || input.prs.length ? null : "Review needs the PRs or a ticket"
  return input.ticket ? null : `${NAME[stage]} needs a ticket`
}

// The next number, never one a job cleared had.
export function nextJobId(names: string[]): string {
  const ns = names.map(n => n.match(/^JOB-(\d+)/)?.[1]).filter(Boolean).map(Number)
  return `JOB-${Math.max(0, ...ns) + 1}`
}

// The ticket the PRs name, of your projects: the first.
export const ticketFromPrs = (prs: PrInfo[], projects: string[]) => keysIn(prs.flatMap(p => [p.title, p.head, p.body]), projects)[0] ?? null

// Each PR is a unit, as a build's are: the findings say which one they are in.
export const unitsOfPrs = (prs: PrInfo[]): Unit[] =>
  prs.map((p, i) => ({ id: `U${i + 1}`, repo: p.repo, subtask: null, subtasks: [], branch: p.head, title: p.title || `PR #${p.number}`, dependsOn: [], status: "done", pr: p.url }))

const BRIEF: Partial<Record<AgentStage, (dir: string, job: { ticket: string | null; prs: PrInfo[] }) => string>> = {
  review: (dir, { ticket, prs }) => `Eres el revisor del equipo, en un encargo suelto: revisar ${prs.length === 1 ? "una PR" : `${prs.length} PRs`}${ticket ? ` del ticket ${ticket}` : ""}. No es una etapa del pipeline: no hay refinamiento, plan, build.json, checks.json ni revisión anterior, y lo que review.md dice de ellos no aplica.

1. Lee ${join(STAGES_DIR, "review.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. Las PRs están en ${join(dir, "prs.json")}: cada una con su id (U1, U2…), URL, repo, rama, base y worktree. El código de cada PR está en su worktree, en la rama de la PR: léelo, no lo cambies. El cambio es \`git diff origin/<base>...HEAD\`. Si una PR no tiene worktree, usa \`gh pr diff <url>\`.
3. ${ticket ? `El ticket, con su padre, sus hijos y sus links, está en ${join(dir, "ticket.md")}. Juzga las PRs contra él: que hagan lo que pide y cumplan sus criterios de aceptación, además del código. Si no trae criterios, sácalos de la descripción.` : "No hay ticket: revisa solo el código (corrección, estructura, arquitectura y tests). Dilo en la primera línea de review.md."}
4. Escribe los hallazgos en ${join(dir, "review.md")} y el resumen en ${join(dir, "review.summary.md")}.
5. Escribe al final ${join(dir, "review.json")}: {"verdict": "ready", "questions": [], "findings": [{"id": "F1", "unit": "U1", "severity": "blocker" | "major" | "minor", "file": "ruta", "line": 12, "title": "...", "detail": "...", "fix": "..."}]}. "unit" es el id de la PR en prs.json. Lo que solo una persona puede decidir es un hallazgo, con la pregunta en "detail".`,
}

export const jobPrompt = (stage: AgentStage, id: string, dir: string, job: { ticket: string | null; prs: PrInfo[] }) => `${TAG} ${id} · ${verbOf(stage)} (encargo)

${BRIEF[stage]!(dir, job)}

${AS_AGENT}

No escribas en Jira, en GitHub ni en los repos: tu resultado son tus ficheros.`

// ---------- the state ----------

const readText = (path: string) => readFile(path, "utf8").catch(() => null)
const stateOf = (id: string) => stateIn<Job>(dirOf(id))
const save = (job: Job) => writeJsonAtomic(join(dirOf(job.id), "state.json"), withRun(job), { pretty: true })
const failed = (job: Job, err: unknown): Job => ({ ...job, status: "failed", error: String((err as Error)?.message ?? err), endedAt: Date.now() })

// Every job (not the ones cleared), the latest first.
export async function jobs(): Promise<Job[]> {
  const names = await readdir(JOBS).catch(() => [] as string[])
  const all = (await Promise.all(names.filter(isJobId).map(stateOf))).filter((j): j is Job => !!j)
  return Promise.all(all.sort((a, b) => b.startedAt - a.startedAt).map(withSpend))
}

// A job and its stage's document, for its view.
export async function jobOf(id: string) {
  if (!isJobId(id)) throw new Error("Not a job")
  const job = await stateOf(id)
  if (!job) return null
  const doc = (await readText(join(dirOf(id), `${job.stage}.md`))) ?? (await readText(join(dirOf(id), `${job.stage}.summary.md`)))
  return { state: await withSpend(job), doc }
}

export async function jobActivity(id: string) {
  const job = isJobId(id) ? await stateOf(id) : null
  if (job?.status !== "running" || !job.sessionId) return { steps: [], helpers: [], units: [], checked: [] }
  return { ...(await activityOf(job.sessionId)), units: [], checked: [] }
}

// ---------- GitHub ----------

const gh = async (args: string[], timeoutMs = 30_000) => {
  const r = await exec(["gh", ...args], { timeoutMs })
  if (r.code !== 0) throw new Error(r.stderr.trim() || `gh ${args[0]} failed`)
  return JSON.parse(r.stdout)
}
async function prInfo(url: string): Promise<PrInfo> {
  const ref = prRef(url)!
  const p = await gh(["pr", "view", ref.url, "--json", "number,title,headRefName,baseRefName,body"])
  return { url: ref.url, repo: ref.repo, number: p.number, title: p.title ?? "", head: p.headRefName ?? "", base: p.baseRefName ?? "", body: String(p.body ?? "").slice(0, 4000), worktree: null }
}

// The owners of the team's repos (their origin on GitHub): where its PRs are.
async function owners(): Promise<string[]> {
  const names = await readdir(REPOS).catch(() => [] as string[])
  const urls = await Promise.all(names.map(n => exec(["git", "-C", join(REPOS, n), "remote", "get-url", "origin"]).then(r => r.stdout.trim())))
  return [...new Set(urls.map(u => u.match(/github\.com[:/]([\w.-]+)\//)?.[1]).filter((o): o is string => !!o))]
}

// The open PRs that name the tickets, in their title or text: five tickets a search.
async function prsNaming(keys: string[]): Promise<string[]> {
  const by = (await owners()).flatMap(o => ["--owner", o])
  if (!by.length) return []
  const found: string[] = []
  for (let i = 0; i < keys.length; i += 5) {
    const group = keys.slice(i, i + 5)
    const hits = await gh(["search", "prs", "--state", "open", "--json", "url,title,body", "--limit", "30", ...by, "--", group.join(" OR ")]).catch(() => [])
    for (const h of hits as { url: string; title: string; body: string }[])
      if (keysIn([h.title, h.body], [...new Set(group.map(k => k.split("-")[0]!))]).some(k => group.includes(k)) && !found.includes(h.url)) found.push(h.url)
  }
  return found
}

// A PR's code, in a worktree of the job's own (its base fetched, to compare): null without the repo here.
async function checkout(dir: string, p: PrInfo): Promise<string | null> {
  const repo = join(REPOS, p.repo)
  if (!existsSync(join(repo, ".git"))) return null
  const ref = `refs/agent-center/pr-${p.number}`
  const fetched = await exec(["git", "-C", repo, "fetch", "--quiet", "origin", `+refs/pull/${p.number}/head:${ref}`, ...(p.base ? [p.base] : [])], { timeoutMs: 120_000 })
  if (fetched.code !== 0) return null
  const path = join(dir, "work", `${p.repo}-${p.number}`)
  const added = await exec(["git", "-C", repo, "worktree", "add", "--detach", "--force", path, ref], { timeoutMs: 60_000 })
  return added.code === 0 ? path : null
}
async function removeWorktrees(job: Job) {
  for (const p of job.prs) {
    if (!p.worktree) continue
    const repo = join(REPOS, p.repo)
    await exec(["git", "-C", repo, "worktree", "remove", "--force", p.worktree], { timeoutMs: 30_000 })
    await exec(["git", "-C", repo, "update-ref", "-d", `refs/agent-center/pr-${p.number}`])
  }
}

// ---------- the run ----------

// A new job: its card at once, then what it reads, then its agent.
export async function startJob(stage: AgentStage, input: { ticket?: unknown; prs?: unknown }) {
  const ticket = typeof input.ticket === "string" && input.ticket.trim() ? input.ticket.trim().toUpperCase() : null
  const prs = [...new Set((Array.isArray(input.prs) ? input.prs : []).map(p => String(p).trim()).filter(Boolean))]
  if (!LOOSE.includes(stage)) throw new Error(`${NAME[stage]} takes no jobs yet`)
  const error = validJob(stage, { ticket, prs })
  if (error) throw new Error(error)
  await mkdir(JOBS, { recursive: true })
  let id = nextJobId(await readdir(JOBS))
  // Two at once: the second takes the next number.
  while (!(await mkdir(dirOf(id)).then(() => true, () => false))) id = nextJobId([...(await readdir(JOBS)), id])
  const refs = prs.map(u => prRef(u)!)
  const job: Job = { id, key: id, loose: true, ticket, prs: refs.map(r => ({ url: r.url, repo: r.repo, number: r.number, title: "", head: "", base: "", body: "", worktree: null })),
    summary: ticket ?? (refs.length === 1 ? `${refs[0]!.repo} #${refs[0]!.number}` : `${refs.length} PRs`), stage, status: "running", sessionId: null, runs: 1, startedAt: Date.now(), endedAt: null, askedAt: null, questions: [], error: null }
  await save(job)
  void run(job).catch(async err => save(failed((await stateOf(id)) ?? job, err)))
  return { id }
}

// What the job reads, ready for its agent: the PRs (each checked out), the
// ticket they name or the PRs that name it, its snapshot.
export async function prepareJob(start: Job): Promise<Job> {
  const dir = dirOf(start.id)
  const prs = await Promise.all(start.prs.map(p => prInfo(p.url)))
  const named = start.ticket ?? ticketFromPrs(prs, jiraSetup()?.projects ?? [])
  const family = named ? await ticketWithFamily(named).catch(err => (start.ticket ? Promise.reject(err) : null)) : null
  const ticket = family ? family.t.key : null
  if (family) {
    await Bun.write(join(dir, "ticket.md"), snapshotOf(family.t, family.parent, family.children, await linkedPages(family.t, family.parent)))
    await writeContextPages(dir)
  }
  const urls = prs.length ? [] : await prsNaming([family!.t.key, ...family!.children.map(c => c.key)])
  if (!prs.length && !urls.length) throw new Error(`No open PR names ${ticket} or its children`)
  const all = [...prs, ...(await Promise.all(urls.map(prInfo)))]
  const checked = await Promise.all(all.map(async p => ({ ...p, worktree: await checkout(dir, p) })))
  await writeJsonAtomic(join(dir, "prs.json"), unitsOfPrs(checked).map((u, i) => ({ id: u.id, ...checked[i]! })), { pretty: true })
  const title = family?.t.summary ?? (checked.length === 1 ? checked[0]!.title : `${checked.length} PRs`)
  return { ...start, ticket, prs: checked, units: unitsOfPrs(checked), summary: title }
}

async function run(start: Job) {
  const dir = dirOf(start.id)
  const ready = await prepareJob(start)
  await save(ready)
  const figma = linksFigma((await readText(join(dir, "ticket.md"))) ?? "") && existsSync(join(STAGES_DIR, "figma-mcp.json"))
  const session = randomUUID()
  const pid = await spawnStage(dir, session, jobPrompt(ready.stage as AgentStage, ready.id, dir, ready), ready.stage as AgentStage, () => void watchJobs(), figma)
  await save({ ...ready, sessionId: session, pid })
  if (ready.ticket) await applyAction(session, [session], "tickets", { started: [ready.ticket] })
}

// The jobs whose agent has ended: their result, read; their worktrees, removed.
const ending = new Set<string>()
export async function watchJobs() {
  for (const job of await jobs()) {
    if (job.status !== "running" || !job.pid || isAlive(job.pid) || ending.has(job.id)) continue
    ending.add(job.id)
    await finish(job)
      .catch(async err => save(failed((await stateOf(job.id)) ?? job, err)))
      .finally(() => (ending.delete(job.id), removeWorktrees(job), job.sessionId && putAway(job.sessionId)))
  }
}

async function finish(job: Job) {
  const text = await readText(join(dirOf(job.id), `${job.stage}.json`))
  if (!text) throw new Error(`The agent left no ${job.stage}.json`)
  const result = parseResult(text, job.stage)
  await save({ ...job, status: result.verdict === "needs-info" ? "needs-info" : "ready", questions: result.questions, findings: result.findings, prs: job.prs.map(p => ({ ...p, worktree: null })), endedAt: Date.now() })
}

// A job you are done with leaves the board (its files stay, put aside).
export async function clearJob(id: string) {
  const job = isJobId(id) ? await stateOf(id) : null
  if (!job) throw new Error("Not a job")
  if (job.status === "running") throw new Error("The job runs: wait for it to end")
  await rename(dirOf(id), `${dirOf(id)}.old-${Date.now()}`)
}

const WATCH_MS = 10_000
export const startJobsWatch = () => {
  void watchJobs()
  setInterval(() => void watchJobs(), WATCH_MS)
}
