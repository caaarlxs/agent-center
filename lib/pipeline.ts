// A ticket taken from Jira to done by agents, one stage at a time; each stage
// a session of its own, shown in the Pipeline view only and put away once it
// ends. Refine: an agent reads the ticket (a snapshot the board writes for
// it), the code and the docs, and decides whether another agent could build
// it without asking anything. Plan: from the refinement, the work in units,
// one a repo and a PR, each with its branch, files, tests and order. Build:
// one session that hands each unit to a subagent, in order, and opens a
// draft PR per unit (it never merges nor deploys). What
// only a person decides goes to Jira as questions, each with a proposal; the
// answers (here or in Jira) start the stage again, with them in the snapshot.
//
// The agent only reads and leaves its result in files; the board does the
// writing in Jira (comments, labels), and only on tickets assigned to you.
// The stages' instructions are not here: they belong to the team, in
// <data>/pipeline/stages (refine.md, plan.md, build.md, environment.md).
//
// The agents run clean: none of your settings, hooks, CLAUDE.md or
// connectors (they would cost tokens on every call, and the Jira one could
// write), each stage on its own model and effort.
//
// Each ticket keeps its state in <data>/pipeline/<KEY>/: state.json,
// ticket.md (the snapshot), and each stage's result: <stage>.md and <stage>.json.
// Starting over clears that and the labels, and keeps the comments: the
// questions and answers are context for the next run.

import { mkdir, readFile, rename } from "node:fs/promises"
import { join } from "node:path"
import { DATA_DIR } from "./config"
import { writeJsonAtomic } from "./files"
import { assignToMe, commentOn, labelTicket, ticket, type Ticket, type TicketComment } from "./jira"
import { launch, running } from "./launch"
import { applyAction } from "./board"
import { sessionSpend, type Spend } from "./usage"

export type Stage = "refine" | "plan" | "build"
export const isStage = (v: unknown): v is Stage => v === "refine" || v === "plan" || v === "build"
export type Question = { id: string; question: string; proposal: string }
// A unit of work: one repo, one PR.
export type Unit = { id: string; repo: string; subtask: string | null; branch: string; title: string; dependsOn: string[]; status?: "done" | "failed"; pr?: string | null }
export type Result = { verdict: "ready" | "needs-info"; questions: Question[]; units: Unit[] }
export type PipelineStatus = "running" | "needs-info" | "ready" | "failed"
export type Run = { n: number; stage: Stage; sessionId: string | null; startedAt: number; endedAt: number | null; status: PipelineStatus; questions: number; units: number; error: string | null; spend?: Spend | null }
export type PipelineState = {
  key: string
  summary?: string // the ticket's title, when the run started
  stage: Stage
  status: PipelineStatus
  sessionId: string | null
  runs: number
  startedAt: number
  endedAt: number | null
  askedAt: number | null // when the questions went to Jira
  questions: Question[]
  units?: Unit[] // the plan's, once it is ready
  error: string | null
  history?: Run[] // every run since the last start over, the latest last
}

