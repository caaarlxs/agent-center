// A ticket taken from Jira to done by agents, one stage at a time; each stage
// a session of its own, shown in the Pipeline view only and put away once it
// ends. Refine: an agent reads the ticket (a snapshot the board writes for
// it), the code and the docs, and decides whether another agent could build
// it without asking anything. Plan: from the refinement, the work in units,
// one a repo and a PR, each with its branch, files, tests and order. Build:
// one session that hands each unit to a subagent, in order, and opens a
// draft PR per unit (it never merges nor deploys). Review: an agent reads
// the PRs against the refinement and the plan and leaves its findings; the
// blockers and majors go back to Build, on the same branches. Staging and
// Prod: no agent, the board itself takes the PRs there step by step (see
// lib/release.ts), and waits for you wherever it matters. What
// only a person decides goes to Jira as questions, each with a proposal; the
// answers (here or in Jira) start the stage again, with them in the snapshot.
//
// The agent only reads and leaves its result in files; the board does the
// writing in Jira (comments, labels), and only on tickets assigned to you.
// The stages' instructions are not here: they belong to the team, in
// <data>/pipeline/stages (refine.md, plan.md, build.md, review.md, environment.md).
//
// The agents run clean: none of your settings, hooks, CLAUDE.md or
// connectors (they would cost tokens on every call, and the Jira one could
// write), each stage on its own model and effort.
//
// Each ticket keeps its state in <data>/pipeline/<KEY>/: state.json,
// ticket.md (the snapshot), and each stage's result: <stage>.md and <stage>.json.
// Starting over clears that and the labels, and keeps the comments: the
// questions and answers are context for the next run.

import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { openSync } from "node:fs"
import { mkdir, readFile, rename } from "node:fs/promises"
import { join } from "node:path"
import { DATA_DIR } from "./config"
import { writeJsonAtomic } from "./files"
import { assignToMe, commentOn, labelTicket, ticket, type Ticket, type TicketComment } from "./jira"
import { claudeBinary, running } from "./launch"
import { claudeEnv } from "./proc"
import { applyAction } from "./board"
import { sessionSpend, type Spend } from "./usage"
import { activityOf } from "./activity"
import { existsSync } from "node:fs"
import { exec } from "./proc"
import { DEFAULT_CONFIG, advanceRelease, approveStep, releaseSteps, retryStep, skipStep, type DeployConfig, type OrderItem, type Ops, type Release } from "./release"

export type Stage = "refine" | "plan" | "build" | "review" | "staging" | "prod"
const STAGE_NAMES: Stage[] = ["refine", "plan", "build", "review", "staging", "prod"]
export const isStage = (v: unknown): v is Stage => STAGE_NAMES.includes(v as Stage)
// The stages the board runs itself: a release to an environment.
type AgentStage = Exclude<Stage, Env>
const isRelease = (stage: Stage): stage is Env => stage === "staging" || stage === "prod"
export type Question = { id: string; question: string; proposal: string }
// A unit of work: one repo, one PR.
export type Unit = { id: string; repo: string; subtask: string | null; branch: string; title: string; dependsOn: string[]; status?: "done" | "failed"; pr?: string | null }
// An item of the plan's to-do list: what gets done, in plain words, and its unit.
export type ChecklistItem = { id: string; text: string; unit: string | null }
// A script a plan runs on the data (a backfill, a migration): its unit, the
// command, when it runs and where. It simulates unless EXECUTE=true, and
// leaves a report of every record it touches (REPORT=<file.csv>).
export type Env = "staging" | "prod"
export type PlanScript = { id: string; unit: string | null; title: string; command: string; when: string; envs: Env[] }
// What a review found in a unit's PR: how bad, where, and how to fix it.
export type Severity = "blocker" | "major" | "minor"
export type Finding = { id: string; unit: string | null; severity: Severity; file: string | null; line: number | null; title: string; detail: string; fix: string }
export type Result = { verdict: "ready" | "needs-info"; questions: Question[]; units: Unit[]; checklist: ChecklistItem[]; findings: Finding[]; fixed: string[]; scripts: PlanScript[]; order: OrderItem[] }
export type PipelineStatus = "running" | "needs-info" | "ready" | "failed"
export type Run = { n: number; stage: Stage; sessionId: string | null; startedAt: number; endedAt: number | null; status: PipelineStatus; questions: number; units: number; findings?: number; error: string | null; spend?: Spend | null }
export type PipelineState = {
  key: string
  summary?: string // the ticket's title, when the run started
  stage: Stage
  status: PipelineStatus
  sessionId: string | null
  pid?: number | null // the stage's process, on its own: it outlives a restart of the board
  runs: number
  startedAt: number
  endedAt: number | null
  askedAt: number | null // when the questions went to Jira
  questions: Question[]
  units?: Unit[] // the plan's, once it is ready (then the build's)
  checklist?: ChecklistItem[] // the plan's to-do list
  scripts?: PlanScript[] // the plan's scripts on the data
  order?: OrderItem[] // the plan's order for a release
  release?: Release | null // the release at hand (staging, then prod)
  checked?: string[] // the items of it the build marked done
  findings?: Finding[] // the last review's
  fixed?: string[] // the findings a build fixed since
  error: string | null
  history?: Run[] // every run since the last start over, the latest last
}

