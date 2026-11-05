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
import { jiraSetup, keysIn, ticket as jiraTicket } from "./jira"
import { activityOf } from "./activity"
import { applyAction } from "./board"
import { exec } from "./proc"
import { keptFiles } from "./evidence"
import { AS_AGENT, MARK, STAGES_DIR, TAG, adoptJob, buildProgress, checkedIn, isAlive, linkedPages, linksFigma, parseResult, putAway, snapshotOf, spawnStage, stateIn, ticketWithFamily, verbOf, withRun, withSpend, writeContextPages, type AgentStage, type Finding, type PipelineState, type Unit } from "./pipeline"

export type PrInfo = { url: string; repo: string; number: number; title: string; head: string; base: string; body: string; worktree: string | null }
export type JobInput = { ticket: string | null; prs: string[] }
export type Job = PipelineState & { id: string; loose: true; ticket: string | null; prs: PrInfo[]; done?: Done; published?: string[]; continued?: string }

const ROOT = join(DATA_DIR, "pipeline")
const JOBS = join(ROOT, "jobs")
const REPOS = join(ROOT, "repos")
const dirOf = (id: string) => join(JOBS, id)
const isJobId = (id: string) => /^JOB-\d+$/.test(id)
const isKey = (key: string) => /^[A-Z][A-Z0-9]+-\d+$/.test(key)
// The specialists that take jobs: all of them.
export const LOOSE: AgentStage[] = ["refine", "plan", "build", "review", "test", "smoke"]
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

// What the pipeline already did of the ticket, if it went through it: context the job reads.
const PIPELINE_FILES = ["refine.md", "plan.md", "plan.json", "build.json"] as const
type Done = Partial<Record<(typeof PIPELINE_FILES)[number], string>>
async function pipelineFiles(key: string): Promise<Done> {
  const paths = PIPELINE_FILES.map(f => [f, join(ROOT, key, f)] as const)
  return Object.fromEntries(paths.filter(([, path]) => existsSync(path)))
}
type BriefJob = { ticket: string | null; prs: PrInfo[]; done?: Done }
const LOOSE_NOTE = "No es una etapa del pipeline: nadie publica en Jira lo que dejas; lo lee una persona aquí."
const ticketLine = (dir: string) => `El ticket entero (descripción, comentarios, padre, hijos y links) está en ${join(dir, "ticket.md")}. El trabajo es el ticket y todos sus hijos.`
const criteriaLine = (dir: string, done: Done = {}) =>
  done["refine.md"] ? `Los criterios de aceptación están en el refinamiento del pipeline, ${done["refine.md"]}; el ticket, al día, en ${join(dir, "ticket.md")}: sus comentarios mandan.` : `No hay refinamiento: los criterios de aceptación salen del ticket, ${join(dir, "ticket.md")}.`
const resultLine = (dir: string, stage: string, schema: string) => `Escribe al final ${join(dir, `${stage}.json`)}: ${schema}`
const RESULTS = `{"verdict": "ready" | "needs-info", "questions": [...], "results": [{"id": "T1", "criterion": "...", "status": "pass" | "fail", "evidence": "...", "files": [{"path": "evidence/T1-desktop.png", "caption": "..."}]}]}`