export const MARK = "🤖 Agent Center"
// The first words of a stage's prompt: they tell its session from yours.
const TAG = "[Pipeline]"
export const pipelineKeyOf = (prompt?: string | null) => (prompt?.startsWith(`${TAG} `) ? (prompt.slice(TAG.length + 1).match(/^[A-Z][A-Z0-9]+-\d+/)?.[0] ?? null) : null)
export const LABELS = { on: "agent", needsInfo: "agent-needs-info", ready: "agent-ready", planned: "agent-planned", built: "agent-built" }
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
const STAGE: Record<Stage, StageDef> = {
  refine: {
    verb: "refinar", title: "Refinamiento", done: "refinado: listo para planificar", label: LABELS.ready, unlabel: [LABELS.planned, LABELS.built], model: "claude-opus-5-5", effort: "high", writes: false,
    brief: (key, dir) => `Eres la etapa 1 del pipeline: refinar el ticket ${key}.

1. Lee ${join(STAGES_DIR, "refine.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. El ticket entero (descripción, comentarios, padre, hijos y links) está en ${join(dir, "ticket.md")}. Las respuestas a preguntas anteriores están en sus comentarios: no vuelvas a preguntar lo que ya está respondido.
3. Escribe el refinamiento en ${join(dir, "refine.md")} y el resumen en ${join(dir, "refine.summary.md")}.
4. Escribe al final ${join(dir, "refine.json")}: {"verdict": "ready" | "needs-info", "questions": [{"id": "Q1", "question": "...", "proposal": "..."}]}. Solo preguntas de PRODUCTO; las técnicas las decides tú.`,
  },
  plan: {
    verb: "planificar", title: "Plan", done: "planificado: listo para construir", label: LABELS.planned, unlabel: [LABELS.ready, LABELS.built], model: "claude-opus-5-5", effort: "medium", writes: false,
    brief: (key, dir) => `Eres la etapa 2 del pipeline: planificar el ticket ${key}, ya refinado.

1. Lee ${join(STAGES_DIR, "plan.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. El refinamiento aprobado está en ${join(dir, "refine.md")}. El ticket, al día, en ${join(dir, "ticket.md")}: sus comentarios mandan.
3. Escribe el plan en ${join(dir, "plan.md")} y el resumen en ${join(dir, "plan.summary.md")}.
4. Escribe al final ${join(dir, "plan.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "subtask": "PP-...", "branch": "...", "title": "...", "dependsOn": []}]}.`,
  },
  build: {
    verb: "construir", title: "Construcción", done: "construido: PRs abiertas", label: LABELS.built, unlabel: [LABELS.ready, LABELS.planned], model: "claude-opus-5-5", effort: "high", writes: true,
    brief: (key, dir) => `Eres la etapa 3 del pipeline: construir el ticket ${key}, ya planificado.

1. Lee ${join(STAGES_DIR, "build.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. El plan está en ${join(dir, "plan.md")} y ${join(dir, "plan.json")}; el refinamiento, en ${join(dir, "refine.md")}; el ticket, en ${join(dir, "ticket.md")}.
3. Trabaja en ${join(dir, "work")}. Lo que ya hizo un run anterior está en ${join(dir, "build.progress.json")}: no lo repitas.
4. Escribe el resumen en ${join(dir, "build.summary.md")} y al final ${join(dir, "build.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "title": "...", "branch": "...", "status": "done" | "failed", "pr": "https://github.com/..." | null}]}.`,
  },
}
// Clean: no user settings (your model, effort, hooks, plugins and CLAUDE.md
// come from there), no connectors; its model and effort; and, for a stage
// that writes, the repos' folder too.
export const argsFor = (stage: Stage, root = ROOT) => {
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
  if (stage === "plan" && data.verdict === "ready" && !units.length) throw new Error("plan.json is ready but has no units")
  return { verdict: data.verdict, questions, units }
}

export const questionsComment = (key: string, questions: Question[], stage: Stage) =>
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
  const run: Run = { n: s.runs, stage: s.stage, sessionId: s.sessionId, startedAt: s.startedAt, endedAt: s.endedAt, status: s.status, questions: s.questions.length, units: s.units?.length ?? 0, error: s.error }
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
  if (state?.status === "running" && state.sessionId && !running.has(state.sessionId) && !(await readText(join(dirOf(key), `${state.stage}.json`)))) {
    state = { ...state, status: "failed", error: "The session ended without a result", endedAt: Date.now() }
    await save(state)
  }
  // A stage's document; the build has only its summary.
  const doc = async (stage: Stage) => (state ? ((await readText(join(dirOf(key), `${stage}.md`))) ?? readText(join(dirOf(key), `${stage}.summary.md`))) : null)
  return { state: state && (await withSpend(state)), refine: await doc("refine"), plan: await doc("plan"), build: await doc("build") }
}

// ---------- the stage ----------