export const MARK = "🤖 Agent Center"
// The first words of a stage's prompt: they tell its session from yours.
const TAG = "[Pipeline]"
export const pipelineKeyOf = (prompt?: string | null) => (prompt?.startsWith(`${TAG} `) ? (prompt.slice(TAG.length + 1).match(/^[A-Z][A-Z0-9]+-\d+/)?.[0] ?? null) : null)
export const LABELS = { on: "agent", needsInfo: "agent-needs-info", ready: "agent-ready", planned: "agent-planned", built: "agent-built", reviewed: "agent-reviewed", staging: "agent-staging", prod: "agent-prod" }
const ROOT = join(DATA_DIR, "pipeline")
export const STAGES_DIR = join(ROOT, "stages")
const POLL_MS = 3 * 60_000
const COMMENT_CHARS = 9_500

const dirOf = (key: string) => join(ROOT, key)
const isKey = (key: string) => /^[A-Z][A-Z0-9]+-\d+$/.test(key)

// How every agent works, whatever its stage: for the next agent, not for a person.
const AS_AGENT = `Trabajas sin una persona delante:
- No narres entre pasos ni escribas un mensaje final: tu resultado son los ficheros.
- Escribe para el siguiente agente: listas, campos y rutas, sin prosa ni repeticiones.
- Lee solo lo que necesitas: \`git grep -n\` y rangos de líneas (\`git show <ref>:<fichero> | sed -n 'a,bp'\`), no ficheros enteros.
- El resumen (\`<etapa>.summary.md\`) es lo único para una persona, y va a Jira: lo que debe saber, en 300 palabras como máximo.`

