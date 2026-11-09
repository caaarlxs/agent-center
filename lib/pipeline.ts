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
// writing in Jira (comments, labels, and the statuses of jira.json: see
// jira-flow.ts), and only on tickets assigned to you.
// The stages' instructions are not here: they belong to the team, in
// <data>/pipeline/stages (refine.md, plan.md, build.md, review.md, environment.md, jira.md).
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
import { cp, mkdir, readFile, rename } from "node:fs/promises"
import { basename, join } from "node:path"
import { DATA_DIR } from "./config"
import { writeJsonAtomic } from "./files"
import { assignToMe, attachTo, commentOn, createIssue, confluenceIds, confluencePage, createSubtask, issueState, remoteLinks, type ConfluencePage, labelTicket, moveToStatus, openStatuses, ticket, type Ticket, type TicketComment } from "./jira"
import { flowOf, followInJira, type Event as JiraEvent } from "./jira-flow"
import { childrenIn, deliverablesOf, toStart, waitsFor, type Child } from "./coordinator"
import { evidenceType, filesIn, keptFiles, type EvidenceFile } from "./evidence"
import { debtIn, merged as debtMerged, ticketOf as debtTicket, type DebtEntry, type DebtItem } from "./debt"
import { claudeBinary, running } from "./launch"
import { claudeEnv } from "./proc"
import { applyAction } from "./board"
import { sessionSpend, type Spend } from "./usage"
import { activityOf } from "./activity"
import { existsSync } from "node:fs"
import { exec } from "./proc"
import { overLimits, prChecks, reposClean, type Check } from "./checks"
import { canJudge, gatePrompt, parseAdvice } from "./gate"
import { readdir } from "node:fs/promises"
import { DEFAULT_CONFIG, advanceRelease, approveStep, releaseSteps, retryStep, rollbackSteps, skipStep, type DeployConfig, type OrderItem, type Ops, type Release, type ReleaseStep } from "./release"

export type Stage = "refine" | "plan" | "build" | "review" | "staging" | "test" | "prod" | "smoke"
const STAGE_NAMES: Stage[] = ["refine", "plan", "build", "review", "staging", "test", "prod", "smoke"]
export const isStage = (v: unknown): v is Stage => STAGE_NAMES.includes(v as Stage)
// The stages the board runs itself: a release to an environment.
export type AgentStage = Exclude<Stage, Env>
const isRelease = (stage: Stage): stage is Env => stage === "staging" || stage === "prod"
// context: why it is asked and what the answer changes, for a person.
export type Question = { id: string; question: string; proposal: string; context?: string }
// A unit of work: one repo, one PR.
export type Unit = { id: string; repo: string; subtask: string | null; subtasks?: string[]; branch: string; title: string; dependsOn: string[]; status?: "done" | "failed"; pr?: string | null }
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
// What a test (in staging) or a smoke check (in prod) found of each criterion.
// untested: the test could not try it (no data, no device), which is no failure: a person checks it by hand.
// summary: what it tried, expected and found, in plain words; evidence: the technical detail.
export type TestResult = { id: string; criterion: string; status: "pass" | "fail" | "untested"; evidence: string; summary?: string; files?: EvidenceFile[] }
// A rule of the team's context (its repo) that the ticket makes untrue: the file and the words.
// quote: the words of today it makes untrue; null for a new code rule, which says what it proposes instead.
export type ContextImpact = { file: string; quote: string | null; why: string; proposal: string | null }
export type Result = { verdict: "ready" | "needs-info"; questions: Question[]; units: Unit[]; checklist: ChecklistItem[]; findings: Finding[]; fixed: string[]; scripts: PlanScript[]; order: OrderItem[]; results: TestResult[]; contextImpact: ContextImpact[]; children?: unknown; debt: DebtItem[] }
export type PipelineStatus = "running" | "needs-info" | "ready" | "failed"
// kept: what the run left, to see each pass of a stage apart (a plan's or a build's units, a review's findings, a test's results).
export type Kept = { units?: Unit[]; checklist?: ChecklistItem[]; findings?: Finding[]; results?: TestResult[] }
export type Run = { n: number; stage: Stage; sessionId: string | null; startedAt: number; endedAt: number | null; status: PipelineStatus; questions: number; units: number; findings?: number; error: string | null; spend?: Spend | null; kept?: Kept }
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
  release?: Release | null // the release at hand (staging, then prod), or its rollback
  deployed?: Partial<Record<Env, Release>> // each release that ended, to roll back
  results?: TestResult[] // the last test's (or smoke check's), criterion by criterion
  contextImpact?: ContextImpact[] // the refinement's: what of the team's context the ticket changes
  checks?: Check[] // what the board checked of the last run, by itself
  checked?: string[] // the items of it the build marked done
  findings?: Finding[] // the last review's
  fixed?: string[] // the findings a build fixed since
  fixes?: string[] // the [Fix] sub-tasks a failed test opened in Jira
  fixOf?: Record<string, string> // the one open for each criterion that failed
  children?: Child[] // a coordinator's children, in the order they go (coordinator.ts)
  parent?: string | null // the coordinator a child's pipeline belongs to
  auto?: boolean // runs on by itself, stage after stage, until the review (autoNext)
  error: string | null
  history?: Run[] // every run since the last start over, the latest last
  threads?: Record<string, Turn[]> // what a person asked the agent about a question, result or finding of this run (askPipeline)
}
// One question to the agent about what it left, and its answer (null while it thinks).
export type Turn = { q: string; a: string | null; at: number; error?: string | null; session?: string | null }

export const MARK = "🤖 Agent Center"
// The first words of a stage's prompt: they tell its session from yours.
export const TAG = "[Pipeline]"
export const pipelineKeyOf = (prompt?: string | null) => (prompt?.startsWith(`${TAG} `) ? (prompt.slice(TAG.length + 1).match(/^[A-Z][A-Z0-9]+-\d+/)?.[0] ?? null) : null)
export const LABELS = { on: "agent", needsInfo: "agent-needs-info", ready: "agent-ready", planned: "agent-planned", built: "agent-built", reviewed: "agent-reviewed", staging: "agent-staging", tested: "agent-tested", prod: "agent-prod", live: "agent-live" }
const ROOT = join(DATA_DIR, "pipeline")
export const STAGES_DIR = join(ROOT, "stages")
const POLL_MS = 3 * 60_000
const COMMENT_CHARS = 9_500
const PAGE_CHARS = 40_000 // a Confluence page, in the snapshot
const MAX_PAGES = 5

const dirOf = (key: string) => join(ROOT, key)
const isKey = (key: string) => /^[A-Z][A-Z0-9]+-\d+$/.test(key)

// How every agent works, whatever its stage: for the next agent, not for a person.
export const AS_AGENT = `Trabajas sin una persona delante:
- No narres entre pasos ni escribas un mensaje final: tu resultado son los ficheros.
- Escribe para el siguiente agente: listas, campos y rutas, sin prosa ni repeticiones.
- Lee solo lo que necesitas: \`git grep -n\` y rangos de líneas (\`git show <ref>:<fichero> | sed -n 'a,bp'\`), no ficheros enteros.
- El resumen (\`<etapa>.summary.md\`) es lo único para una persona, y va a Jira: lo que debe saber, en 300 palabras como máximo.
- Lo que lee una persona va en lenguaje normal, sin jerga ni nombres de campos (y si un término técnico hace falta, lo explicas en la misma frase): el resumen, cada pregunta y su \`context\` (por qué lo preguntas y qué cambia según la respuesta), y el \`summary\` de cada resultado de un test (qué probaste, qué esperabas, qué pasó y por qué importa). El detalle técnico va en \`evidence\`.`

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
4. Escribe al final ${join(dir, "refine.json")}: {"verdict": "ready" | "needs-info", "questions": [{"id": "Q1", "question": "...", "context": "...", "proposal": "..."}]}. Solo preguntas de PRODUCTO; las técnicas las decides tú.`,
  },
  plan: {
    verb: "planificar", title: "Plan", done: "planificado: listo para construir", label: LABELS.planned, unlabel: [LABELS.ready, LABELS.built, LABELS.reviewed], model: "claude-opus-5-5", effort: "medium", writes: false,
    brief: (key, dir) => `Eres la etapa 2 del pipeline: planificar el ticket ${key}, ya refinado.

