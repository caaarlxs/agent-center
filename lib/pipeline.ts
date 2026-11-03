// A ticket taken from Jira to done by agents, one stage at a time; each stage
// a session of its own, on the board like any other. The first stage
// refines: an agent reads the ticket (a snapshot the board writes for it),
// the code and the docs, and decides whether another agent could build it
// without asking anything. What only a person decides goes to Jira as
// questions, each with a proposal; the answers (here or in Jira) start the
// stage again, with them in the snapshot.
//
// The agent only reads and leaves its result in files; the board does the
// writing in Jira (comments, labels), and only on tickets assigned to you.
// The stages' instructions are not here: they belong to the team, in
// <data>/pipeline/stages (refine.md, environment.md).
//
// Each ticket keeps its state in <data>/pipeline/<KEY>/: state.json,
// ticket.md (the snapshot), refine.md and refine.json (the agent's result).
// Starting over clears that and the labels, and keeps the comments: the
// questions and answers are context for the next run.

import { mkdir, readFile, rename } from "node:fs/promises"
import { join } from "node:path"
import { DATA_DIR } from "./config"
import { writeJsonAtomic } from "./files"
import { commentOn, labelTicket, ticket, type Ticket, type TicketComment } from "./jira"
import { launch, running } from "./launch"
import { applyAction } from "./board"
import { activate } from "./client"

export type Question = { id: string; question: string; proposal: string }
export type Refine = { verdict: "ready" | "needs-info"; questions: Question[] }
export type PipelineStatus = "running" | "needs-info" | "ready" | "failed"
export type PipelineState = {
  key: string
  stage: "refine"
  status: PipelineStatus
  sessionId: string | null
  runs: number
  startedAt: number
  endedAt: number | null
  askedAt: number | null // when the questions went to Jira
  questions: Question[]
  error: string | null
}

export const MARK = "🤖 Agent Center"
export const LABELS = { on: "agent", needsInfo: "agent-needs-info", ready: "agent-ready" }
const ROOT = join(DATA_DIR, "pipeline")
export const STAGES_DIR = join(ROOT, "stages")
const POLL_MS = 3 * 60_000
const COMMENT_CHARS = 9_500

const dirOf = (key: string) => join(ROOT, key)
const isKey = (key: string) => /^[A-Z][A-Z0-9]+-\d+$/.test(key)

// ---------- what the agent leaves and what goes to Jira ----------

// The agent's refine.json: a verdict, and the questions when it needs info.
export function parseRefine(text: string): Refine {
  const data = JSON.parse(text)
  if (data?.verdict !== "ready" && data?.verdict !== "needs-info") throw new Error("refine.json has no verdict")
  const questions: Question[] = (Array.isArray(data.questions) ? data.questions : [])
    .filter((q: any) => typeof q?.question === "string" && q.question.trim())
    .map((q: any, i: number) => ({ id: String(q.id ?? `Q${i + 1}`), question: q.question.trim(), proposal: String(q.proposal ?? "").trim() }))
  if (data.verdict === "needs-info" && !questions.length) throw new Error("refine.json needs info but asks nothing")
  return { verdict: data.verdict, questions }
}

export const questionsComment = (key: string, questions: Question[]) =>
  `${MARK} · Refinamiento de ${key}\n\nAntes de implementar faltan estas decisiones. Cada una trae una propuesta: si vale, basta con responder "ok".\n\n` +
  questions.map(q => `${q.id}. ${q.question}\nPropuesta: ${q.proposal || "—"}`).join("\n\n")

// Your answers: a question left blank takes its proposal.
export const answersComment = (questions: Question[], answers: Record<string, string>) =>
  `Respuestas a las preguntas del refinamiento\n\n` +
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
    return JSON.parse(await readFile(join(dirOf(key), "state.json"), "utf8"))
  } catch {
    return null
  }
}
const save = (s: PipelineState) => writeJsonAtomic(join(dirOf(s.key), "state.json"), s, { pretty: true })
const readText = (path: string) => readFile(path, "utf8").catch(() => null)

// The state, the result and the questions, for the ticket's view. A run whose
// session is gone without a result (the board restarted) is a failed one.
export async function pipelineOf(key: string) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  let state = await stateOf(key)
  if (state?.status === "running" && state.sessionId && !running.has(state.sessionId) && !(await readText(join(dirOf(key), "refine.json")))) {
    state = { ...state, status: "failed", error: "The session ended without a result", endedAt: Date.now() }
    await save(state)
  }
  return { state, refine: state ? await readText(join(dirOf(key), "refine.md")) : null }
}

// ---------- the stage ----------

const promptFor = (key: string, dir: string) => `[Pipeline] ${key} · refinar

Eres la etapa 1 del pipeline: refinar el ticket ${key}.

1. Lee ${join(STAGES_DIR, "refine.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. El ticket entero (descripción, comentarios, padre, hijos y links) está en ${join(dir, "ticket.md")}. Las respuestas a preguntas anteriores están en sus comentarios: no vuelvas a preguntar lo que ya está respondido.
3. Escribe el refinamiento completo en ${join(dir, "refine.md")}.
4. Escribe al final ${join(dir, "refine.json")}: {"verdict": "ready" | "needs-info", "questions": [{"id": "Q1", "question": "...", "proposal": "..."}]}. Solo preguntas de PRODUCTO; las técnicas las decides tú.

No escribas en Jira ni en los repos: el board publica tus preguntas.`