// Each stage: its verb in the prompt, what its comments say, the label it
// leaves when it is done (and the ones it takes off), its model and effort,
// whether it writes in the repos, and what it asks the agent.
type StageDef = { verb: string; title: string; done: string; label: string; unlabel: string[]; model: string; effort: string; writes: boolean; brief: (key: string, dir: string) => string }
const STAGE: Record<AgentStage, StageDef> = {
  refine: {
    verb: "refinar", title: "Refinamiento", done: "refinado: listo para planificar", label: LABELS.ready, unlabel: [LABELS.planned, LABELS.built, LABELS.reviewed], model: "claude-opus-5-5", effort: "high", writes: false,
    brief: (key, dir) => `Eres la etapa 1 del pipeline: refinar el ticket ${key}.

1. Lee ${join(STAGES_DIR, "refine.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. El ticket entero (descripción, comentarios, padre, hijos y links) está en ${join(dir, "ticket.md")}. Las respuestas a preguntas anteriores están en sus comentarios: no vuelvas a preguntar lo que ya está respondido.
3. Escribe el refinamiento en ${join(dir, "refine.md")} y el resumen en ${join(dir, "refine.summary.md")}.
4. Escribe al final ${join(dir, "refine.json")}: {"verdict": "ready" | "needs-info", "questions": [{"id": "Q1", "question": "...", "proposal": "..."}]}. Solo preguntas de PRODUCTO; las técnicas las decides tú.`,
  },
  plan: {
    verb: "planificar", title: "Plan", done: "planificado: listo para construir", label: LABELS.planned, unlabel: [LABELS.ready, LABELS.built, LABELS.reviewed], model: "claude-opus-5-5", effort: "medium", writes: false,
    brief: (key, dir) => `Eres la etapa 2 del pipeline: planificar el ticket ${key}, ya refinado.

1. Lee ${join(STAGES_DIR, "plan.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si el ticket cambia datos que ya existen, lee también ${join(STAGES_DIR, "scripts.md")}.
2. El refinamiento aprobado está en ${join(dir, "refine.md")}. El ticket, al día, en ${join(dir, "ticket.md")}: sus comentarios mandan.
3. Escribe el plan en ${join(dir, "plan.md")} y el resumen en ${join(dir, "plan.summary.md")}.
4. Escribe al final ${join(dir, "plan.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "subtask": "PP-...", "branch": "...", "title": "...", "dependsOn": []}], "checklist": [{"id": "C1", "text": "...", "unit": "U1"}], "scripts": [{"id": "S1", "unit": "U1", "title": "...", "command": "...", "when": "...", "envs": ["staging", "prod"]}], "release": [{"step": "manual", "text": "...", "envs": ["staging"]}, {"step": "unit", "id": "U1"}, {"step": "script", "id": "S1"}]}.`,
  },
  build: {
    verb: "construir", title: "Construcción", done: "construido: PRs abiertas", label: LABELS.built, unlabel: [LABELS.ready, LABELS.planned, LABELS.reviewed], model: "claude-opus-5-5", effort: "high", writes: true,
    brief: (key, dir) => `Eres la etapa 3 del pipeline: construir el ticket ${key}, ya planificado.

1. Lee ${join(STAGES_DIR, "build.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si plan.json tiene \`scripts\`, lee también ${join(STAGES_DIR, "scripts.md")}.
2. El plan está en ${join(dir, "plan.md")} y ${join(dir, "plan.json")}; el refinamiento, en ${join(dir, "refine.md")}; el ticket, en ${join(dir, "ticket.md")}.
3. Trabaja en ${join(dir, "work")}. Lo que ya hizo un run anterior está en ${join(dir, "build.progress.json")}: no lo repitas. Marca las tareas de la checklist del plan en ${join(dir, "build.checklist.json")} en cuanto estén hechas.
4. Si existe ${join(dir, "review.fix.json")}, la revisión ya pasó: este run arregla solo los hallazgos que lista (\`{"fix": ["F1"]}\`; detalle en ${join(dir, "review.md")}), en las mismas ramas y PRs. Sigue la sección "Arreglar la revisión" de build.md.
5. Escribe el resumen en ${join(dir, "build.summary.md")} y al final ${join(dir, "build.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "title": "...", "branch": "...", "status": "done" | "failed", "pr": "https://github.com/..." | null}], "fixed": ["F1"]}. Todas las unidades, también las que no tocas.`,
  },
  review: {
    verb: "revisar", title: "Revisión", done: "revisado", label: LABELS.reviewed, unlabel: [LABELS.ready, LABELS.planned, LABELS.built], model: "claude-opus-5-5", effort: "high", writes: false,
    brief: (key, dir) => `Eres la etapa 4 del pipeline: revisar las PRs del ticket ${key}, ya construido.

1. Lee ${join(STAGES_DIR, "review.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si plan.json tiene \`scripts\`, lee también ${join(STAGES_DIR, "scripts.md")}.
2. Las PRs están en ${join(dir, "build.json")}; el plan, en ${join(dir, "plan.md")}; el refinamiento y sus criterios de aceptación, en ${join(dir, "refine.md")}; el ticket, en ${join(dir, "ticket.md")}. El código de cada unidad está en su worktree de ${join(dir, "work")}: léelo, no lo cambies.
3. Si existe ${join(dir, "review.json.prev")}, es la revisión anterior: comprueba primero que sus hallazgos están arreglados.
4. Escribe los hallazgos en ${join(dir, "review.md")} y el resumen en ${join(dir, "review.summary.md")}.
5. Escribe al final ${join(dir, "review.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "findings": [{"id": "F1", "unit": "U1", "severity": "blocker" | "major" | "minor", "file": "ruta", "line": 12, "title": "...", "detail": "...", "fix": "..."}]}.`,
  },
}
// Clean: no user settings (your model, effort, hooks, plugins and CLAUDE.md
// come from there), no connectors; its model and effort; and, for a stage
// that writes, the repos' folder too.
export const argsFor = (stage: AgentStage, root = ROOT) => {
  const s = STAGE[stage]
  return ["--setting-sources", "project,local", "--strict-mcp-config", "--model", s.model, "--effort", s.effort, ...(s.writes ? ["--add-dir", join(root, "repos")] : [])]
}

const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : [])
// A plan's units; a build's also say how each went and its PR.
const unitsIn = (v: unknown, isBuild: boolean): Unit[] =>
  listOf(v)
    .filter(u => typeof u?.repo === "string" && u.repo.trim() && typeof u?.title === "string" && u.title.trim())
    .map((u, i) => ({ id: String(u.id ?? `U${i + 1}`), repo: u.repo.trim(), subtask: typeof u.subtask === "string" && u.subtask ? u.subtask : null,
      branch: String(u.branch ?? ""), title: u.title.trim(), dependsOn: listOf(u.dependsOn).map(String),
      ...(isBuild ? { status: u.status === "done" ? ("done" as const) : ("failed" as const), pr: typeof u.pr === "string" && u.pr ? u.pr : null } : {}) }))

const SEVERITIES: Severity[] = ["blocker", "major", "minor"]
const textOf = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const findingsIn = (v: unknown): Finding[] =>
  listOf(v)
    .filter(f => textOf(f?.title))
    .map((f, i) => ({ id: String(f.id ?? `F${i + 1}`), unit: textOf(f.unit) || null, severity: SEVERITIES.includes(f.severity) ? f.severity : "minor",
      file: textOf(f.file) || null, line: Number.isInteger(f.line) ? f.line : null, title: textOf(f.title), detail: textOf(f.detail), fix: textOf(f.fix) }))
const ENVS: Env[] = ["staging", "prod"]
const scriptsIn = (v: unknown): PlanScript[] =>
  listOf(v)
    .filter(x => textOf(x?.title) && textOf(x?.command))
    .map((x, i) => ({ id: String(x.id ?? `S${i + 1}`), unit: textOf(x.unit) || null, title: textOf(x.title), command: textOf(x.command), when: textOf(x.when),
      envs: ENVS.filter(e => listOf(x.envs).includes(e)) }))