1. Lee ${join(STAGES_DIR, "plan.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si el ticket cambia datos que ya existen, lee también ${join(STAGES_DIR, "scripts.md")}.
2. El refinamiento aprobado está en ${join(dir, "refine.md")}. El ticket, al día, en ${join(dir, "ticket.md")}: sus comentarios mandan.
3. Escribe el plan en ${join(dir, "plan.md")} y el resumen en ${join(dir, "plan.summary.md")}.
4. Escribe al final ${join(dir, "plan.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "subtasks": ["PP-...", "PP-..."], "branch": "...", "title": "...", "dependsOn": []}], "checklist": [{"id": "C1", "text": "...", "unit": "U1"}], "scripts": [{"id": "S1", "unit": "U1", "title": "...", "command": "...", "when": "...", "envs": ["staging", "prod"]}], "release": [{"step": "manual", "text": "...", "envs": ["staging"]}, {"step": "unit", "id": "U1"}, {"step": "script", "id": "S1"}]}.`,
  },
  build: {
    verb: "construir", title: "Construcción", done: "construido: PRs abiertas", label: LABELS.built, unlabel: [LABELS.ready, LABELS.planned, LABELS.reviewed], model: "claude-opus-5-5", effort: "high", writes: true,
    brief: (key, dir) => `Eres la etapa 3 del pipeline: construir el ticket ${key}, ya planificado.

1. Lee ${join(STAGES_DIR, "build.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si plan.json tiene \`scripts\`, lee también ${join(STAGES_DIR, "scripts.md")}.
2. El plan está en ${join(dir, "plan.md")} y ${join(dir, "plan.json")}; el refinamiento, en ${join(dir, "refine.md")}; el ticket, en ${join(dir, "ticket.md")}.
3. Trabaja en ${join(dir, "work")}. Lo que ya hizo un run anterior está en ${join(dir, "build.progress.json")}: no lo repitas. Marca las tareas de la checklist del plan en ${join(dir, "build.checklist.json")} en cuanto estén hechas.
4. Si existe ${join(dir, "review.fix.json")}, la revisión ya pasó: este run arregla solo los hallazgos que lista (\`{"fix": ["F1"]}\`; detalle en ${join(dir, "review.md")}), en las mismas ramas y PRs. Sigue la sección "Arreglar la revisión" de build.md.
   Si existe ${join(dir, "test.fix.json")}, el test en staging falló y las PRs de antes ya están mergeadas y desplegadas: este run arregla solo los criterios que lista (cada uno con lo que encontró el test, su [Fix] en Jira y lo que una persona preguntó sobre él; el informe, en ${join(dir, "test.md")}). Abre PRs nuevas desde la rama por defecto, una por repo que cambias, con rama \`fix/${key}-<criterio>\`; cada unidad nueva con id X1, X2… y en \`subtasks\` las [Fix] de los criterios que arregla. Escribe un test que reproduzca cada fallo antes de arreglarlo. En build.json lista también las unidades de antes, tal cual.
5. Escribe el resumen en ${join(dir, "build.summary.md")} y al final ${join(dir, "build.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "units": [{"id": "U1", "repo": "...", "title": "...", "branch": "...", "status": "done" | "failed", "pr": "https://github.com/..." | null}], "fixed": ["F1"]}. Todas las unidades, también las que no tocas.`,
  },
  review: {
    verb: "revisar", title: "Revisión", done: "revisado", label: LABELS.reviewed, unlabel: [LABELS.ready, LABELS.planned, LABELS.built], model: "claude-opus-5-5", effort: "high", writes: false,
    brief: (key, dir) => `Eres la etapa 4 del pipeline: revisar las PRs del ticket ${key}, ya construido.

1. Lee ${join(STAGES_DIR, "review.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos. Si plan.json tiene \`scripts\`, lee también ${join(STAGES_DIR, "scripts.md")}.
2. Las PRs están en ${join(dir, "build.json")}; el plan, en ${join(dir, "plan.md")}; el refinamiento y sus criterios de aceptación, en ${join(dir, "refine.md")}; el ticket, en ${join(dir, "ticket.md")}. El código de cada unidad está en su worktree de ${join(dir, "work")}: léelo, no lo cambies.
   Si existe ${join(dir, "test.fix.json")}, esto es un arreglo de lo que falló en staging: revisa solo las unidades nuevas (X1, X2…) contra los criterios que lista; las de antes ya están mergeadas y desplegadas.
3. Si existe ${join(dir, "review.json.prev")}, es la revisión anterior: comprueba primero que sus hallazgos están arreglados. Lo que el board ya ha comprobado de cada PR (borrador, rama, base, checks de CI, tests borrados o desactivados) está en ${join(dir, "checks.json")}: no lo repitas; cada aviso que tenga es un hallazgo que confirmas o descartas.
4. Escribe los hallazgos en ${join(dir, "review.md")} y el resumen en ${join(dir, "review.summary.md")}.
5. Escribe al final ${join(dir, "review.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "findings": [{"id": "F1", "unit": "U1", "severity": "blocker" | "major" | "minor", "file": "ruta", "line": 12, "title": "...", "detail": "...", "fix": "..."}]}.`,
  },
  test: {
    verb: "probar", title: "Prueba en staging", done: "probado en staging", label: LABELS.tested, unlabel: [], model: "claude-opus-5-5", effort: "high", writes: false,
    brief: (key, dir) => `Eres la etapa de prueba del pipeline: probar el ticket ${key} en staging, ya desplegado.

1. Lee ${join(STAGES_DIR, "test.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. Los criterios de aceptación y el plan de verificación están en ${join(dir, "refine.md")}; el plan, en ${join(dir, "plan.md")}; lo desplegado, en ${join(dir, "build.json")}.
3. Solo staging. Nunca prod: ni con STAGE=prod, ni con sus tablas, ni con sus URLs.
4. Escribe el informe en ${join(dir, "test.md")} y el resumen en ${join(dir, "test.summary.md")}.
5. Escribe al final ${join(dir, "test.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "results": [{"id": "T1", "criterion": "...", "status": "pass" | "fail" | "untested", "summary": "...", "evidence": "...", "files": [{"path": "evidence/T1-desktop.png", "caption": "..."}]}]}. Guarda la evidencia de cada criterio en ${join(dir, "evidence")}.`,
  },
  smoke: {
    verb: "comprobar", title: "Comprobación en prod", done: "comprobado en prod", label: LABELS.live, unlabel: [], model: "claude-opus-5-5", effort: "medium", writes: false,
    brief: (key, dir) => `Eres la última etapa del pipeline: comprobar el ticket ${key} en prod, ya desplegado.

1. Lee ${join(STAGES_DIR, "smoke.md")} y ${join(STAGES_DIR, "environment.md")}, y síguelos.
2. Los criterios de aceptación están en ${join(dir, "refine.md")}; la prueba de staging, en ${join(dir, "test.md")}.
3. Solo lectura: en prod no creas, cambias ni borras nada.
4. Escribe el informe en ${join(dir, "smoke.md")} y el resumen en ${join(dir, "smoke.summary.md")}.
5. Escribe al final ${join(dir, "smoke.json")}: {"verdict": "ready" | "needs-info", "questions": [...], "results": [{"id": "P1", "criterion": "...", "status": "pass" | "fail" | "untested", "summary": "...", "evidence": "...", "files": [{"path": "evidence/P1-desktop.png", "caption": "..."}]}]}. Guarda la evidencia de cada criterio en ${join(dir, "evidence")}.`,
  },
}
export const verbOf = (stage: AgentStage) => STAGE[stage].verb

// Clean: no user settings (your model, effort, hooks, plugins and CLAUDE.md
// come from there), no connectors; its model and effort; and, for a stage
// that writes, the repos' folder too.
// What no agent may do, enforced by Claude Code itself (the rest is checked
// after the run, and only warned of: an agent always gets to finish): merge,
// force a push, push to a default branch, or run anything for real or on
// prod. The stages that only read keep out of the repos; only the test in
// staging may reach AWS.
const NEVER = ["Bash(gh pr merge:*)", "Bash(git push --force:*)", "Bash(git push -f:*)", "Bash(git push origin master:*)", "Bash(git push origin main:*)",
  "Bash(git push origin HEAD:master:*)", "Bash(git push origin HEAD:main:*)", "Bash(EXECUTE=true:*)", "Bash(STAGE=prod:*)"]
const deniedFor = (stage: AgentStage, root: string) => [
  ...NEVER,
  ...(STAGE[stage].writes ? [] : ["Bash(git push:*)", "Bash(git commit:*)", "Bash(gh pr create:*)", `Edit(/${join(root, "repos")}/**)`, `Write(/${join(root, "repos")}/**)`]),
  ...(stage === "test" ? [] : ["Bash(aws:*)"]),
]
// The test in staging loads its test data and cleans it up with this script
// (<data>/pipeline/fixtures), run from its folder; its IAM user can write only that data.
const FIXTURES = "Bash(python3 fixtures.py:*)"
// The other stages only read the catalog: what it has, a scenario checked, the users' real contexts (nothing written).
const FIXTURES_READ = ["Bash(python3 fixtures.py catalog:*)", "Bash(python3 fixtures.py plan:*)", "Bash(python3 fixtures.py contexts:*)"]
// Figma, for the stages that read a design (not the check in prod), when the ticket
// links one: the team's Figma connection (stages/figma-mcp.json), with only the
// tools that read; the ones that write in Figma are denied.
const FIGMA_STAGES: AgentStage[] = ["refine", "plan", "build", "review", "test"]
const FIGMA_READ = ["whoami", "get_design_context", "get_metadata", "get_screenshot", "get_variable_defs", "get_figjam", "get_libraries", "search_design_system", "get_code_connect_map", "get_motion_context", "download_assets"]
const FIGMA_WRITE = ["use_figma", "generate_figma_design", "create_new_file", "upload_assets", "add_code_connect_map", "send_code_connect_mappings", "generate_diagram", "generate_image",
  "create_generative_plugin", "update_generative_plugin", "create_shader", "update_shader", "export_video", "html_to_figma", "send_code_to_figma", "weave_run_tool", "weave_run_model", "weave_upload_asset", "weave_cancel_tool_run"]
const figmaTools = (names: string[]) => names.map(n => `mcp__figma__${n}`)
export const linksFigma = (text: string) => /figma\.com\/(design|file|proto|board|make)\//.test(text)

export const argsFor = (stage: AgentStage, root = ROOT, opts: { figma?: boolean } = {}) => {
  const s = STAGE[stage]
  const figma = !!opts.figma && FIGMA_STAGES.includes(stage)
  const allowed = [...(stage === "test" ? [FIXTURES] : ["refine", "plan", "build", "review"].includes(stage) ? FIXTURES_READ : []), ...(figma ? figmaTools(FIGMA_READ) : [])]
  return ["--setting-sources", "project,local", "--strict-mcp-config", "--model", s.model, "--effort", s.effort, ...(s.writes ? ["--add-dir", join(root, "repos")] : []),
    "--disallowedTools", ...deniedFor(stage, root), ...(figma ? figmaTools(FIGMA_WRITE) : []),
    ...(allowed.length ? ["--allowedTools", ...allowed] : []), ...(figma ? ["--mcp-config", join(root, "stages", "figma-mcp.json")] : [])]
}

const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : [])
// A plan's units; a build's also say how each went and its PR.
// Every sub-task a unit covers (its "subtasks", and the single "subtask" of before), each once.
const subtasksIn = (u: any): string[] => [...new Set([...listOf(u.subtasks), u.subtask].filter(k => typeof k === "string" && k.trim()).map((k: string) => k.trim()))]
const unitsIn = (v: unknown, isBuild: boolean): Unit[] =>
  listOf(v)
    .filter(u => typeof u?.repo === "string" && u.repo.trim() && typeof u?.title === "string" && u.title.trim())
    .map((u, i) => ({ id: String(u.id ?? `U${i + 1}`), repo: u.repo.trim(), subtask: typeof u.subtask === "string" && u.subtask ? u.subtask : null, subtasks: subtasksIn(u),
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
const resultsIn = (v: unknown): TestResult[] =>
  listOf(v)
    .filter(r => textOf(r?.criterion))
    .map((r, i) => ({ id: String(r.id ?? `T${i + 1}`), criterion: textOf(r.criterion), status: r.status === "pass" || r.status === "untested" ? (r.status as TestResult["status"]) : ("fail" as const), evidence: textOf(r.evidence), ...(textOf(r.summary) ? { summary: textOf(r.summary) } : {}), files: filesIn(r.files) }))
// Only with the words it makes untrue: else it is no impact at all.
const impactIn = (v: unknown): ContextImpact[] =>
  listOf(v).filter(x => textOf(x?.file) && (textOf(x?.quote) || textOf(x?.proposal)))
    .map(x => ({ file: textOf(x.file), quote: textOf(x.quote) || null, why: textOf(x.why), proposal: textOf(x.proposal) || null }))
// The repos an impact asks to change: a repo's own rules go by its name
// ("deale-frontend/docs/rules/…"); the rest is the team's context.
export const impactRepos = (impacts: ContextImpact[], repos: string[], contextRepo: string) => [
  ...new Set(impacts.map(i => repos.find(r => r !== contextRepo && i.file.startsWith(`${r}/`)) ?? contextRepo)),
]
// The criteria a test (or a smoke check) found failing.
export const failing = (results: TestResult[] | undefined) => (results ?? []).filter(r => r.status === "fail")
// The criteria it could not try: they wait for a person before prod.
export const untried = (results: TestResult[] | undefined) => (results ?? []).filter(r => r.status === "untested")
// Criteria a person checked by hand: they pass, saying so.
export const checkedByHand = (results: TestResult[], ids: string[], on: string) =>
  results.map(r => (r.status === "untested" && ids.includes(r.id) ? { ...r, status: "pass" as const, evidence: `Comprobado a mano el ${on}. ${r.evidence}`.trim() } : r))
// The findings that stop a ticket: they go back to Build.
export const blocking = (findings: Finding[] | undefined) => (findings ?? []).filter(f => f.severity !== "minor")
// The findings a build after a review fixes: the ones you chose, else the
// ones that stop the ticket.
export const toFixNow = (findings: Finding[] | undefined, chosen?: string[]) =>
  (chosen ? (findings ?? []).filter(f => chosen.includes(f.id)) : blocking(findings)).map(f => f.id)
// What a build after a failed test fixes (test.fix.json): the criteria you chose, else
// every one that failed; each with what the test found, its [Fix] and what a person asked about it.
export const testFix = (state: Pick<PipelineState, "results" | "fixOf" | "threads">, chosen?: string[]) =>
  failing(state.results).filter(r => !chosen || chosen.includes(r.id)).map(r => ({
    id: r.id, criterion: r.criterion, summary: r.summary ?? null, evidence: r.evidence, subtask: state.fixOf?.[r.id] ?? null,
    asked: (state.threads?.[`result:${r.id}`] ?? []).filter(t => t.a).map(t => ({ q: t.q, a: t.a })),
  }))
// The [Fix] sub-tasks of what fails now (all of them, before a test has results).
export const fixesNow = (state: Pick<PipelineState, "results" | "fixOf" | "fixes">) =>
  state.results?.length && state.fixOf ? failing(state.results).map(r => state.fixOf![r.id]).filter((k): k is string => !!k) : (state.fixes ?? [])
// The units staging does not run yet: the ones a build after a failed test adds.
export const unshipped = (state: Pick<PipelineState, "units" | "deployed">) => {
  const shipped = new Set((state.deployed?.staging?.steps ?? []).filter(s => s.kind === "merge" && s.status === "done").map(s => s.unit))
  return (state.units ?? []).filter(u => !shipped.has(u.id))
}

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
    .map((q, i) => ({ id: String(q.id ?? `Q${i + 1}`), question: q.question.trim(), proposal: String(q.proposal ?? "").trim(), ...(textOf(q.context) ? { context: textOf(q.context) } : {}) }))
  if (data.verdict === "needs-info" && !questions.length) throw new Error(`${stage}.json needs info but asks nothing`)
  const units = unitsIn(data.units, stage === "build")
  const checklist: ChecklistItem[] = listOf(data.checklist)
    .filter(c => typeof c?.text === "string" && c.text.trim())
    .map((c, i) => ({ id: String(c.id ?? `C${i + 1}`), text: c.text.trim(), unit: typeof c.unit === "string" && c.unit ? c.unit : null }))
  if (stage === "plan" && data.verdict === "ready" && !units.length) throw new Error("plan.json is ready but has no units")
  return { verdict: data.verdict, questions, units, checklist, findings: findingsIn(data.findings), fixed: listOf(data.fixed).map(String), scripts: scriptsIn(data.scripts), order: orderIn(data.release), results: resultsIn(data.results), contextImpact: impactIn(data.contextImpact), children: data.children, debt: debtIn(data.debt) }
}

export const questionsComment = (key: string, questions: Question[], stage: AgentStage) =>
  `${MARK} · ${STAGE[stage].title} de ${key}\n\nAntes de implementar faltan estas decisiones. Cada una trae una propuesta: si vale, basta con responder "ok".\n\n` +
  questions.map(q => `${q.id}. ${q.question}${q.context ? `\nPor qué: ${q.context}` : ""}\nPropuesta: ${q.proposal || "—"}`).join("\n\n")

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
const subtasksLine = (c: Ticket) => (c.children?.length ? `\n\nSubtareas:\n${c.children.map(g => `- ${g.key} · ${g.summary} (${g.status})`).join("\n")}` : "")
export function snapshotOf(t: Ticket, parent: Ticket | null, children: Ticket[], pages: ConfluencePage[] = []): string {
  const parts = [
    `# ${t.key} · ${t.summary}`,
    `Tipo: ${t.type ?? "—"} · Estado: ${t.status} · Prioridad: ${t.priority ?? "—"} · Asignado: ${t.assignee ?? "nadie"} · Reporter: ${t.reporter ?? "—"}`,
    `## Descripción\n\n${t.description || "(sin descripción)"}`,
    `## Comentarios\n\n${t.comments.length ? t.comments.map(c => `**${c.author} · ${date(c.at)}**\n\n${c.body}`).join("\n\n---\n\n") : "(ninguno)"}`,
  ]
  if (t.parent) parts.push(`## Padre: ${t.parent.key} · ${t.parent.summary}\n\n${parent?.description || "(sin descripción)"}`)
  if (children.length) parts.push(`## Hijos\n\n${children.map(c => `### ${c.key} · ${c.summary} (${c.status})\n\n${c.description || "(sin descripción)"}${subtasksLine(c)}`).join("\n\n")}`)
  if (t.links.length) parts.push(`## Links\n\n${t.links.map(l => `- ${l.how} ${l.ticket.key} · ${l.ticket.summary} (${l.ticket.status})`).join("\n")}`)
  for (const p of pages) parts.push(`## Confluence: ${p.title} (versión ${p.version})\n\n${p.url}\n\n${p.md.slice(0, PAGE_CHARS)}${p.md.length > PAGE_CHARS ? "\n\n(…recortado)" : ""}`)
  return parts.join("\n\n") + "\n"
}

// ---------- the state ----------

// A state.json, with its run in the history (a state from before the history has none).
export async function stateIn<S extends PipelineState>(dir: string): Promise<S | null> {
  try {
    return withRun(JSON.parse(await readFile(join(dir, "state.json"), "utf8"))) as S
  } catch {
    return null
  }
}
const stateOf = (key: string) => stateIn(dirOf(key))
// The state with its run in the history: added the first time, then kept up to date.
// What a build did in its own pass: after a review, the units its fixed findings
// were in; after a failed test, its new units (staging runs the rest); else all.
const builtNow = (s: PipelineState) => {
  const units = s.units ?? []
  const fixedIn = new Set((s.findings ?? []).filter(f => s.fixed?.includes(f.id)).map(f => f.unit))
  if (fixedIn.size) return units.filter(u => fixedIn.has(u.id))
  return s.deployed?.staging ? unshipped(s) : units
}
// What a run that ended left, by its stage.
const keptOf = (s: PipelineState): Kept | undefined => {
  if (s.status !== "ready" && s.status !== "needs-info") return undefined
  if (s.stage === "plan") return { units: s.units ?? [], ...(s.checklist ? { checklist: s.checklist } : {}) }
  if (s.stage === "build") return { units: builtNow(s) }
  if (s.stage === "review") return { findings: s.findings ?? [] }
  if (s.stage === "test" || s.stage === "smoke") return { results: s.results ?? [] }
  return undefined
}
export function withRun(s: PipelineState): PipelineState {
  const kept = keptOf(s)
  const run: Run = { n: s.runs, stage: s.stage, sessionId: s.sessionId, startedAt: s.startedAt, endedAt: s.endedAt, status: s.status, questions: s.questions.length, units: s.units?.length ?? 0, ...(s.stage === "review" ? { findings: s.findings?.length ?? 0 } : {}), error: s.error, ...(kept ? { kept } : {}) }
  return { ...s, history: [...(s.history ?? []).filter(r => r.n !== s.runs), run].sort((a, b) => a.n - b.n) }
}
const save = (s: PipelineState) => writeJsonAtomic(join(dirOf(s.key), "state.json"), withRun(s), { pretty: true })
const readText = (path: string) => readFile(path, "utf8").catch(() => null)
const jsonOf = (text: string | null): any => {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}
// Each run with what its session spent, read from its transcript (only what
// was added since the last look): never saved, so it is always the session's own.
export const withSpend = async <S extends PipelineState>(s: S): Promise<S> =>
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
  return { state: state && (await withSpend(state)), refine: await doc("refine"), plan: await doc("plan"), build: await doc("build"), review: await doc("review"), test: await doc("test"), smoke: await doc("smoke"), preview: await previewOf(state) }
}

// What the running stage does now: its session's steps and subagents, and,
// while it builds, how far each unit got (build.progress.json).
export async function pipelineActivity(key: string) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  const state = await stateOf(key)
  if (state?.status !== "running" || !state.sessionId) return { steps: [], helpers: [], units: [], checked: [] }
  return { ...(await activityOf(state.sessionId)), ...(await buildProgress(dirOf(key))) }
}

// How far a build got: each unit (build.progress.json) and the to-dos it marked done.
export async function buildProgress(dir: string) {
  const progress = await readText(join(dir, "build.progress.json"))
  let units: Unit[] = []
  try {
    const data = progress ? JSON.parse(progress) : null
    units = unitsIn(Array.isArray(data) ? data : data?.units, true)
  } catch {}
  return { units, checked: checkedIn(await readText(join(dir, "build.checklist.json"))) }
}

// ---------- the stage ----------

// A coordinator's refinement follows epic.md: the whole, not one delivery.
const asParent = (children: Child[] = []) =>
  children.length ? `\n\nEste ticket coordina a sus hijos entregables (${children.map(c => c.key).join(", ")}): sigue ${join(STAGES_DIR, "epic.md")} en lugar de refine.md, y escribe los mismos ficheros.` : ""
const promptFor = (key: string, dir: string, stage: AgentStage, children: Child[] = []) => `${TAG} ${key} · ${STAGE[stage].verb}

${STAGE[stage].brief(key, dir)}${stage === "refine" ? asParent(children) : ""}

${AS_AGENT}

No escribas en Jira${STAGE[stage].writes ? "" : " ni en los repos"}: el board publica lo que dejas en tus ficheros.`

// Runs a stage; whatever fails before the session starts leaves a failed state.
// Run on its own: each stage, once done, starts the next, until the review (the
// PRs done). A stage that asks waits for the answers, then goes on; a release is
// always started by a person.
const AUTO_NEXT: Partial<Record<Stage, AgentStage>> = { refine: "plan", plan: "build", build: "review" }
export const autoNext = (state: PipelineState): AgentStage | null =>
  state.auto && state.status === "ready" && !state.children?.length ? (AUTO_NEXT[state.stage] ?? null) : null

const run = (key: string, runs: number, stage: AgentStage, auto?: boolean) =>
  runStage(key, runs, stage, auto).catch(async err => save({ ...(await fresh(key, runs, stage)), status: "failed", error: String(err?.message ?? err), endedAt: Date.now() }))
const EMPTY = (key: string, runs: number, stage: Stage): PipelineState =>
  ({ key, stage, status: "running", sessionId: null, runs, startedAt: Date.now(), endedAt: null, askedAt: null, questions: [], error: null })
// A new run, with the ticket's history so far.
const fresh = async (key: string, runs: number, stage: Stage): Promise<PipelineState> => {
  const prev = await stateOf(key)
  // The plan's units and to-do list, and the review's findings, stay with the ticket for the stages after it.
  return { ...EMPTY(key, runs, stage), summary: prev?.summary, history: prev?.history ?? [], units: prev?.units, checklist: prev?.checklist, checked: prev?.checked, scripts: prev?.scripts, contextImpact: prev?.contextImpact,
    release: prev?.release, deployed: prev?.deployed, fixes: prev?.fixes, fixOf: prev?.fixOf, results: prev?.results, children: prev?.children, parent: prev?.parent, auto: prev?.auto,
    ...(stage === "review" ? {} : { findings: prev?.findings, fixed: stage === "build" ? [] : prev?.fixed }) }
}
// A stage's session is the pipeline's, not yours: once it ends it leaves the
// board (its log stays a click away in the ticket), and never goes to Claude desktop.
export const putAway = (id: string) => void applyAction(id, [id], "archive", {}).catch(() => {})

// The Confluence pages the ticket and its parent link to (in their text or as
// Jira's remote links), as they are now: the first few.
export async function linkedPages(t: Ticket, parent: Ticket | null): Promise<ConfluencePage[]> {
  const remote = await remoteLinks(t.key).catch(() => [])
  const ids = confluenceIds([t.description, ...t.comments.map(c => c.body), parent?.description, ...remote]).slice(0, MAX_PAGES)
  return (await Promise.all(ids.map(id => confluencePage(id).catch(() => null)))).filter(Boolean) as ConfluencePage[]
}

// The team's pages every stage reads (jira.json's contextPages: the system's
// map), into the ticket's context/ folder, as they are now.
export async function writeContextPages(dir: string) {
  const ids = jsonOf(await readText(join(STAGES_DIR, "jira.json")))?.contextPages
  if (!Array.isArray(ids)) return
  await mkdir(join(dir, "context"), { recursive: true })
  for (const id of ids.slice(0, MAX_PAGES)) {
    const page = await confluencePage(String(id)).catch(() => null)
    if (page) await Bun.write(join(dir, "context", `${page.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.md`), `# ${page.title} (versión ${page.version})\n\n${page.url}\n\n${page.md}\n`)
  }
}

// The ticket, its parent and its children, each whole.
export async function ticketWithFamily(key: string) {
  const t = await ticket(key)
  const [parent, children] = await Promise.all([
    t.parent ? ticket(t.parent.key).catch(() => null) : null,
    Promise.all(t.children.slice(0, 30).map(c => ticket(c.key).catch(() => null))).then(all => all.filter(Boolean) as Ticket[]),
  ])
  return { t, parent, children }
}

async function runStage(key: string, runs: number, stage: AgentStage, auto?: boolean) {
  const dir = dirOf(key)
  await mkdir(dir, { recursive: true })
  for (const f of [`${stage}.json`, `${stage}.md`, `${stage}.summary.md`]) await rename(join(dir, f), join(dir, `${f}.prev`)).catch(() => {})
  const { t, parent, children } = await ticketWithFamily(key)
  // A child of a coordinator reads what its parent decided for all of them.
  const coordinator = t.parent ? await stateOf(t.parent.key) : null
  const isChild = !!coordinator?.children?.some(c => c.key === key)
  const decided = isChild ? await readText(join(dirOf(t.parent!.key), "refine.md")) : null
  await Bun.write(join(dir, "ticket.md"), snapshotOf(t, parent, children, await linkedPages(t, parent)) + (decided ? `\n## Decisiones del padre (${t.parent!.key})\n\n${decided}\n` : ""))
  await writeContextPages(dir)
  const kids = stage === "refine" ? deliverablesOf(t) : []
  const base = { ...(await fresh(key, runs, stage)), summary: t.summary, ...(isChild ? { parent: t.parent!.key } : {}), ...(auto === undefined ? {} : { auto }) }
  const started = kids.length ? { ...base, children: childrenIn(base.children, kids) } : base
  const state = stage === "build" ? { ...started, ...(await inJira("build-started", started)) } : started
  await save(state)
  const id = randomUUID()
  // Figma, when what the stage reads links a design and the team set Figma up.
  const figma = linksFigma(await readText(join(dir, "ticket.md")) ?? "") && existsSync(join(STAGES_DIR, "figma-mcp.json"))
  const pid = await spawnStage(dir, id, promptFor(key, dir, stage, state.children), stage, () => void watch(), figma)
  await save({ ...state, sessionId: id, pid })
  await applyAction(id, [id], "tickets", { started: [key] })
}

// A stage's session, started on its own (its own process group, its output to
// <stage>.log), so restarting the board never stops it: the board learns it
// ended by watching its process, not by being its parent.
export async function spawnStage(dir: string, id: string, prompt: string, stage: AgentStage, onExit: () => void, figma = false): Promise<number> {
  const log = openSync(join(dir, `${stage}.log`), "a")
  const proc = spawn(await claudeBinary(), ["-p", "--session-id", id, "--output-format", "stream-json", "--verbose", "--permission-mode", "auto", ...argsFor(stage, ROOT, { figma }), "--", prompt],
    { cwd: dir, env: claudeEnv({ AGENT_CENTER_LAUNCH: "1" }), detached: true, stdio: ["ignore", log, log] })
  if (!proc.pid) throw new Error("Claude Code did not start")
  proc.on("exit", onExit)
  proc.unref()
  return proc.pid
}

export const isAlive = (pid: number) => {
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
  await keepDoc(dir, state)
  if (result.verdict === "needs-info") {
    // The questions are the reporter's to answer: Jira tells them.
    const reporter = await ticket(key).then(t => t.reporterId, () => null)
    await commentOn(key, questionsComment(key, result.questions, state.stage), reporter ? [reporter] : [])
    await labelTicket(key, [LABELS.needsInfo], [stage.label])
    await save({ ...state, status: "needs-info", questions: result.questions, askedAt: Date.now(), endedAt: Date.now() })
    return
  }
  const checks = await checksAfter(state, result)
  await writeJsonAtomic(join(dir, "checks.json"), { stage: state.stage, checks }, { pretty: true })
  // A build is done only with a PR for every unit; else it shows what it did and failed.
  const left = state.stage === "build" ? unbuilt(result.units) : null
  if (left) return void (await save({ ...state, status: "failed", error: left, units: result.units, checks, endedAt: Date.now() }))
  // Jira gets the summary for people; the whole document, cut, only when there is none.
  const md = (await readText(join(dir, `${state.stage}.summary.md`))) ?? (await readText(join(dir, `${state.stage}.md`))) ?? ""
  const prs = result.units.filter(u => u.pr).map(u => `- ${u.repo}: ${u.pr}`).join("\n")
  // A test's files stay only where they are; they go to Jira with its comment, for QA.
  const shown = { ...result, results: result.results.map(r => ({ ...r, files: keptFiles(dir, r.files ?? []) })) }
  const attached = state.stage === "test" || state.stage === "smoke" ? await attachEvidence(key, dir, shown.results) : { line: "", checks: [] }
  await commentOn(key, `${MARK} · ${key} ${stage.done}\n\n${prodWarning(state.stage, result)}${attached.line}${prs ? `${prs}\n\n` : ""}${md.slice(0, COMMENT_CHARS)}${md.length > COMMENT_CHARS ? "\n\n(…recortado)" : ""}`)
  await labelTicket(key, [stage.label], [LABELS.needsInfo, ...stage.unlabel])
  const checklist = state.stage === "plan" ? result.checklist : state.checklist
  const scripts = state.stage === "plan" ? result.scripts : state.scripts
  const checked = state.stage === "build" ? checkedIn(await readText(join(dir, "build.checklist.json"))) : state.checked
  // Only a plan and a build leave units; the stages after them keep theirs.
  const units = state.stage === "plan" || state.stage === "build" ? result.units : state.units
  const found = state.stage === "review" ? { findings: result.findings, fixed: [] } : state.stage === "build" ? { fixed: result.fixed } : {}
  const tested = state.stage === "test" || state.stage === "smoke" ? { results: shown.results } : {}
  const context = state.stage === "refine" ? { contextImpact: result.contextImpact } : {}
  const done: PipelineState = { ...state, status: "ready", questions: [], units, checklist, checked, scripts, ...found, ...tested, ...context, checks: withJira([...checks, ...attached.checks], state.checks), endedAt: Date.now() }
  await recordDebt(key, result.debt)
  await settle({ ...done, checks: withJira([...(done.checks ?? []), ...graveDebt(result.debt)], []) }, result)
}

// Each run's document, apart (runs/<n>-<stage>.md), to read each pass of a stage.
async function keepDoc(dir: string, state: PipelineState) {
  const text = (await readText(join(dir, `${state.stage}.md`))) ?? (await readText(join(dir, `${state.stage}.summary.md`)))
  if (text === null) return
  await mkdir(join(dir, "runs"), { recursive: true })
  await Bun.write(join(dir, "runs", `${state.runs}-${state.stage}.md`), text)
}
export async function runDoc(key: string, n: number) {
  const run = (await stateOf(key))?.history?.find(r => r.n === n)
  if (!isKey(key) || !run) throw new Error("No such run")
  return readText(join(dirOf(key), "runs", `${n}-${run.stage}.md`))
}

// ---------- the team's code debt (debt.ts) ----------

const DEBT = join(ROOT, "debt.json")
export const debtRegister = async (): Promise<DebtEntry[]> => jsonOf(await readText(DEBT)) ?? []
async function recordDebt(key: string, items: DebtItem[]) {
  if (!items.length) return
  await writeJsonAtomic(DEBT, debtMerged(await debtRegister(), items, key, Date.now()), { pretty: true })
}
// A point of debt that is a security or data-loss risk: a warning in the ticket that saw it.
const graveDebt = (items: DebtItem[]): Check[] =>
  items.filter(d => d.kind === "debt" && d.severity === "blocker").map((d, i) => ({ id: `debt-${i + 1}`, label: `Grave debt in ${d.repo}`, status: "warn" as const, detail: `${d.file}${d.line ? `:${d.line}` : ""}: ${d.note}` }))

// Points of debt you chose: into one Jira ticket (jira.json debtIssue), or dismissed, or open again.
export async function actOnDebt(keys: string[], action: "ticket" | "dismiss" | "reopen") {
  const register = await debtRegister()
  const chosen = register.filter(e => keys.includes(e.key))
  if (!chosen.length) throw new Error("No such debt")
  let jira: string | null = null
  if (action === "ticket") {
    const conf = jsonOf(await readText(join(STAGES_DIR, "jira.json")))?.debtIssue
    if (!conf?.project || !conf?.typeId) throw new Error("jira.json has no debtIssue (project, typeId, labels)")
    jira = await createIssue({ project: conf.project, typeId: conf.typeId, labels: conf.labels ?? ["deuda-tecnica"], ...debtTicket(chosen) })
  }
  const status = action === "ticket" ? "ticketed" : action === "dismiss" ? "dismissed" : "open"
  const next = register.map(e => (keys.includes(e.key) ? { ...e, status, jira: action === "ticket" ? jira : action === "reopen" ? null : e.jira } as DebtEntry : e))
  await writeJsonAtomic(DEBT, next, { pretty: true })
  return { jira }
}

// A stage done: Jira follows it, a coordinator keeps its children's order and
// starts them, and a pipeline that runs on its own starts the next stage.
async function settle(done: PipelineState, result: Result) {
  const event = done.stage === "build" ? "built" : done.stage === "test" ? "tested" : null
  const ordered = done.stage === "refine" && done.children?.length ? { children: childrenIn(result.children, done.children.map(c => c.key)) } : {}
  const saved: PipelineState = event ? { ...done, ...(await inJira(event, done)) } : { ...done, ...ordered }
  await save(saved)
  if (ordered.children) void coordinate(done.key)
  const next = autoNext(saved)
  if (next) void startPipeline(done.key, false, next).catch(err => console.error(`auto ${done.key} → ${next}:`, err))
}

// ---------- a coordinator's children (coordinator.ts) ----------

const coordinating = new Set<string>()
const childStates = async (children: Child[]) => Object.fromEntries(await Promise.all(children.map(async c => [c.key, await stateOf(c.key)] as const)))
// Starts the children it can now; one that will not start (not yours) is a
// warning in the coordinator's checks, and is not tried again.
async function coordinate(key: string) {
  if (coordinating.has(key)) return
  coordinating.add(key)
  try {
    const parent = await stateOf(key)
    if (!parent?.children?.length || parent.stage !== "refine" || parent.status !== "ready") return
    const refused = new Set((parent.checks ?? []).filter(c => c.id.startsWith("child-")).map(c => c.id.slice(6)))
    const children = parent.children.filter(c => !refused.has(c.key))
    const failed: Check[] = []
    for (const child of toStart(children, await childStates(children)))
      await startPipeline(child, false, undefined, undefined, parent.auto).catch((err: Error) => failed.push({ id: `child-${child}`, label: `${child} did not start`, status: "warn", detail: err.message }))
    if (failed.length) await save({ ...parent, checks: [...(parent.checks ?? []), ...failed] })
  } finally {
    coordinating.delete(key)
  }
}

// A child goes to staging once what it depends on is there.
async function stagingWaits(state: PipelineState) {
  const coordinator = state.parent ? await stateOf(state.parent) : null
  if (!coordinator?.children) return
  const waits = waitsFor(state.key, coordinator.children, await childStates(coordinator.children))
  if (waits.length) throw new Error(`Staging waits for ${waits.join(", ")} in staging first`)
}

// A test's files, attached to the ticket (the first few, as Jira takes them):
// the line that names them in the comment, and a warning if Jira refused.
const MAX_ATTACHED = 20
async function attachEvidence(key: string, dir: string, results: TestResult[]) {
  const names = results.flatMap(r => (r.files ?? []).map(f => f.name)).slice(0, MAX_ATTACHED)
  if (!names.length) return { line: "", checks: [] as Check[] }
  try {
    await attachTo(key, names.map(n => join(dir, "evidence", n)))
    return { line: `Evidencia adjunta: ${names.join(", ")}\n\n`, checks: [] as Check[] }
  } catch (err) {
    return { line: "", checks: [{ id: "evidence", label: "The evidence did not go to Jira", status: "warn" as const, detail: String((err as Error)?.message ?? err) }] }
  }
}

// One file of a test's evidence, as what it is.
export async function pipelineEvidence(key: string, name: string) {
  const type = evidenceType(name)
  if (!isKey(key) || !type) throw new Error("Not a file of the evidence")
  // A job's (lib/jobs.ts) lives with the jobs.
  const file = Bun.file(join(/^JOB-\d+$/.test(key) ? join(ROOT, "jobs", key) : dirOf(key), "evidence", name))
  return (await file.exists()) ? { body: await file.arrayBuffer(), type } : null
}

// A check in prod that failed, on top of its comment: the story is already done in Jira.
export const prodWarning = (stage: Stage, result: Pick<Result, "results">) => {
  const failed = stage === "smoke" ? failing(result.results) : []
  return failed.length ? `⚠️ El check de prod ha fallado (${failed.map(r => r.id).join(", ")}). La Historia ya está en Finalizada: decide si hay que deshacer el release a prod.\n\n` : ""
}

// ---------- the ticket's status in Jira (lib/jira-flow.ts) ----------

const JIRA = { issue: issueState, open: openStatuses, move: moveToStatus, comment: commentOn, createSubtask }
// The Jira warnings of before, kept under the new checks unless a new one replaces them.
const withJira = (checks: Check[], before: Check[] = [], jira: Check[] = before.filter(c => c.id.startsWith("jira-"))) => {
  const ids = new Set(checks.map(c => c.id))
  return [...checks, ...jira.filter(c => !ids.has(c.id))]
}
// After what just happened, the statuses it moves (with jira.json; none without):
// what it could not move is a warning in the ticket's checks.
async function inJira(event: JiraEvent, state: PipelineState): Promise<Partial<PipelineState>> {
  const flow = flowOf(await readText(join(STAGES_DIR, "jira.json")))
  if (!flow) return {}
  // A build after a failed test moves only its own sub-tasks (the ones in staging stay
  // done), and only the [Fix] of the criteria that fail now.
  const isFixing = event === "build-started" || event === "built" || event === "in-staging"
  const now = isFixing ? { ...state, units: event === "in-staging" ? state.units : unshipped(state), fixes: fixesNow(state) } : state
  const out = await followInJira(event, now, flow, JIRA).catch(err => ({ checks: [{ id: "jira-flow", label: "Jira did not answer", status: "warn" as const, detail: String(err?.message ?? err) }], fixes: undefined, fixOf: undefined }))
  const kept = (state.checks ?? []).filter(c => !c.id.startsWith("jira-"))
  return { checks: withJira([...kept, ...out.checks], state.checks), ...(out.fixes ? { fixes: out.fixes } : {}), ...(out.fixOf ? { fixOf: out.fixOf } : {}) }
}

// What the board checks of a run by itself (lib/checks.ts): the repos left
// as they were by the stages that only read; each PR of a build; the team's
// context changed only where the refinement said; the run's time and cost.
async function checksAfter(state: PipelineState, result: Result): Promise<Check[]> {
  const repos = join(ROOT, "repos")
  const dirs = (await readdir(repos, { withFileTypes: true }).catch(() => [])).filter(d => d.isDirectory()).map(d => join(repos, d.name))
  const contextRepo = (await deployConfig()).contextRepo
  const spend = state.sessionId ? await sessionSpend(state.sessionId) : null
  const checks: Check[] = []
  if (state.stage !== "build") checks.push(...(await reposClean(dirs, releaseOps.sh)))
  if (state.stage === "build") for (const u of result.units) checks.push(...(await prChecks(u, releaseOps.sh)))
  if (state.stage === "plan" && contextRepo) {
    const hasUnit = result.units.some(u => u.repo === contextRepo)
    const asked = impactRepos(state.contextImpact ?? [], dirs.map(d => basename(d)), contextRepo)
    const isAsked = asked.includes(contextRepo)
    checks.push(hasUnit === isAsked ? { id: "context", label: hasUnit ? `${contextRepo} changes, as the refinement asked` : `${contextRepo} stays as it is`, status: "ok", detail: null }
      : { id: "context", label: hasUnit ? `${contextRepo} changes, but the refinement found no rule it makes untrue` : `The refinement found rules of ${contextRepo} to change, and the plan has no unit for them`, status: "warn", detail: null })
    for (const repo of asked.filter(r => r !== contextRepo && !result.units.some(u => u.repo === r)))
      checks.push({ id: `rules-${repo}`, label: `The refinement found rules of ${repo} to change, and the plan has no unit in ${repo}`, status: "warn", detail: null })
  }
  checks.push(...overLimits(Date.now() - state.startedAt, spend?.cost ?? 0))
  return checks
}

// The stage a start runs: the one asked for, else the ticket's own (again).
// Planning needs the refinement done; building, the plan (or a review, to
// fix what it found); reviewing, the build; staging, a review with nothing
// to fix; prod, staging.
const NEEDS: Partial<Record<Stage, [Stage[], string]>> = {
  plan: [["refine"], "Plan needs the refinement done first"],
  build: [["plan", "review", "test"], "Build needs the plan done first"],
  review: [["build"], "Review needs the build done first"],
  staging: [["review"], "Staging needs a review with nothing to fix"],
  test: [["staging"], "The test needs staging deployed first"],
  prod: [["test"], "Prod needs staging tested first"],
  smoke: [["prod"], "The check in prod needs prod deployed first"],
}
export function stageToRun(state: PipelineState | null, asked?: Stage): Stage {
  const stage = asked ?? state?.stage ?? "refine"
  const need = NEEDS[stage]
  const isBlocked = (state: PipelineState) => (stage === "staging" && blocking(state.findings).length > 0) || (stage === "prod" && failing(state.results).length + untried(state.results).length > 0)
  const isAfter = (prev: Stage) => state?.stage === prev && state.status === "ready" && !isBlocked(state)
  if (need && state?.stage !== stage && !need[0].some(isAfter)) throw new Error(need[1])
  return stage
}

// Starts the pipeline on a ticket of yours (or runs a stage again); taking
// it, when you ask, makes it yours first. A build after a review fixes what
// it found (review.fix.json): the findings you chose, else what stops the ticket.
export async function startPipeline(key: string, take = false, asked?: Stage, chosen?: string[], auto?: boolean) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  const state = await stateOf(key)
  if (state?.status === "running") throw new Error("A stage already runs on this ticket")
  const stage = stageToRun(state, asked)
  if (take) await assignToMe(key)
  await labelTicket(key, [LABELS.on], []) // also checks that it is yours
  if (stage === "staging") await stagingWaits(state!)
  if (isRelease(stage)) return startRelease(state!, stage)
  await writeFixes(key, state, stage, chosen)
  // At work at once, so the board shows it; the run then reads the ticket (it takes a while) and starts the agent.
  await save({ ...(await fresh(key, (state?.runs ?? 0) + 1, stage)), summary: state?.summary })
  void run(key, (state?.runs ?? 0) + 1, stage, auto)
}

// A job's work (lib/jobs.ts) taken on by the pipeline where it ended: its
// files, the ticket at that stage and done, waiting at the next one's door.
// Only on a ticket of yours (the label checks it) and not in the pipeline yet;
// a build is followed in Jira as if the pipeline had built it.
const ADOPTED = /^((refine|plan|build)(\.summary)?\.(md|json)|build\.(progress|checklist)\.json|ticket\.md|context|work)$/
export const ADOPTS: AgentStage[] = ["refine", "plan", "build"]
export const isAdopted = (name: string) => ADOPTED.test(name) && name !== "work"
export async function adoptJob(key: string, from: string, stage: AgentStage, fields: Partial<PipelineState>) {
  if (!isKey(key)) throw new Error("Not a ticket key")
  if (!ADOPTS.includes(stage)) throw new Error("Only a refinement, a plan or a build goes on in the pipeline")
  if (await stateOf(key)) throw new Error(`${key} is already in the pipeline: start it over there first`)
  await labelTicket(key, [LABELS.on, STAGE[stage].label], [])
  const dir = dirOf(key)
  await mkdir(dir, { recursive: true })
  // A build's worktrees move with git (jobs.ts), not as files.
  for (const f of await readdir(from)) if (isAdopted(f)) await cp(join(from, f), join(dir, f), { recursive: true })
  const done: PipelineState = { ...EMPTY(key, 1, stage), ...fields, stage, status: "ready", endedAt: Date.now() }
  await save(stage === "build" ? { ...done, ...(await inJira("built", done)) } : done)
}

// Criteria the test could not try, checked by you by hand: they pass, and once
// nothing is failing or left to check, the story is ready for prod in Jira.
export async function checkByHand(key: string, ids: string[]) {
  const state = await stateOf(key)
  if (!state || (state.stage !== "test" && state.stage !== "smoke") || state.status !== "ready") throw new Error("No test that ended on this ticket")
  const results = checkedByHand(state.results ?? [], ids, new Date().toISOString().slice(0, 10))
  const checked: PipelineState = { ...state, results }
  const isClear = state.stage === "test" && !failing(results).length && !untried(results).length
  await save(isClear ? { ...checked, ...(await inJira("tested", checked)) } : checked)
}

// A build fixes what the review found (review.fix.json) or what the test found
// (test.fix.json); any other stage, neither (the ones of before are put aside).
async function writeFixes(key: string, state: PipelineState | null, stage: Stage, chosen?: string[]) {
  const from = stage === "build" && (state?.stage === "review" || state?.stage === "test") ? state.stage : null
  if (from === "test" && !testFix(state!, chosen).length) throw new Error("Nothing failed to fix")
  for (const f of ["review", "test"] as const) if (f !== from) await rename(join(dirOf(key), `${f}.fix.json`), join(dirOf(key), `${f}.fix.json.prev`)).catch(() => {})
  if (from === "review") await writeJsonAtomic(join(dirOf(key), "review.fix.json"), { fix: toFixNow(state!.findings, chosen) }, { pretty: true })
  if (from === "test") await writeJsonAtomic(join(dirOf(key), "test.fix.json"), { fix: testFix(state!, chosen) }, { pretty: true })
}

// Stop running on its own: the stage at work ends, and the next waits for you.
export async function stopAuto(key: string) {
  const state = await stateOf(key)
  if (state) await save({ ...state, auto: false })
}

// ---------- asking the agent about what it left ----------

// About one thing the run left: a question it asked, a test's result, a review's finding.
const ABOUT_WORDS = { question: "la pregunta", result: "el resultado", finding: "el hallazgo" } as const
export const isAbout = (about: string) => /^(question|result|finding):[\w.-]{1,40}$/.test(about)
export const askPrompt = (key: string, about: string, text: string) => {
  const [kind, id] = about.split(":") as [keyof typeof ABOUT_WORDS, string]
  return `${TAG} ${key} · pregunta

Una persona del equipo te pregunta sobre ${ABOUT_WORDS[kind]} ${id} de lo que dejaste: «${text}».

Contéstale en español, en lenguaje claro y en 150 palabras como máximo. Sin jerga: si usas un término técnico, explícalo en la misma frase. Si no lo sabes, dilo. No cambies nada: solo lee.`
}
// The agent answers in the run's own session, forked (the run's stays as it was); a
// follow-up goes on in that fork. It only reads: no edits, no scripts, no AWS.
const askArgs = (stage: Stage) => ["--setting-sources", "project,local", "--strict-mcp-config", "--model", isRelease(stage) ? "claude-opus-5-5" : STAGE[stage].model, "--effort", "low",
  "--disallowedTools", ...NEVER, "Edit", "Write", "NotebookEdit", "Bash(git push:*)", "Bash(git commit:*)", "Bash(gh pr create:*)", "Bash(aws:*)", "Bash(python3 fixtures.py:*)", "Bash(rm:*)"]
const ASK_MS = 5 * 60_000

// Why a question cannot be asked now, or null. One a time; one left waiting by a
// restart of the board lets the next go after a while.
export function askRefusal(state: Pick<PipelineState, "sessionId" | "status" | "threads"> | null, about: string, q: string, now = Date.now()): string | null {
  if (!state?.sessionId) return "No run to ask about"
  if (state.status === "running") return "The agent is still at work: ask once it ends"
  if (!isAbout(about) || !q || q.length > 2000) return "Nothing to ask"
  const last = state.threads?.[about]?.at(-1)
  return last && last.a === null && !last.error && now - last.at < ASK_MS ? "It is still answering the last question" : null
}

export async function askPipeline(key: string, about: string, text: string) {
  const state = await stateOf(key)
  const q = text.trim()
  const refusal = askRefusal(state, about, q)
  if (refusal || !state?.sessionId) throw new Error(refusal ?? "No run to ask about")
  const turns = state.threads?.[about] ?? []
  const from = turns.at(-1)?.session ?? null
  await save({ ...state, threads: { ...state.threads, [about]: [...turns, { q, a: null, at: Date.now() }] } })
  const args = ["-p", "--resume", from ?? state.sessionId, ...(from ? [] : ["--fork-session"]), "--output-format", "json", "--permission-mode", "auto", ...askArgs(state.stage), "--", askPrompt(key, about, q)]
  const proc = spawn(await claudeBinary(), args, { cwd: dirOf(key), env: claudeEnv({ AGENT_CENTER_LAUNCH: "1" }), stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  proc.stdout?.on("data", d => (out += d))
  const timer = setTimeout(() => proc.kill(), ASK_MS)
  proc.on("exit", () => void answered(key, about, out).finally(() => clearTimeout(timer)))
}

// Its answer into the thread (or why there is none); its fork, for the next question.
async function answered(key: string, about: string, out: string) {
  const state = await stateOf(key)
  const turns = state?.threads?.[about]
  if (!state || !turns?.length) return
  const data = jsonOf(out.trim().split("\n").at(-1) ?? null)
  const answer = typeof data?.result === "string" && !data.is_error ? data.result.trim() : null
  const turn = { ...turns.at(-1)!, a: answer, session: data?.session_id ?? turns.at(-1)!.session ?? null, error: answer ? null : "The agent gave no answer: ask again" }
  await save({ ...state, threads: { ...state.threads, [about]: [...turns.slice(0, -1), turn] } })
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
  secret: async name => (await exec(["security", "find-generic-password", "-s", name, "-w"])).stdout.trim() || null,
  // The agent that resolves a PR's conflicts (lib/conflicts.ts): a build's
  // limits (it may push to the PR's branch, never merge), on its own process;
  // its session, the pipeline's.
  agent: async (dir, prompt, logPath) => {
    await mkdir(join(logPath, ".."), { recursive: true })
    const log = openSync(logPath, "a")
    const tagged = `${TAG} ${dir.split("/").pop()} · resolver conflictos\n\n${prompt}`
    const proc = spawn(await claudeBinary(), ["-p", "--permission-mode", "auto", ...argsFor("build"), "--", tagged], { cwd: dir, env: claudeEnv({ AGENT_CENTER_LAUNCH: "1" }), detached: true, stdio: ["ignore", log, log] })
    if (!proc.pid) throw new Error("Claude Code did not start")
    proc.unref()
    return proc.pid
  },
}

// Takes a ticket's release as far as it goes now; done, it goes to Jira.
const ticking = new Set<string>()
async function tickRelease(key: string) {
  if (ticking.has(key)) return
  ticking.add(key)
  try {
    const state = await stateOf(key)
    if (!state?.release || state.status !== "running" || !isRelease(state.stage)) return
    const ctx = { key, summary: state.summary ?? key, dir: dirOf(key), repos: join(ROOT, "repos"), stages: STAGES_DIR, config: await deployConfig(), units: state.units ?? [], scripts: state.scripts ?? [], checklist: state.checklist ?? [] }
    const advanced = await advanceRelease(state.release, ctx, releaseOps)
    const { isDone, failed } = advanced
    const release = await judged(state, advanced.release, ctx.config)
    const step = failed ? release.steps.find(s => s.id === failed) : undefined
    if (!isDone) return void (await save({ ...state, release, ...(step ? { status: "failed", error: `${step.title}: ${step.error ?? step.detail ?? "failed"}`, endedAt: Date.now() } : {}) }))
    await commentOn(key, releaseComment(key, release))
    // Rolled back, the environment runs the code from before the ticket: it waits for new PRs.
    if (release.rollback) {
      await labelTicket(key, [], [LABELS[release.env]])
      return void (await save({ ...state, release, status: "failed", error: `Rolled back: ${release.env} runs the code from before ${key}`, endedAt: Date.now() }))
    }
    await labelTicket(key, [LABELS[release.env]], [LABELS.needsInfo, LABELS.ready, LABELS.planned, LABELS.built, LABELS.reviewed, ...(release.env === "prod" ? [LABELS.staging] : [])])
    const live: PipelineState = { ...state, release, deployed: { ...state.deployed, [release.env]: release }, status: "ready", endedAt: Date.now() }
    await save({ ...live, ...(await inJira(release.env === "staging" ? "in-staging" : "in-prod", live)) })
  } catch (err) {
    console.error(`release ${key}:`, err)
  } finally {
    ticking.delete(key)
  }
}

// The step that waits, looked at by an agent (lib/gate.ts) once: started,
// then read when it answers. Where the team lets it decide (gates), its go
// is the yes; its hold, or a person's gate, waits for you.
async function judged(state: PipelineState, release: Release, config: DeployConfig): Promise<Release> {
  const step = release.steps.find(s => s.status === "waiting")
  if (!step || !config.gateAgent || !canJudge(step)) return release
  const dir = dirOf(state.key)
  const answer = join(dir, "gates", `${state.runs}-${step.id}.json`)
  const set = (advice: ReleaseStep["advice"]) => ({ ...release, steps: release.steps.map(s => (s.id === step.id ? { ...s, advice } : s)) })
  if (!step.advice) {
    await mkdir(join(dir, "gates"), { recursive: true })
    const pid = await spawnGate(dir, gatePrompt(state.key, dir, release.env, step, answer), join(dir, "gates", `${state.runs}-${step.id}.log`))
    return set({ verdict: "running", reason: null, pid })
  }
  if (step.advice.verdict !== "running") return release
  const text = await readText(answer)
  if (text === null) return isAlive(step.advice.pid ?? 0) ? release : set({ verdict: "hold", reason: "The agent stopped without an answer" })
  const advice = parseAdvice(text)
  const next = set(advice)
  return advice.verdict === "go" && config.gates?.[release.env] === "agent" ? approveStep(next, step.id, step.value ?? undefined) : next
}

// The agent that looks at a step: clean like a stage, only reads, on its own process.
async function spawnGate(dir: string, prompt: string, logPath: string): Promise<number> {
  const log = openSync(logPath, "a")
  const args = ["-p", "--permission-mode", "auto", "--setting-sources", "project,local", "--strict-mcp-config", "--model", "claude-opus-5-5", "--effort", "low",
    "--disallowedTools", ...NEVER, "Bash(git push:*)", "Bash(git commit:*)", "Bash(gh pr create:*)", "Bash(aws:*)", `Edit(/${join(ROOT, "repos")}/**)`, `Write(/${join(ROOT, "repos")}/**)`, "--", prompt]
  const proc = spawn(await claudeBinary(), args, { cwd: dir, env: claudeEnv({ AGENT_CENTER_LAUNCH: "1" }), detached: true, stdio: ["ignore", log, log] })
  if (!proc.pid) throw new Error("Claude Code did not start")
  proc.unref()
  return proc.pid
}

const MARKS = { done: "✓", skipped: "–", failed: "✗", pending: "·", waiting: "·", running: "·" }
export const releaseComment = (key: string, release: Release) =>
  `${MARK} · ${key} ${release.rollback ? "revertido en" : "en"} ${release.env}\n\n` + release.steps.map(s => `${MARKS[s.status]} ${s.title}${s.value && s.kind === "tag" ? ` (${s.value})` : ""}${s.detail ? `: ${s.detail}` : ""}`).join("\n")

// Undoing what a release did to an environment (lib/release.ts rollbackSteps),
// once it ended: after a test or a check that failed, or a release that broke.
export async function rollBackPipeline(key: string, env: Env) {
  const state = await stateOf(key)
  if (!state) throw new Error("Not a ticket of the pipeline")
  if (state.status === "running") throw new Error("A stage runs: wait for it to end")
  const deployed = state.deployed?.[env] ?? (state.release?.env === env && !state.release.rollback ? state.release : null)
  if (!deployed) throw new Error(`Nothing was deployed to ${env}`)
  const release: Release = { env, rollback: true, steps: rollbackSteps(deployed, await deployConfig()) }
  if (!release.steps.length) throw new Error(`Nothing to undo in ${env}`)
  await save({ ...(await fresh(key, state.runs + 1, env)), summary: state.summary, stage: env, status: "running", release })
  void tickRelease(key)
}

// You, on the step at hand: go on (a tag of your own, if you write one), past it.
export async function stepPipeline(key: string, id: string, action: "approve" | "skip", value?: string) {
  const state = await stateOf(key)
  if (!state?.release || !isRelease(state.stage)) throw new Error("No release on this ticket")
  const release = action === "approve" ? approveStep(state.release, id, value) : skipStep(state.release, id)
  await save({ ...state, release, status: "running", error: null, endedAt: null })
  void tickRelease(key)
}

// A script's report (or its log), as it left it.
export async function pipelineReport(key: string, file: string) {
  if (!isKey(key) || !/^[\w.-]+-(staging|prod)-(simulate|execute)\.(csv|log)$/.test(file) || file.includes("..")) throw new Error("Not a report")
  return readText(join(dirOf(key), "scripts", file))
}

// The pipeline is on only where a team set it up: its stages' instructions.
export const isPipelineOn = () => existsSync(join(STAGES_DIR, "refine.md"))

// The steps a release would take, before you start it.
async function previewOf(state: PipelineState | null) {
  if (!state || state.status !== "ready") return null
  const env: Env | null = state.stage === "review" && !blocking(state.findings).length ? "staging" : state.stage === "test" && !failing(state.results).length && !untried(state.results).length ? "prod" : null
  if (!env) return null
  const config = await deployConfig()
  // What a person must have done first, for the repos this release takes there.
  const reminders = [...new Set((state.units ?? []).map(u => config.remind?.[u.repo]?.[env]).filter((r): r is string => !!r))]
  return { env, steps: releaseSteps(state, env, config), reminders }
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
    if (state.children?.length && state.stage === "refine" && state.status === "ready") void coordinate(state.key)
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