const BRIEF: Record<AgentStage, (dir: string, job: BriefJob) => string> = {
  refine: (dir, { ticket }) => `Eres el refinador del equipo, en un encargo suelto: refinar el ticket ${ticket}. ${LOOSE_NOTE}

1. Lee ${join(STAGES_DIR, "refine.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si el ticket coordina a hijos entregables, sigue ${join(STAGES_DIR, "epic.md")} en lugar de refine.md.
2. ${ticketLine(dir)}
3. Escribe el refinamiento en ${join(dir, "refine.md")} y el resumen en ${join(dir, "refine.summary.md")}.
4. ${resultLine(dir, "refine", `{"verdict": "ready" | "needs-info", "questions": [{"id": "Q1", "question": "...", "proposal": "..."}]}`)}. Solo preguntas de PRODUCTO; las técnicas las decides tú.`,
  plan: (dir, { ticket, done }) => `Eres el planificador del equipo, en un encargo suelto: planificar el ticket ${ticket}. ${LOOSE_NOTE}

1. Lee ${join(STAGES_DIR, "plan.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si el ticket cambia datos que ya existen, lee también ${join(STAGES_DIR, "scripts.md")}.
2. ${ticketLine(dir)} ${done?.["refine.md"] ? `El refinamiento del pipeline está en ${done["refine.md"]}: úsalo.` : "No hay refinamiento: saca tú los criterios de aceptación del ticket y ponlos al principio de plan.md. Lo que solo una persona puede decidir va en questions, con su propuesta."}
3. Escribe el plan en ${join(dir, "plan.md")} y el resumen en ${join(dir, "plan.summary.md")}.
4. ${resultLine(dir, "plan", `{"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "subtasks": ["PP-..."], "branch": "...", "title": "...", "dependsOn": []}], "checklist": [{"id": "C1", "text": "...", "unit": "U1"}], "scripts": [...], "release": [...]}`)}.`,
  build: (dir, { ticket, done }) => `Eres el constructor del equipo, en un encargo suelto: construir el ticket ${ticket}. ${LOOSE_NOTE}

1. Lee ${join(STAGES_DIR, "build.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si el plan tiene \`scripts\`, lee también ${join(STAGES_DIR, "scripts.md")}.
2. ${ticketLine(dir)} ${done?.["plan.json"] ? `El plan del pipeline está en ${done["plan.md"] ?? done["plan.json"]} y ${done["plan.json"]}: síguelo.` : `No hay plan: haz primero uno siguiendo ${join(STAGES_DIR, "plan.md")}, escríbelo en ${join(dir, "plan.md")} y ${join(dir, "plan.json")}, y después construye con él.`}
3. Trabaja en ${join(dir, "work")}. Lo que ya hizo un run anterior está en ${join(dir, "build.progress.json")}: no lo repitas. Marca las tareas de la checklist en ${join(dir, "build.checklist.json")} en cuanto estén hechas.
4. Escribe el resumen en ${join(dir, "build.summary.md")}.
5. ${resultLine(dir, "build", `{"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "title": "...", "branch": "...", "status": "done" | "failed", "pr": "https://github.com/..." | null}]}`)}. Todas las unidades.`,
  review: (dir, { ticket, prs }) => `Eres el revisor del equipo, en un encargo suelto: revisar ${prs.length === 1 ? "una PR" : `${prs.length} PRs`}${ticket ? ` del ticket ${ticket}` : ""}. No es una etapa del pipeline: no hay refinamiento, plan, build.json, checks.json ni revisión anterior, y lo que review.md dice de ellos no aplica.

1. Lee ${join(STAGES_DIR, "review.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. Las PRs están en ${join(dir, "prs.json")}: cada una con su id (U1, U2…), URL, repo, rama, base y worktree. El código de cada PR está en su worktree, en la rama de la PR: léelo, no lo cambies. El cambio es \`git diff origin/<base>...HEAD\`. Si una PR no tiene worktree, usa \`gh pr diff <url>\`.
3. ${ticket ? `El ticket, con su padre, sus hijos y sus links, está en ${join(dir, "ticket.md")}. Juzga las PRs contra él: que hagan lo que pide y cumplan sus criterios de aceptación, además del código. Si no trae criterios, sácalos de la descripción.` : "No hay ticket: revisa solo el código (corrección, estructura, arquitectura y tests). Dilo en la primera línea de review.md."}
4. Escribe los hallazgos en ${join(dir, "review.md")} y el resumen en ${join(dir, "review.summary.md")}.
5. Escribe al final ${join(dir, "review.json")}: {"verdict": "ready", "questions": [], "findings": [{"id": "F1", "unit": "U1", "severity": "blocker" | "major" | "minor", "file": "ruta", "line": 12, "title": "...", "detail": "...", "fix": "..."}]}. "unit" es el id de la PR en prs.json. Lo que solo una persona puede decidir es un hallazgo, con la pregunta en "detail".`,
  test: (dir, { ticket, done }) => `Eres el tester del equipo, en un encargo suelto: probar en staging el ticket ${ticket}, tal como está desplegado ahora. ${LOOSE_NOTE}

1. Lee ${join(STAGES_DIR, "test.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. ${criteriaLine(dir, done)}${done?.["build.json"] ? ` Lo construido está en ${done["build.json"]}.` : ""}
3. Solo staging. Nunca prod: ni con STAGE=prod, ni con sus tablas, ni con sus URLs.
4. Escribe el informe en ${join(dir, "test.md")} y el resumen en ${join(dir, "test.summary.md")}.
5. ${resultLine(dir, "test", RESULTS)}. Guarda la evidencia de cada criterio en ${join(dir, "evidence")}.`,
  smoke: (dir, { ticket, done }) => `Eres el comprobador de prod del equipo, en un encargo suelto: comprobar en prod el ticket ${ticket}, tal como está desplegado ahora. ${LOOSE_NOTE}

1. Lee ${join(STAGES_DIR, "smoke.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. ${criteriaLine(dir, done)}
3. Solo lectura: en prod no creas, cambias ni borras nada.
4. Escribe el informe en ${join(dir, "smoke.md")} y el resumen en ${join(dir, "smoke.summary.md")}.
5. ${resultLine(dir, "smoke", RESULTS.replaceAll("T1", "P1"))}. Guarda la evidencia de cada criterio en ${join(dir, "evidence")}.`,
}

// What it may write outside its files: only the builder, its PRs as drafts.
const OUTSIDE: Partial<Record<AgentStage, string>> = { build: "No escribas en Jira. Abre cada PR como borrador; nunca mergees ni despliegues." }

export const jobPrompt = (stage: AgentStage, id: string, dir: string, job: BriefJob) => `${TAG} ${id} · ${verbOf(stage)} (encargo)

${BRIEF[stage](dir, job)}

${AS_AGENT}

${OUTSIDE[stage] ?? "No escribas en Jira, en GitHub ni en los repos: tu resultado son tus ficheros."}`

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
  return { ...(await activityOf(job.sessionId)), ...(await buildProgress(dirOf(id))) }
}

// ---------- GitHub ----------

const gh = async (args: string[], timeoutMs = 30_000) => {
  const r = await exec(["gh", ...args], { timeoutMs })
  if (r.code !== 0) throw new Error(r.stderr.trim() || `gh ${args[0]} failed`)
  return JSON.parse(r.stdout)
}
// A PR's details, kept a few minutes: what you write looks them up at every change.
const PR_MS = 3 * 60_000
const prCache = new Map<string, { at: number; info: Promise<PrInfo> }>()
function prInfo(url: string): Promise<PrInfo> {
  const kept = prCache.get(url)
  if (kept && Date.now() - kept.at < PR_MS) return kept.info
  const info = prInfoNow(url)
  prCache.set(url, { at: Date.now(), info })
  info.catch(() => prCache.delete(url))
  return info
}
async function prInfoNow(url: string): Promise<PrInfo> {
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

// What a job you are writing would take, before you send it: the ticket
// (yours, or the one the PRs name) with its title, and each PR with its
// title: yours, and the open ones that name the ticket or its children.
export type Resolved = { ticket: { key: string; summary: string; isNamed: boolean } | null; prs: (Pick<PrInfo, "url" | "repo" | "number" | "title"> & { isFound: boolean })[]; error: string | null }
const brief = (p: PrInfo, isFound: boolean) => ({ url: p.url, repo: p.repo, number: p.number, title: p.title, isFound })
export async function resolveJob(input: JobInput, findsPrs = true): Promise<Resolved> {
  const given = await Promise.all(input.prs.filter(u => prRef(u)).map(u => prInfo(prRef(u)!.url).catch(() => null)))
  const prs = given.filter((p): p is PrInfo => !!p)
  const missing = input.prs.length - prs.length
  const key = input.ticket ?? ticketFromPrs(prs, jiraSetup()?.projects ?? [])
  const t = key ? await jiraTicket(key).catch(() => null) : null
  const found = t && findsPrs && !prs.length ? await prsNaming([t.key, ...t.children.map(c => c.key)]) : []
  const more = await Promise.all(found.map(u => prInfo(u).catch(() => null)))
  const error = input.ticket && !t ? `${input.ticket} is not in Jira` : missing ? `${missing} PR${missing === 1 ? "" : "s"} not found on GitHub` : null
  return { ticket: t ? { key: t.key, summary: t.summary, isNamed: !input.ticket } : null, prs: [...prs.map(p => brief(p, false)), ...more.filter((p): p is PrInfo => !!p).map(p => brief(p, true))], error }
}

// ---------- on in the pipeline ----------

// A refinement, a plan or a build goes on in the pipeline from where the job
// left it (lib/pipeline.ts adoptJob); a build's worktrees move there with git.
export async function continueJob(id: string) {
  const job = isJobId(id) ? await stateOf(id) : null
  if (!job || job.status !== "ready" || !job.ticket) throw new Error("Not a job that ended with a ticket")
  if (job.continued) throw new Error(`Already in the pipeline as ${job.continued}`)
  const { units, checklist, checked, scripts, summary, sessionId, startedAt } = job
  await adoptJob(job.ticket, dirOf(id), job.stage as AgentStage, { units, checklist, checked, scripts, summary, sessionId, startedAt })
  if (job.stage === "build") await moveWorktrees(join(dirOf(id), "work"), join(ROOT, job.ticket, "work"))
  await save({ ...job, continued: job.ticket })
  return { key: job.ticket }
}

async function moveWorktrees(from: string, to: string) {
  await mkdir(to, { recursive: true })
  for (const name of await readdir(REPOS).catch(() => [] as string[])) {
    const list = await exec(["git", "-C", join(REPOS, name), "worktree", "list", "--porcelain"])
    for (const path of list.stdout.split("\n").filter(l => l.startsWith(`worktree ${from}/`)).map(l => l.slice(9)))
      await exec(["git", "-C", join(REPOS, name), "worktree", "move", path, join(to, path.slice(from.length + 1))], { timeoutMs: 60_000 })
  }
}

// ---------- publishing a review ----------

// The findings you chose, as one review a PR on GitHub: each on its line where
// it has one, the rest in the review's text (those of no PR, in the first one's).
const SEVERITY_NAME = { blocker: "Bloqueante", major: "Importante", minor: "Menor" } as const
const findingText = (f: Finding) => `**${SEVERITY_NAME[f.severity]}** · ${f.title}${f.detail ? `\n\n${f.detail}` : ""}${f.fix ? `\n\nArreglo: ${f.fix}` : ""}`
export function reviewsFor(findings: Finding[], units: Unit[], ticket: string | null) {
  const first = units[0]?.id
  return units.map(u => {
    const here = findings.filter(f => f.unit === u.id || (!units.some(x => x.id === f.unit) && u.id === first))
    const inline = here.filter(f => f.file && f.line)
    const loose = here.filter(f => !(f.file && f.line))
    const body = [`${MARK} · Revisión${ticket ? ` de ${ticket}` : ""}: ${here.length} hallazgo${here.length === 1 ? "" : "s"}.`, ...loose.map(findingText)].join("\n\n")
    return { pr: u.pr!, body, comments: inline.map(f => ({ path: f.file!, line: f.line!, side: "RIGHT" as const, body: findingText(f) })), count: here.length }
  }).filter(r => r.count > 0 && r.pr)
}

// Posts them, once you chose them. A line GitHub refuses (it is not in the
// change) leaves the inline comments out: they go in the review's text instead.
export async function publishReview(id: string, ids: string[]) {
  const job = isJobId(id) ? await stateOf(id) : null
  if (!job || job.stage !== "review" || job.status === "running" || job.status === "failed") throw new Error("Not a review that ended")
  const chosen = (job.findings ?? []).filter(f => ids.includes(f.id))
  if (!chosen.length) throw new Error("Choose the findings to publish")
  const reviews = reviewsFor(chosen, job.units ?? [], job.ticket)
  for (const r of reviews) {
    const ref = prRef(r.pr)!
    const post = (payload: object) => exec(["gh", "api", "--method", "POST", `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`, "--input", "-"], { input: JSON.stringify(payload), timeoutMs: 30_000 })
    let sent = await post({ event: "COMMENT", body: r.body, comments: r.comments })
    if (sent.code !== 0 && r.comments.length) sent = await post({ event: "COMMENT", body: [r.body, ...r.comments.map(c => `\`${c.path}:${c.line}\`\n\n${c.body}`)].join("\n\n") })
    if (sent.code !== 0) throw new Error(`${ref.repo} #${ref.number}: ${sent.stderr.trim() || "GitHub refused the review"}`)
  }
  await save({ ...job, published: [...new Set([...(job.published ?? []), ...chosen.map(f => f.id)])] })
  return { prs: reviews.length }
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
  const prs = start.stage === "review" ? await Promise.all(start.prs.map(p => prInfo(p.url))) : []
  const named = start.ticket ?? ticketFromPrs(prs, jiraSetup()?.projects ?? [])
  const family = named ? await ticketWithFamily(named).catch(err => (start.ticket ? Promise.reject(err) : null)) : null
  const ticket = family ? family.t.key : null
  if (family) {
    await Bun.write(join(dir, "ticket.md"), snapshotOf(family.t, family.parent, family.children, await linkedPages(family.t, family.parent)))
    await writeContextPages(dir)
  }
  // The rest take the ticket alone, and what the pipeline already did of it.
  if (start.stage !== "review") return { ...start, ticket, summary: family!.t.summary, done: await pipelineFiles(family!.t.key) }
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
  const dir = dirOf(job.id)
  // A plan's units and to-do list; a build's units, with their PRs; a test's results, with the files it kept.
  const made = job.stage === "plan" ? { units: result.units, checklist: result.checklist, scripts: result.scripts }
    : job.stage === "build" ? { units: result.units, checked: checkedIn(await readText(join(dir, "build.checklist.json"))) }
    : job.stage === "test" || job.stage === "smoke" ? { results: result.results.map(r => ({ ...r, files: keptFiles(dir, r.files ?? []) })) } : {}
  await save({ ...job, ...made, status: result.verdict === "needs-info" ? "needs-info" : "ready", questions: result.questions, findings: result.findings, prs: job.prs.map(p => ({ ...p, worktree: null })), endedAt: Date.now() })
}

// A job you are done with leaves the board (its files stay, put aside).
export async function clearJob(id: string) {
  const job = isJobId(id) ? await stateOf(id) : null
  if (!job) throw new Error("Not a job")
  if (job.status === "running") throw new Error("The job runs: wait for it to end")
  await rename(dirOf(id), `${dirOf(id)}.old-${Date.now()}`)
  // A build's worktrees went with its folder: the repos forget them.
  if (job.stage === "build") for (const name of await readdir(REPOS).catch(() => [] as string[])) await exec(["git", "-C", join(REPOS, name), "worktree", "prune"])
}

const WATCH_MS = 10_000
export const startJobsWatch = () => {
  void watchJobs()
  setInterval(() => void watchJobs(), WATCH_MS)
}