const orderIn = (v: unknown): OrderItem[] =>
  listOf(v)
    .filter(x => ["unit", "script", "manual"].includes(x?.step) && (x.step === "manual" ? textOf(x.text) : textOf(x.id)))
    .map(x => ({ kind: x.step, id: textOf(x.id) || null, text: textOf(x.text) || null, envs: ENVS.filter(e => listOf(x.envs).includes(e)) }))
// The findings that stop a ticket: they go back to Build.
export const blocking = (findings: Finding[] | undefined) => (findings ?? []).filter(f => f.severity !== "minor")
// The findings a build after a review fixes: the ones that stop the ticket,
// or all of them when you ask for the minors too.
export const toFixNow = (findings: Finding[] | undefined, isAll: boolean) => (isAll ? (findings ?? []) : blocking(findings)).map(f => f.id)

// The to-do items the build marked done (build.checklist.json: {"done": [...]} or a list).
export function checkedIn(text: string | null): string[] {
  try {
    const data = text ? JSON.parse(text) : null
    return listOf(Array.isArray(data) ? data : data?.done).map(String)
  } catch {
    return []
  }
}

// What a build left undone: the units without a PR, or none at all.
export function unbuilt(units: Unit[]): string | null {
  if (!units.length) return "The build left no units"
  const left = units.filter(u => u.status !== "done" || !u.pr).map(u => u.id)
  return left.length ? `No PR for ${left.join(", ")}` : null
}

// The agent's <stage>.json: a verdict, the questions when it needs info, and
// a plan's units.
export function parseResult(text: string, stage: Stage): Result {
  const data = JSON.parse(text)
  if (data?.verdict !== "ready" && data?.verdict !== "needs-info") throw new Error(`${stage}.json has no verdict`)
  const questions: Question[] = listOf(data.questions)
    .filter(q => typeof q?.question === "string" && q.question.trim())
    .map((q, i) => ({ id: String(q.id ?? `Q${i + 1}`), question: q.question.trim(), proposal: String(q.proposal ?? "").trim() }))
  if (data.verdict === "needs-info" && !questions.length) throw new Error(`${stage}.json needs info but asks nothing`)
  const units = unitsIn(data.units, stage === "build")
  const checklist: ChecklistItem[] = listOf(data.checklist)
    .filter(c => typeof c?.text === "string" && c.text.trim())
    .map((c, i) => ({ id: String(c.id ?? `C${i + 1}`), text: c.text.trim(), unit: typeof c.unit === "string" && c.unit ? c.unit : null }))
  if (stage === "plan" && data.verdict === "ready" && !units.length) throw new Error("plan.json is ready but has no units")
  return { verdict: data.verdict, questions, units, checklist, findings: findingsIn(data.findings), fixed: listOf(data.fixed).map(String), scripts: scriptsIn(data.scripts), order: orderIn(data.release) }
}

export const questionsComment = (key: string, questions: Question[], stage: AgentStage) =>
  `${MARK} · ${STAGE[stage].title} de ${key}\n\nAntes de implementar faltan estas decisiones. Cada una trae una propuesta: si vale, basta con responder "ok".\n\n` +
  questions.map(q => `${q.id}. ${q.question}\nPropuesta: ${q.proposal || "—"}`).join("\n\n")

// Your answers: a question left blank takes its proposal.
export const answersComment = (questions: Question[], answers: Record<string, string>) =>
  `Respuestas a las preguntas del pipeline\n\n` +
  questions.map(q => `${q.id}. ${q.question}\n→ ${answers[q.id]?.trim() || q.proposal || "—"}`).join("\n\n")

// A person wrote in the ticket after the questions.
export const answeredAfter = (comments: TicketComment[], since: number) =>
  comments.some(c => c.at > since && !c.body.trimStart().startsWith(MARK))

const date = (at: number) => (at ? new Date(at).toISOString().slice(0, 10) : "—")