// Runs the stage; whatever fails before the session starts leaves a failed state.
const run = (key: string, runs: number) =>
  runStage(key, runs).catch(err => save({ ...EMPTY(key, runs), status: "failed", error: String(err?.message ?? err), endedAt: Date.now() }))
const EMPTY = (key: string, runs: number): PipelineState =>
  ({ key, stage: "refine", status: "running", sessionId: null, runs, startedAt: Date.now(), endedAt: null, askedAt: null, questions: [], error: null })

async function runStage(key: string, runs: number) {
  const dir = dirOf(key)
  await mkdir(dir, { recursive: true })
  for (const f of ["refine.json", "refine.md"]) await rename(join(dir, f), join(dir, `${f}.prev`)).catch(() => {})
  const t = await ticket(key)
  const [parent, children] = await Promise.all([
    t.parent ? ticket(t.parent.key).catch(() => null) : null,
    Promise.all(t.children.slice(0, 15).map(c => ticket(c.key).catch(() => null))).then(all => all.filter(Boolean) as Ticket[]),
  ])
  await Bun.write(join(dir, "ticket.md"), snapshotOf(t, parent, children))
  const state = EMPTY(key, runs)
  await save(state)
  const fail = async (error: string) => save({ ...((await stateOf(key)) ?? state), status: "failed", error, endedAt: Date.now() })
  try {
    const id = await launch(dir, promptFor(key, dir), done => void (finish(key).catch(err => fail(String(err?.message ?? err))), activate(done)), [], "auto",
      () => void fail("The session ended with an error"))
    await save({ ...state, sessionId: id })
    await applyAction(id, [id], "tickets", { started: [key] })
  } catch (err) {
    await fail((err as Error).message)
  }
}

// The stage ended: its questions go to Jira, or the ticket is ready.
async function finish(key: string) {
  const dir = dirOf(key)
  const state = (await stateOf(key))!
  const text = await readText(join(dir, "refine.json"))
  if (!text) throw new Error("The agent left no refine.json")
  const refine = parseRefine(text)
  if (refine.verdict === "needs-info") {
    await commentOn(key, questionsComment(key, refine.questions))
    await labelTicket(key, [LABELS.needsInfo], [LABELS.ready])
    await save({ ...state, status: "needs-info", questions: refine.questions, askedAt: Date.now(), endedAt: Date.now() })
    return
  }
  const md = (await readText(join(dir, "refine.md"))) ?? ""
  await commentOn(key, `${MARK} · ${key} refinado: listo para planificar\n\n${md.slice(0, COMMENT_CHARS)}${md.length > COMMENT_CHARS ? "\n\n(…recortado)" : ""}`)
  await labelTicket(key, [LABELS.ready], [LABELS.needsInfo])
  await save({ ...state, status: "ready", questions: [], endedAt: Date.now() })
}

// Starts the pipeline on a ticket of yours (or runs the stage again).
export async function startPipeline(key: string) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  const state = await stateOf(key)
  if (state?.status === "running") throw new Error("A stage already runs on this ticket")
  await labelTicket(key, [LABELS.on], []) // also checks that it is yours
  void run(key, (state?.runs ?? 0) + 1)
}

// Your answers, written here: to Jira, and the stage again.
export async function answerPipeline(key: string, answers: Record<string, string>) {
  const state = await stateOf(key)
  if (state?.status !== "needs-info") throw new Error("This ticket waits for no answers")
  await commentOn(key, answersComment(state.questions, answers))
  await labelTicket(key, [], [LABELS.needsInfo])
  void run(key, state.runs + 1)
}

// From zero: no state, no labels; the comments stay as context.
export async function resetPipeline(key: string) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  if ((await stateOf(key))?.status === "running") throw new Error("A stage runs: wait for it to end")
  await labelTicket(key, [], [LABELS.on, LABELS.needsInfo, LABELS.ready])
  await rename(dirOf(key), `${dirOf(key)}.old-${Date.now()}`).catch(() => {})
}

// Answers written in Jira (by you or anyone): the stage runs again.
async function poll() {
  const keys = await Array.fromAsync(new Bun.Glob("*/state.json").scan({ cwd: ROOT })).catch(() => [] as string[])
  for (const path of keys) {
    const state = await stateOf(path.split("/")[0]!)
    if (state?.status !== "needs-info" || !state.askedAt) continue
    try {
      const t = await ticket(state.key)
      if (answeredAfter(t.comments, state.askedAt)) {
        await labelTicket(state.key, [], [LABELS.needsInfo])
        void run(state.key, state.runs + 1)
      }
    } catch {}
  }
}
export const startPipelinePoll = () => setInterval(() => void poll(), POLL_MS)