const promptFor = (key: string, dir: string, stage: Stage) => `${TAG} ${key} · ${STAGE[stage].verb}

${STAGE[stage].brief(key, dir)}

${AS_AGENT}

No escribas en Jira${STAGE[stage].writes ? "" : " ni en los repos"}: el board publica lo que dejas en tus ficheros.`

// Runs a stage; whatever fails before the session starts leaves a failed state.
const run = (key: string, runs: number, stage: Stage) =>
  runStage(key, runs, stage).catch(async err => save({ ...(await fresh(key, runs, stage)), status: "failed", error: String(err?.message ?? err), endedAt: Date.now() }))
const EMPTY = (key: string, runs: number, stage: Stage): PipelineState =>
  ({ key, stage, status: "running", sessionId: null, runs, startedAt: Date.now(), endedAt: null, askedAt: null, questions: [], error: null })
// A new run, with the ticket's history so far.
const fresh = async (key: string, runs: number, stage: Stage): Promise<PipelineState> => {
  const prev = await stateOf(key)
  return { ...EMPTY(key, runs, stage), summary: prev?.summary, history: prev?.history ?? [] }
}
// A stage's session is the pipeline's, not yours: once it ends it leaves the
// board (its log stays a click away in the ticket), and never goes to Claude desktop.
const putAway = (id: string) => void applyAction(id, [id], "archive", {}).catch(() => {})

async function runStage(key: string, runs: number, stage: Stage) {
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
  const fail = async (error: string) => save({ ...((await stateOf(key)) ?? state), status: "failed", error, endedAt: Date.now() })
  try {
    const id = await launch(dir, promptFor(key, dir, stage), done => void finish(key).catch(err => fail(String(err?.message ?? err))).finally(() => putAway(done)), argsFor(stage), "auto",
      failed => void fail("The session ended with an error").finally(() => putAway(failed)))
    await save({ ...state, sessionId: id })
    await applyAction(id, [id], "tickets", { started: [key] })
  } catch (err) {
    await fail((err as Error).message)
  }
}

// The stage ended: its questions go to Jira, or the ticket is ready for the next.
async function finish(key: string) {
  const dir = dirOf(key)
  const state = (await stateOf(key))!
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
  await save({ ...state, status: "ready", questions: [], units: result.units, endedAt: Date.now() })
}

// The stage a start runs: the one asked for, else the ticket's own (again).
// Planning needs the refinement done; building, the plan.
export function stageToRun(state: PipelineState | null, asked?: Stage): Stage {
  const stage = asked ?? state?.stage ?? "refine"
  const after = (prev: Stage) => state?.stage === stage || (state?.stage === prev && state.status === "ready")
  if (stage === "plan" && !after("refine")) throw new Error("Plan needs the refinement done first")
  if (stage === "build" && !after("plan")) throw new Error("Build needs the plan done first")
  return stage
}

// Starts the pipeline on a ticket of yours (or runs a stage again); taking
// it, when you ask, makes it yours first.
export async function startPipeline(key: string, take = false, asked?: Stage) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  const state = await stateOf(key)
  if (state?.status === "running") throw new Error("A stage already runs on this ticket")
  const stage = stageToRun(state, asked)
  if (take) await assignToMe(key)
  await labelTicket(key, [LABELS.on], []) // also checks that it is yours
  void run(key, (state?.runs ?? 0) + 1, stage)
}

// Your answers, written here: to Jira, and the stage again.
export async function answerPipeline(key: string, answers: Record<string, string>) {
  const state = await stateOf(key)
  if (state?.status !== "needs-info") throw new Error("This ticket waits for no answers")
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
    if (state.status !== "needs-info" || !state.askedAt) continue
    try {
      const t = await ticket(state.key)
      if (answeredAfter(t.comments, state.askedAt)) {
        await labelTicket(state.key, [], [LABELS.needsInfo])
        void run(state.key, state.runs + 1, state.stage)
      }
    } catch {}
  }
}
export const startPipelinePoll = () => setInterval(() => void poll(), POLL_MS)