// The ticket as the agent reads it: all of it, its parent, its sub-tasks
// (each whole) and its links.
export function snapshotOf(t: Ticket, parent: Ticket | null, children: Ticket[]): string {
  const parts = [
    `# ${t.key} · ${t.summary}`,
    `Tipo: ${t.type ?? "—"} · Estado: ${t.status} · Prioridad: ${t.priority ?? "—"} · Asignado: ${t.assignee ?? "nadie"} · Reporter: ${t.reporter ?? "—"}`,
    `## Descripción\n\n${t.description || "(sin descripción)"}`,
    `## Comentarios\n\n${t.comments.length ? t.comments.map(c => `**${c.author} · ${date(c.at)}**\n\n${c.body}`).join("\n\n---\n\n") : "(ninguno)"}`,
  ]
  if (t.parent) parts.push(`## Padre: ${t.parent.key} · ${t.parent.summary}\n\n${parent?.description || "(sin descripción)"}`)
  if (children.length) parts.push(`## Hijos\n\n${children.map(c => `### ${c.key} · ${c.summary} (${c.status})\n\n${c.description || "(sin descripción)"}`).join("\n\n")}`)
  if (t.links.length) parts.push(`## Links\n\n${t.links.map(l => `- ${l.how} ${l.ticket.key} · ${l.ticket.summary} (${l.ticket.status})`).join("\n")}`)
  return parts.join("\n\n") + "\n"
}

// ---------- the state ----------

async function stateOf(key: string): Promise<PipelineState | null> {
  try {
    return withRun(JSON.parse(await readFile(join(dirOf(key), "state.json"), "utf8"))) // a state from before the history has its run in it
  } catch {
    return null
  }
}
// The state with its run in the history: added the first time, then kept up to date.
export function withRun(s: PipelineState): PipelineState {
  const run: Run = { n: s.runs, stage: s.stage, sessionId: s.sessionId, startedAt: s.startedAt, endedAt: s.endedAt, status: s.status, questions: s.questions.length, units: s.units?.length ?? 0, ...(s.stage === "review" ? { findings: s.findings?.length ?? 0 } : {}), error: s.error }
  return { ...s, history: [...(s.history ?? []).filter(r => r.n !== s.runs), run].sort((a, b) => a.n - b.n) }
}
const save = (s: PipelineState) => writeJsonAtomic(join(dirOf(s.key), "state.json"), withRun(s), { pretty: true })
const readText = (path: string) => readFile(path, "utf8").catch(() => null)
// Each run with what its session spent, read from its transcript (only what
// was added since the last look): never saved, so it is always the session's own.
const withSpend = async (s: PipelineState): Promise<PipelineState> =>
  ({ ...s, history: await Promise.all((s.history ?? []).map(async r => ({ ...r, spend: r.sessionId ? await sessionSpend(r.sessionId) : null }))) })

// The state and each stage's document, for the ticket's view. A run whose
// session is gone without a result (the board restarted) is a failed one.
export async function pipelineOf(key: string) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  let state = await stateOf(key)
  // A run from before the stages ran on their own: gone with the board that started it.
  if (state?.status === "running" && !state.pid && state.sessionId && !running.has(state.sessionId) && !(await readText(join(dirOf(key), `${state.stage}.json`)))) {
    state = { ...state, status: "failed", error: "The session ended without a result", endedAt: Date.now() }
    await save(state)
  }
  // A stage's document; the build has only its summary.
  const doc = async (stage: Stage) => (state ? ((await readText(join(dirOf(key), `${stage}.md`))) ?? readText(join(dirOf(key), `${stage}.summary.md`))) : null)
  return { state: state && (await withSpend(state)), refine: await doc("refine"), plan: await doc("plan"), build: await doc("build"), review: await doc("review"), preview: await previewOf(state) }
}

// What the running stage does now: its session's steps and subagents, and,
// while it builds, how far each unit got (build.progress.json).
export async function pipelineActivity(key: string) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  const state = await stateOf(key)
  if (state?.status !== "running" || !state.sessionId) return { steps: [], helpers: [], units: [], checked: [] }
  const progress = await readText(join(dirOf(key), "build.progress.json"))
  let units: Unit[] = []
  try {
    const data = progress ? JSON.parse(progress) : null
    units = unitsIn(Array.isArray(data) ? data : data?.units, true)
  } catch {}
  return { ...(await activityOf(state.sessionId)), units, checked: checkedIn(await readText(join(dirOf(key), "build.checklist.json"))) }
}

// ---------- the stage ----------

const promptFor = (key: string, dir: string, stage: AgentStage) => `${TAG} ${key} · ${STAGE[stage].verb}

${STAGE[stage].brief(key, dir)}

${AS_AGENT}

No escribas en Jira${STAGE[stage].writes ? "" : " ni en los repos"}: el board publica lo que dejas en tus ficheros.`

// Runs a stage; whatever fails before the session starts leaves a failed state.
const run = (key: string, runs: number, stage: AgentStage) =>
  runStage(key, runs, stage).catch(async err => save({ ...(await fresh(key, runs, stage)), status: "failed", error: String(err?.message ?? err), endedAt: Date.now() }))
const EMPTY = (key: string, runs: number, stage: Stage): PipelineState =>
  ({ key, stage, status: "running", sessionId: null, runs, startedAt: Date.now(), endedAt: null, askedAt: null, questions: [], error: null })
// A new run, with the ticket's history so far.
const fresh = async (key: string, runs: number, stage: Stage): Promise<PipelineState> => {
  const prev = await stateOf(key)
  // The plan's units and to-do list, and the review's findings, stay with the ticket for the stages after it.
  return { ...EMPTY(key, runs, stage), summary: prev?.summary, history: prev?.history ?? [], units: prev?.units, checklist: prev?.checklist, checked: prev?.checked, scripts: prev?.scripts,
    ...(stage === "review" ? {} : { findings: prev?.findings, fixed: stage === "build" ? [] : prev?.fixed }) }
}
// A stage's session is the pipeline's, not yours: once it ends it leaves the
// board (its log stays a click away in the ticket), and never goes to Claude desktop.
const putAway = (id: string) => void applyAction(id, [id], "archive", {}).catch(() => {})

async function runStage(key: string, runs: number, stage: AgentStage) {
  const dir = dirOf(key)
  await mkdir(dir, { recursive: true })
  for (const f of [`${stage}.json`, `${stage}.md`, `${stage}.summary.md`]) await rename(join(dir, f), join(dir, `${f}.prev`)).catch(() => {})
  const t = await ticket(key)
  const [parent, children] = await Promise.all([
    t.parent ? ticket(t.parent.key).catch(() => null) : null,
    Promise.all(t.children.slice(0, 15).map(c => ticket(c.key).catch(() => null))).then(all => all.filter(Boolean) as Ticket[]),
  ])
  await Bun.write(join(dir, "ticket.md"), snapshotOf(t, parent, children))
  const state = { ...(await fresh(key, runs, stage)), summary: t.summary }
  await save(state)
  const id = randomUUID()
  const pid = await spawnStage(dir, id, promptFor(key, dir, stage), stage, () => void watch())
  await save({ ...state, sessionId: id, pid })
  await applyAction(id, [id], "tickets", { started: [key] })
}

// A stage's session, started on its own (its own process group, its output to
// <stage>.log), so restarting the board never stops it: the board learns it
// ended by watching its process, not by being its parent.
async function spawnStage(dir: string, id: string, prompt: string, stage: AgentStage, onExit: () => void): Promise<number> {
  const log = openSync(join(dir, `${stage}.log`), "a")
  const proc = spawn(await claudeBinary(), ["-p", "--session-id", id, "--output-format", "stream-json", "--verbose", "--permission-mode", "auto", ...argsFor(stage), "--", prompt],
    { cwd: dir, env: claudeEnv({ AGENT_CENTER_LAUNCH: "1" }), detached: true, stdio: ["ignore", log, log] })
  if (!proc.pid) throw new Error("Claude Code did not start")
  proc.on("exit", onExit)
  proc.unref()
  return proc.pid
}

const isAlive = (pid: number) => {
  try {
    return process.kill(pid, 0), true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM"
  }
}

// The runs whose process has ended: their result goes to Jira (or they
// failed), and their session is put away. Every few seconds, at once when a
// process the board started ends, and when the board starts.
const ending = new Set<string>()
async function watch() {
  for (const state of await pipelines()) {
    if (state.status === "running" && isRelease(state.stage)) void tickRelease(state.key)
    if (state.status !== "running" || !state.pid || isAlive(state.pid) || ending.has(state.key)) continue
    ending.add(state.key)
    await finish(state.key)
      .catch(async err => save({ ...((await stateOf(state.key)) ?? state), status: "failed", error: String(err?.message ?? err), endedAt: Date.now() }))
      .finally(() => (ending.delete(state.key), state.sessionId && putAway(state.sessionId)))
  }
}

// The stage ended: its questions go to Jira, or the ticket is ready for the next.
async function finish(key: string) {
  const dir = dirOf(key)
  const state = (await stateOf(key))!
  if (isRelease(state.stage)) return
  const stage = STAGE[state.stage]
  const text = await readText(join(dir, `${state.stage}.json`))
  if (!text) throw new Error(`The agent left no ${state.stage}.json`)
  const result = parseResult(text, state.stage)
  if (result.verdict === "needs-info") {
    await commentOn(key, questionsComment(key, result.questions, state.stage))
    await labelTicket(key, [LABELS.needsInfo], [stage.label])
    await save({ ...state, status: "needs-info", questions: result.questions, askedAt: Date.now(), endedAt: Date.now() })
    return
  }
  // A build is done only with a PR for every unit; else it shows what it did and failed.
  const left = state.stage === "build" ? unbuilt(result.units) : null
  if (left) return void (await save({ ...state, status: "failed", error: left, units: result.units, endedAt: Date.now() }))
  // Jira gets the summary for people; the whole document, cut, only when there is none.
  const md = (await readText(join(dir, `${state.stage}.summary.md`))) ?? (await readText(join(dir, `${state.stage}.md`))) ?? ""
  const prs = result.units.filter(u => u.pr).map(u => `- ${u.repo}: ${u.pr}`).join("\n")
  await commentOn(key, `${MARK} · ${key} ${stage.done}\n\n${prs ? `${prs}\n\n` : ""}${md.slice(0, COMMENT_CHARS)}${md.length > COMMENT_CHARS ? "\n\n(…recortado)" : ""}`)
  await labelTicket(key, [stage.label], [LABELS.needsInfo, ...stage.unlabel])
  const checklist = state.stage === "plan" ? result.checklist : state.checklist
  const scripts = state.stage === "plan" ? result.scripts : state.scripts
  const checked = state.stage === "build" ? checkedIn(await readText(join(dir, "build.checklist.json"))) : state.checked
  // A review keeps the build's units (it has none of its own) and leaves its findings.
  const units = state.stage === "review" ? state.units : result.units
  const found = state.stage === "review" ? { findings: result.findings, fixed: [] } : state.stage === "build" ? { fixed: result.fixed } : {}
  await save({ ...state, status: "ready", questions: [], units, checklist, checked, scripts, ...found, endedAt: Date.now() })
}

// The stage a start runs: the one asked for, else the ticket's own (again).
// Planning needs the refinement done; building, the plan (or a review, to
// fix what it found); reviewing, the build; staging, a review with nothing
// to fix; prod, staging.
const NEEDS: Partial<Record<Stage, [Stage[], string]>> = {
  plan: [["refine"], "Plan needs the refinement done first"],
  build: [["plan", "review"], "Build needs the plan done first"],
  review: [["build"], "Review needs the build done first"],
  staging: [["review"], "Staging needs a review with nothing to fix"],
  prod: [["staging"], "Prod needs staging done first"],
}
export function stageToRun(state: PipelineState | null, asked?: Stage): Stage {
  const stage = asked ?? state?.stage ?? "refine"
  const need = NEEDS[stage]
  const isAfter = (prev: Stage) => state?.stage === prev && state.status === "ready" && !(stage === "staging" && blocking(state.findings).length)
  if (need && state?.stage !== stage && !need[0].some(isAfter)) throw new Error(need[1])
  return stage
}

// Starts the pipeline on a ticket of yours (or runs a stage again); taking
// it, when you ask, makes it yours first. A build after a review fixes what
// it found (review.fix.json): what stops the ticket, or, if you ask, the minors too.
export async function startPipeline(key: string, take = false, asked?: Stage, isFixAll = false) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  const state = await stateOf(key)
  if (state?.status === "running") throw new Error("A stage already runs on this ticket")
  const stage = stageToRun(state, asked)
  if (take) await assignToMe(key)
  await labelTicket(key, [LABELS.on], []) // also checks that it is yours
  if (isRelease(stage)) return startRelease(state!, stage)
  if (stage === "build" && state?.stage === "review") await writeJsonAtomic(join(dirOf(key), "review.fix.json"), { fix: toFixNow(state.findings, isFixAll) }, { pretty: true })
  else if (stage !== "build") await rename(join(dirOf(key), "review.fix.json"), join(dirOf(key), "review.fix.json.prev")).catch(() => {})
  void run(key, (state?.runs ?? 0) + 1, stage)
}

// ---------- the release ----------

// How the team's repos deploy (stages/deploy.json), over the defaults.
async function deployConfig(): Promise<DeployConfig> {
  const text = await readText(join(STAGES_DIR, "deploy.json"))
  const data = text ? JSON.parse(text) : {}
  return { ...DEFAULT_CONFIG, ...data, default: { ...DEFAULT_CONFIG.default, ...data.default }, tag: { ...DEFAULT_CONFIG.tag, ...data.tag } }
}

// A release to an environment: its steps, from the plan; or, when it failed,
// the same one again from the step that failed.
async function startRelease(state: PipelineState, env: Env) {
  const resumed = state.stage === env && state.release ? retryStep(state.release, state.release.steps.find(s => s.status === "failed")?.id ?? "") : null
  const release = resumed ?? { env, steps: releaseSteps(state, env, await deployConfig()) }
  const next = resumed ? state : { ...(await fresh(state.key, state.runs + 1, env)), summary: state.summary }
  await save({ ...next, stage: env, status: "running", error: null, endedAt: null, release })
  void tickRelease(state.key)
}

const releaseOps: Ops = {
  sh: async (cmd, options) => {
    const r = await exec(cmd, { cwd: options?.cwd, timeoutMs: options?.timeoutMs ?? 20_000 })
    return { ok: r.code === 0, out: r.stdout.trim(), err: r.stderr.trim() }
  },
  now: Date.now,
  // A script runs on its own, like a stage: a restart of the board does not stop it.
  spawn: async (cwd, line, env, log, exit) => {
    await mkdir(join(log, ".."), { recursive: true })
    const out = openSync(log, "a")
    const proc = spawn("/bin/zsh", ["-lc", `${line}; echo $? > ${JSON.stringify(exit)}`],
      { cwd, env: { ...process.env, ...env, PATH: `${cwd}/.venv/bin:${cwd}/node_modules/.bin:${process.env.PATH}` }, detached: true, stdio: ["ignore", out, out] })
    if (!proc.pid) throw new Error("The script did not start")
    proc.unref()
    return proc.pid
  },
  isAlive,
  readText,
  exists: existsSync,
}

// Takes a ticket's release as far as it goes now; done, it goes to Jira.
const ticking = new Set<string>()
async function tickRelease(key: string) {
  if (ticking.has(key)) return
  ticking.add(key)
  try {
    const state = await stateOf(key)
    if (!state?.release || state.status !== "running" || !isRelease(state.stage)) return
    const ctx = { key, summary: state.summary ?? key, dir: dirOf(key), repos: join(ROOT, "repos"), config: await deployConfig(), units: state.units ?? [], scripts: state.scripts ?? [], checklist: state.checklist ?? [] }
    const { release, isDone, failed } = await advanceRelease(state.release, ctx, releaseOps)
    const step = failed ? release.steps.find(s => s.id === failed) : undefined
    if (!isDone) return void (await save({ ...state, release, ...(step ? { status: "failed", error: `${step.title}: ${step.error ?? step.detail ?? "failed"}`, endedAt: Date.now() } : {}) }))
    await commentOn(key, releaseComment(key, release))
    await labelTicket(key, [LABELS[release.env]], [LABELS.needsInfo, LABELS.ready, LABELS.planned, LABELS.built, LABELS.reviewed, ...(release.env === "prod" ? [LABELS.staging] : [])])
    await save({ ...state, release, status: "ready", endedAt: Date.now() })
  } catch (err) {
    console.error(`release ${key}:`, err)
  } finally {
    ticking.delete(key)
  }
}

const MARKS = { done: "✓", skipped: "–", failed: "✗", pending: "·", waiting: "·", running: "·" }
export const releaseComment = (key: string, release: Release) =>
  `${MARK} · ${key} en ${release.env}\n\n` + release.steps.map(s => `${MARKS[s.status]} ${s.title}${s.value && s.kind === "tag" ? ` (${s.value})` : ""}${s.detail ? `: ${s.detail}` : ""}`).join("\n")

// You, on the step at hand: go on (a tag of your own, if you write one), past it.
export async function stepPipeline(key: string, id: string, action: "approve" | "skip", value?: string) {
  const state = await stateOf(key)
  if (!state?.release || !isRelease(state.stage)) throw new Error("No release on this ticket")
  const release = action === "approve" ? approveStep(state.release, id, value) : skipStep(state.release, id)
  await save({ ...state, release, status: "running", error: null, endedAt: null })
  void tickRelease(key)
}

// A script's report, as it left it.
export async function pipelineReport(key: string, file: string) {
  if (!isKey(key) || !/^S\w*-(staging|prod)-(simulate|execute)\.csv$/.test(file)) throw new Error("Not a report")
  return readText(join(dirOf(key), "scripts", file))
}

// The steps a release would take, before you start it.
async function previewOf(state: PipelineState | null) {
  if (!state || state.status !== "ready") return null
  const env: Env | null = state.stage === "review" && !blocking(state.findings).length ? "staging" : state.stage === "staging" ? "prod" : null
  return env ? { env, steps: releaseSteps(state, env, await deployConfig()) } : null
}

// Your answers, written here: to Jira, and the stage again.
export async function answerPipeline(key: string, answers: Record<string, string>) {
  const state = await stateOf(key)
  if (state?.status !== "needs-info" || isRelease(state.stage)) throw new Error("This ticket waits for no answers")
  await commentOn(key, answersComment(state.questions, answers))
  await labelTicket(key, [], [LABELS.needsInfo])
  void run(key, state.runs + 1, state.stage)
}

// From zero: no state, no labels; the comments stay as context.
export async function resetPipeline(key: string) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  if ((await stateOf(key))?.status === "running") throw new Error("A stage runs: wait for it to end")
  await labelTicket(key, [], Object.values(LABELS))
  await rename(dirOf(key), `${dirOf(key)}.old-${Date.now()}`).catch(() => {})
}

// Every ticket in the pipeline (not the runs started over), the latest first.
export async function pipelines(): Promise<PipelineState[]> {
  const paths = await Array.fromAsync(new Bun.Glob("*/state.json").scan({ cwd: ROOT })).catch(() => [] as string[])
  const states = await Promise.all(paths.map(p => p.split("/")[0]!).filter(isKey).map(stateOf))
  return Promise.all(states.filter((s): s is PipelineState => !!s).sort((a, b) => b.startedAt - a.startedAt).map(withSpend))
}

// Answers written in Jira (by you or anyone): the stage runs again.
async function poll() {
  for (const state of await pipelines()) {
    if (state.status !== "needs-info" || !state.askedAt || isRelease(state.stage)) continue
    try {
      const t = await ticket(state.key)
      if (answeredAfter(t.comments, state.askedAt)) {
        await labelTicket(state.key, [], [LABELS.needsInfo])
        void run(state.key, state.runs + 1, state.stage)
      }
    } catch {}
  }
}
const WATCH_MS = 10_000
export const startPipelinePoll = () => {
  void watch()
  setInterval(() => void watch(), WATCH_MS)
  setInterval(() => void poll(), POLL_MS)
}
