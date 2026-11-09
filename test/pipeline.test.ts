import { describe, expect, it } from "bun:test"
import { isStuck, releasedUnits, retestOf, sessionOf, shippedWith, unitsNow, withUnits, testedIn, askPrompt, askRefusal, fixesNow, isAbout, testFix, unshipped, blocking, checkedByHand, checkedIn, isAdopted, toFixNow, MARK, answeredAfter, answersComment, argsFor, parseResult, pipelineKeyOf, stageToRun, unbuilt, withRun, questionsComment, snapshotOf, prodWarning, autoNext, linksFigma, impactRepos } from "../lib/pipeline"

const questions = [
  { id: "Q1", question: "¿Cuál es el copy?", proposal: "El del ticket" },
  { id: "Q2", question: "¿Se quita la frase?", proposal: "Sí" },
]

describe("parseResult", () => {
  it("reads the verdict and the questions", () => {
    expect(parseResult(JSON.stringify({ verdict: "needs-info", questions }), "refine")).toEqual({ verdict: "needs-info", questions, units: [], checklist: [], findings: [], fixed: [], scripts: [], order: [], results: [], contextImpact: [], debt: [] })
    expect(parseResult(`{"verdict":"ready","questions":[]}`, "refine")).toEqual({ verdict: "ready", questions: [], units: [], checklist: [], findings: [], fixed: [], scripts: [], order: [], results: [], contextImpact: [], debt: [] })
  })
  it("numbers questions without an id and drops empty ones", () => {
    const r = parseResult(JSON.stringify({ verdict: "needs-info", questions: [{ question: "¿A?", proposal: "" }, { question: " " }] }), "refine")
    expect(r.questions).toEqual([{ id: "Q1", question: "¿A?", proposal: "" }])
  })
  it("reads a plan's units, numbering the ones without an id", () => {
    const units = [{ repo: "api-service", subtask: "PP-2", branch: "feat/PP-2-x", title: "Campo", dependsOn: [] }, { id: "U9", repo: "web-app", title: "Aviso", dependsOn: ["U1"] }, { title: "sin repo" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", units }), "plan").units).toEqual([
      { id: "U1", repo: "api-service", subtask: "PP-2", subtasks: ["PP-2"], branch: "feat/PP-2-x", title: "Campo", dependsOn: [] },
      { id: "U9", repo: "web-app", subtask: null, subtasks: [], branch: "", title: "Aviso", dependsOn: ["U1"] },
    ])
  })
  it("reads what the build left of each unit: its status and its PR", () => {
    const units = [{ id: "U1", repo: "api-service", title: "Campo", status: "done", pr: "https://github.com/acme/api-service/pull/7" }, { id: "U2", repo: "web-app", title: "Aviso", status: "weird" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", units }), "build").units).toEqual([
      { id: "U1", repo: "api-service", subtask: null, subtasks: [], branch: "", title: "Campo", dependsOn: [], status: "done", pr: "https://github.com/acme/api-service/pull/7" },
      { id: "U2", repo: "web-app", subtask: null, subtasks: [], branch: "", title: "Aviso", dependsOn: [], status: "failed", pr: null },
    ])
  })
  it("reads a plan's to-do list in plain words, each item numbered and tied to its unit", () => {
    const checklist = [{ text: "Guardar por qué una empresa no se publica", unit: "U1" }, { id: "C7", text: "Mostrar el aviso en la app" }, { text: " " }]
    const units = [{ repo: "api-service", title: "Campo" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", units, checklist }), "plan").checklist).toEqual([
      { id: "C1", text: "Guardar por qué una empresa no se publica", unit: "U1" },
      { id: "C7", text: "Mostrar el aviso en la app", unit: null },
    ])
    expect(parseResult(JSON.stringify({ verdict: "ready", units }), "plan").checklist).toEqual([])
  })
  it("reads the scripts a plan runs on the data: each numbered, with its unit, command and environments", () => {
    const scripts = [
      { unit: "U1", title: "Backfill del motivo", command: "python scripts/backfill.py", when: "Tras el deploy de U1", envs: ["staging", "prod", "dev"] },
      { id: "S4", title: "Sin comando" },
      { title: " ", command: "x" },
    ]
    expect(parseResult(JSON.stringify({ verdict: "ready", units: [{ repo: "api-service", title: "Campo" }], scripts }), "plan").scripts).toEqual([
      { id: "S1", unit: "U1", title: "Backfill del motivo", command: "python scripts/backfill.py", when: "Tras el deploy de U1", envs: ["staging", "prod"] },
    ])
  })
  it("reads a review's findings: each numbered, its severity (minor when unknown) and where", () => {
    const findings = [
      { unit: "U1", severity: "blocker", file: "src/a.ts", line: 12, title: "El campo no se guarda", detail: "save() lo ignora", fix: "Añadirlo a save()" },
      { id: "F7", severity: "rare", title: "Nombre confuso" },
      { title: " " },
    ]
    expect(parseResult(JSON.stringify({ verdict: "ready", findings }), "review").findings).toEqual([
      { id: "F1", unit: "U1", severity: "blocker", file: "src/a.ts", line: 12, title: "El campo no se guarda", detail: "save() lo ignora", fix: "Añadirlo a save()" },
      { id: "F7", unit: null, severity: "minor", file: null, line: null, title: "Nombre confuso", detail: "", fix: "" },
    ])
  })
  it("reads what a test found of each criterion, a failure when it says nothing else", () => {
    const results = [{ criterion: "El aviso sale", status: "pass", evidence: "GET /home → 200", files: [{ path: "evidence/T1-desktop.png", caption: "Escritorio" }] }, { id: "T9", criterion: "El modal", status: "?" }, { criterion: " " }]
    expect(parseResult(JSON.stringify({ verdict: "ready", results }), "test").results).toEqual([
      { id: "T1", criterion: "El aviso sale", status: "pass", evidence: "GET /home → 200", files: [{ name: "T1-desktop.png", caption: "Escritorio" }] },
      { id: "T9", criterion: "El modal", status: "fail", evidence: "", files: [] },
    ])
  })
  it("reads a change to the team's context only with the words it makes untrue", () => {
    const contextImpact = [{ file: "glossary/publicacion.md", quote: "Una empresa se publica si…", why: "Ahora también cuenta la facturación" }, { file: "x.md", why: "sin cita" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", contextImpact }), "refine").contextImpact).toEqual([{ ...contextImpact[0], proposal: null } as never])
  })
  it("reads a new code rule, which has no words of before, with the rule it proposes", () => {
    const contextImpact = [
      { file: "context/03-engineering/rules/backend/04-dynamodb.md", quote: null, why: "core-lib ya tiene batch_write", proposal: "Escribe en lote con batch_write de core-lib." },
      { file: "context/03-engineering/rules/backend/04-dynamodb.md", quote: null, why: "sin regla" },
    ]
    expect(parseResult(JSON.stringify({ verdict: "ready", contextImpact }), "refine").contextImpact).toEqual([contextImpact[0] as never])
  })
  it("reads the findings a build fixed", () => {
    const units = [{ id: "U1", repo: "api-service", title: "Campo", status: "done", pr: "https://x/pull/1" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", units, fixed: ["F1", 2] }), "build").fixed).toEqual(["F1", "2"])
  })
  it("refuses a ready plan with no units", () => {
    expect(() => parseResult(`{"verdict":"ready","units":[]}`, "plan")).toThrow()
  })
  it("refuses what is not a verdict", () => {
    expect(() => parseResult("not json", "refine")).toThrow()
    expect(() => parseResult(`{"verdict":"maybe"}`, "refine")).toThrow()
    expect(() => parseResult(`{"verdict":"needs-info","questions":[]}`, "refine")).toThrow()
  })
})

describe("comments", () => {
  it("asks each question with its proposal, marked as the agent's", () => {
    const text = questionsComment("PP-1", questions, "refine")
    expect(text.startsWith(MARK)).toBe(true)
    expect(text).toContain("Q1. ¿Cuál es el copy?\nPropuesta: El del ticket")
    expect(text).toContain("Q2. ¿Se quita la frase?")
    expect(questionsComment("PP-1", questions, "plan")).toContain("Plan de PP-1")
  })
  it("answers each question, the proposal when left as it was", () => {
    const text = answersComment(questions, { Q1: "Otro copy", Q2: "" })
    expect(text.startsWith(MARK)).toBe(false)
    expect(text).toContain("Q1. ¿Cuál es el copy?\n→ Otro copy")
    expect(text).toContain("Q2. ¿Se quita la frase?\n→ Sí")
  })
})

describe("answeredAfter", () => {
  const asked = 1000
  it("sees a person's comment after the questions", () => {
    expect(answeredAfter([{ author: "Francisco", at: 2000, body: "Q1 vale" }], asked)).toBe(true)
  })
  it("ignores older comments and the agent's own", () => {
    expect(answeredAfter([{ author: "Carlos", at: 500, body: "antes" }, { author: "Carlos", at: 2000, body: `${MARK} · otra` }], asked)).toBe(false)
  })
})

describe("snapshotOf", () => {
  const ref = (key: string, summary: string) => ({ key, summary, type: "Story", kind: "story" as const, status: "Backlog", tone: "todo" as const, url: "" })
  const ticket = {
    key: "PP-1", summary: "Aviso", status: "Backlog", type: "Story", priority: "High", assignee: "Carlos", reporter: "Francisco",
    description: "Contexto.", comments: [{ author: "Francisco", at: Date.UTC(2026, 9, 27), body: "Revisa PP-2" }],
    parent: ref("PP-0", "Épica"), children: [ref("PP-3", "[BE] Campo")], links: [{ how: "relates to", ticket: ref("PP-2", "Regla") }],
  }
  it("holds the ticket, its comments, parent, sub-tasks and links", () => {
    const md = snapshotOf(ticket as never, { description: "De la épica." } as never, [{ ...ref("PP-3", "[BE] Campo"), description: "Hacer el campo." }] as never)
    expect(md).toContain("# PP-1 · Aviso")
    expect(md).toContain("Contexto.")
    expect(md).toContain("Francisco · 2026-10-27")
    expect(md).toContain("## Padre: PP-0 · Épica\n\nDe la épica.")
    expect(md).toContain("### PP-3 · [BE] Campo (Backlog)\n\nHacer el campo.")
    expect(md).toContain("- relates to PP-2 · Regla (Backlog)")
  })
  it("holds the whole tree: each child's own children, by key, title and status", () => {
    const child = { ...ref("PP-3", "Historia"), description: "Entrega.", children: [{ ...ref("PP-4", "[BE] deal-service"), status: "In Progress" }] }
    const md = snapshotOf(ticket as never, null, [child] as never)
    expect(md).toContain("### PP-3 · Historia (Backlog)\n\nEntrega.\n\nSubtareas:\n- PP-4 · [BE] deal-service (In Progress)")
  })
  it("holds the Confluence pages it links to, each with its title, version and address", () => {
    const md = snapshotOf(ticket as never, null, [], [{ id: "9", title: "Funcional: avisos", version: 7, url: "https://x/wiki/9", md: "Regla ~~vieja~~ nueva." }])
    expect(md).toContain("## Confluence: Funcional: avisos (versión 7)\n\nhttps://x/wiki/9\n\nRegla ~~vieja~~ nueva.")
  })
})

describe("pipelineKeyOf", () => {
  it("tells a pipeline session by its first prompt", () => {
    expect(pipelineKeyOf("[Pipeline] PP-3093 · refinar\n\nEres la etapa 1")).toBe("PP-3093")
  })
  it("leaves your own sessions alone", () => {
    expect(pipelineKeyOf("Mira el [Pipeline] PP-3093")).toBeNull()
    expect(pipelineKeyOf(null)).toBeNull()
  })
})

describe("withRun", () => {
  const base = { key: "PP-1", stage: "refine" as const, units: [], sessionId: "s1", startedAt: 100, endedAt: null, askedAt: null, questions: [], error: null }
  it("adds each run to the history once, then keeps it up to date", () => {
    const one = withRun({ ...base, status: "running", runs: 1 })
    expect(one.history).toEqual([{ n: 1, stage: "refine", sessionId: "s1", startedAt: 100, endedAt: null, status: "running", questions: 0, units: 0, error: null }])
    const asked = withRun({ ...one, status: "needs-info", endedAt: 900, questions: [{ id: "Q1", question: "¿A?", proposal: "" }] })
    expect(asked.history).toHaveLength(1)
    expect(asked.history![0]).toMatchObject({ status: "needs-info", endedAt: 900, questions: 1 })
    const two = withRun({ ...asked, status: "running", runs: 2, sessionId: "s2", startedAt: 1000, endedAt: null, questions: [] })
    expect(two.history!.map(r => [r.n, r.status])).toEqual([[1, "needs-info"], [2, "running"]])
  })
})

describe("stageToRun", () => {
  const at = (stage: "refine" | "plan" | "build" | "review", status: "running" | "needs-info" | "ready" | "failed") => ({ stage, status }) as never
  it("runs the ticket's own stage again, or refines a new one", () => {
    expect(stageToRun(null)).toBe("refine")
    expect(stageToRun(at("plan", "failed"))).toBe("plan")
  })
  it("builds only once the plan is done", () => {
    expect(stageToRun(at("plan", "ready"), "build")).toBe("build")
    expect(() => stageToRun(at("plan", "running"), "build")).toThrow()
    expect(stageToRun(at("build", "failed"))).toBe("build")
  })
  it("reviews once the build is done, and builds again to fix what the review found", () => {
    expect(stageToRun(at("build", "ready"), "review")).toBe("review")
    expect(() => stageToRun(at("build", "failed"), "review")).toThrow()
    expect(() => stageToRun(at("plan", "ready"), "review")).toThrow()
    expect(stageToRun(at("review", "ready"), "build")).toBe("build")
    expect(() => stageToRun(at("review", "running"), "build")).toThrow()
  })
  it("deploys to staging after a review with nothing to fix, and to prod after staging", () => {
    const reviewed = (severity: string) => ({ stage: "review", status: "ready", findings: [{ id: "F1", severity }] }) as never
    expect(stageToRun(reviewed("minor"), "staging")).toBe("staging")
    expect(() => stageToRun(reviewed("major"), "staging")).toThrow()
    expect(stageToRun(at("staging" as never, "ready"), "test")).toBe("test")
    expect(() => stageToRun(at("staging" as never, "ready"), "prod")).toThrow()
    expect(() => stageToRun(at("review", "ready"), "prod")).toThrow()
    expect(stageToRun(at("staging" as never, "failed"))).toBe("staging")
  })
  it("deploys to prod only once staging is tested with nothing failing, and checks prod after", () => {
    const tested = (status: string) => ({ stage: "test", status: "ready", results: [{ id: "T1", criterion: "c", status, evidence: "" }] }) as never
    expect(stageToRun(tested("pass"), "prod")).toBe("prod")
    expect(() => stageToRun(tested("fail"), "prod")).toThrow()
    expect(stageToRun(at("prod" as never, "ready"), "smoke")).toBe("smoke")
  })
  it("plans only once the refinement is done", () => {
    expect(stageToRun(at("refine", "ready"), "plan")).toBe("plan")
    expect(() => stageToRun(at("refine", "needs-info"), "plan")).toThrow()
    expect(() => stageToRun(null, "plan")).toThrow()
  })
})

describe("unbuilt", () => {
  const unit = (id: string, status: "done" | "failed", pr: string | null) => ({ id, repo: "r", subtask: null, branch: "", title: id, dependsOn: [], status, pr })
  it("names the units left without a PR", () => {
    expect(unbuilt([unit("U1", "done", "https://x/pull/1"), unit("U2", "failed", null), unit("U3", "done", null)])).toBe("No PR for U2, U3")
    expect(unbuilt([unit("U1", "done", "https://x/pull/1")])).toBeNull()
    expect(unbuilt([])).toBe("The build left no units")
  })
})

describe("argsFor", () => {
  it("gives a stage Figma, read-only, only when the ticket links a design", () => {
    const args = argsFor("build", "/data/pipeline", { figma: true })
    expect(args).toEqual(expect.arrayContaining(["--mcp-config", "/data/pipeline/stages/figma-mcp.json", "mcp__figma__get_design_context", "mcp__figma__get_screenshot"]))
    const denied = args.slice(args.indexOf("--disallowedTools") + 1)
    expect(denied).toEqual(expect.arrayContaining(["mcp__figma__use_figma", "mcp__figma__generate_figma_design", "mcp__figma__upload_assets"]))
    expect(argsFor("build", "/data/pipeline")).not.toContain("--mcp-config")
    expect(argsFor("smoke", "/data/pipeline", { figma: true })).not.toContain("--mcp-config")
  })
  it("finds a link to a design in what the stage reads", () => {
    expect(linksFigma("Ver diseño → https://www.figma.com/design/rl5pxe5r/UI?node-id=21003-315196")).toBe(true)
    expect(linksFigma("https://github.com/o/r/pull/7")).toBe(false)
  })
  it("lets only the test in staging load and clean its test data (fixtures.py), nothing else", () => {
    expect(argsFor("test", "/data/pipeline")).toEqual(expect.arrayContaining(["--allowedTools", "Bash(python3 fixtures.py:*)"]))
    for (const stage of ["refine", "plan", "build", "review", "smoke"] as const) expect(argsFor(stage, "/data/pipeline")).not.toContain("Bash(python3 fixtures.py:*)")
  })
  it("runs every stage clean (none of your settings, hooks or connectors) on its model and effort", () => {
    const args = argsFor("refine", "/data/pipeline")
    expect(args).toEqual(expect.arrayContaining(["--setting-sources", "project,local", "--strict-mcp-config", "--model", "claude-opus-5-5", "--effort", "high"]))
    expect(argsFor("plan", "/data/pipeline")).toEqual(expect.arrayContaining(["--effort", "medium"]))
    expect(argsFor("build", "/data/pipeline")).toEqual(expect.arrayContaining(["--add-dir", "/data/pipeline/repos"]))
    expect(argsFor("review", "/data/pipeline")).not.toContain("--add-dir")
  })
})

describe("what each stage may not do", () => {
  const denied = (stage: Parameters<typeof argsFor>[0]) => {
    const args = argsFor(stage, "/data/pipeline")
    return args.slice(args.indexOf("--disallowedTools") + 1)
  }
  it("never lets an agent merge, force a push, push to the default branch or run a script for real", () => {
    for (const stage of ["refine", "plan", "build", "review", "test", "smoke"] as const)
      expect(denied(stage)).toEqual(expect.arrayContaining(["Bash(gh pr merge:*)", "Bash(git push --force:*)", "Bash(git push origin master:*)", "Bash(EXECUTE=true:*)", "Bash(STAGE=prod:*)"]))
  })
  it("keeps the stages that only read out of the repos", () => {
    for (const stage of ["refine", "plan", "review", "test", "smoke"] as const)
      expect(denied(stage)).toEqual(expect.arrayContaining(["Bash(git push:*)", "Bash(git commit:*)", "Edit(//data/pipeline/repos/**)", "Write(//data/pipeline/repos/**)"]))
    expect(denied("build")).not.toContain("Bash(git push:*)")
  })
  it("keeps AWS for the test in staging only", () => {
    for (const stage of ["refine", "plan", "build", "review", "smoke"] as const) expect(denied(stage)).toContain("Bash(aws:*)")
    expect(denied("test")).not.toContain("Bash(aws:*)")
  })
})

describe("checkedIn", () => {
  it("reads the items the build marked done, as a list or under done", () => {
    expect(checkedIn(`{"done": ["C1", "C3"]}`)).toEqual(["C1", "C3"])
    expect(checkedIn(`["C2"]`)).toEqual(["C2"])
    expect(checkedIn("not json")).toEqual([])
    expect(checkedIn(null)).toEqual([])
  })
})

describe("blocking", () => {
  const finding = (id: string, severity: "blocker" | "major" | "minor") => ({ id, unit: null, severity, file: null, line: null, title: id, detail: "", fix: "" })
  it("counts the findings that stop a ticket: blockers and majors", () => {
    expect(blocking([finding("F1", "blocker"), finding("F2", "minor"), finding("F3", "major")]).map(f => f.id)).toEqual(["F1", "F3"])
    expect(blocking(undefined)).toEqual([])
  })
})

describe("toFixNow", () => {
  const finding = (id: string, severity: "blocker" | "major" | "minor") => ({ id, unit: null, severity, file: null, line: null, title: id, detail: "", fix: "" })
  it("fixes the findings you chose (only ones it has), else the blockers and majors", () => {
    const found = [finding("F1", "minor"), finding("F2", "major"), finding("F3", "minor")]
    expect(toFixNow(found)).toEqual(["F2"])
    expect(toFixNow(found, ["F3", "F1", "F9"])).toEqual(["F1", "F3"])
    expect(toFixNow(undefined, ["F1"])).toEqual([])
  })
})

describe("prodWarning", () => {
  it("warns on top of a check in prod that failed, and only there", () => {
    const failed = { results: [{ id: "P1", criterion: "x", status: "fail" as const, evidence: "" }] }
    expect(prodWarning("smoke", failed)).toContain("El check de prod ha fallado (P1)")
    expect(prodWarning("test", failed)).toBe("")
    expect(prodWarning("smoke", { results: [] })).toBe("")
  })
})

describe("autoNext", () => {
  const at = (stage: string, status: string, extra = {}) => ({ key: "PP-1", stage, status, auto: true, ...extra }) as never
  it("runs on by itself, refine to plan to build to review", () => {
    expect(autoNext(at("refine", "ready"))).toBe("plan")
    expect(autoNext(at("plan", "ready"))).toBe("build")
    expect(autoNext(at("build", "ready"))).toBe("review")
  })
  it("stops at the review, with the PRs done: staging stays a person's", () => {
    expect(autoNext(at("review", "ready"))).toBeNull()
  })
  it("waits while a stage asks, failed or runs, and does nothing unless it was asked to run on its own", () => {
    expect(autoNext(at("plan", "needs-info"))).toBeNull()
    expect(autoNext(at("build", "failed"))).toBeNull()
    expect(autoNext(at("refine", "running"))).toBeNull()
    expect(autoNext(at("refine", "ready", { auto: false }))).toBeNull()
  })
  it("leaves a coordinator to its children", () => {
    expect(autoNext(at("refine", "ready", { children: [{ key: "PP-2", dependsOn: [] }] }))).toBeNull()
  })
})

describe("a unit's sub-tasks", () => {
  it("reads every sub-task a unit covers, the old single one too, each once", () => {
    const units = [{ id: "U1", repo: "deale-frontend", title: "Badge", subtasks: ["PP-2795", "PP-2792", "PP-2795"], subtask: "PP-2793" }, { id: "U2", repo: "x", title: "y", subtask: "PP-1" }]
    const out = parseResult(JSON.stringify({ verdict: "ready", units }), "plan").units
    expect(out[0]!.subtasks).toEqual(["PP-2795", "PP-2792", "PP-2793"])
    expect(out[1]!.subtasks).toEqual(["PP-1"])
  })
})

describe("isAdopted", () => {
  it("a job's work the pipeline takes on: its stage's files, the ticket and its context; not its worktrees, nor a review's or a test's", () => {
    const names = ["refine.md", "refine.summary.md", "plan.json", "build.json", "build.progress.json", "build.checklist.json", "ticket.md", "context", "work", "state.json", "review.json", "test.md", "prs.json", "build.log"]
    expect(names.filter(isAdopted)).toEqual(["refine.md", "refine.summary.md", "plan.json", "build.json", "build.progress.json", "build.checklist.json", "ticket.md", "context"])
  })
})

describe("impactRepos", () => {
  const repos = ["deale-context", "deale-frontend", "deale-mobile"]
  const impact = (file: string) => ({ file, quote: "x", why: "y", proposal: null })
  it("puts a change of the team's context in the context repo", () => {
    expect(impactRepos([impact("context/03-engineering/05-code-standards.md")], repos, "deale-context")).toEqual(["deale-context"])
  })
  it("puts a change of a repo's own rules in that repo", () => {
    expect(impactRepos([impact("deale-frontend/docs/rules/02-componentes.md"), impact("deale-mobile/docs/rules/07-i18n.md")], repos, "deale-context")).toEqual(["deale-frontend", "deale-mobile"])
  })
  it("names each repo once", () => {
    expect(impactRepos([impact("glossary.md"), impact("deale-context/context/x.md"), impact("deale-frontend/docs/rules/a.md"), impact("deale-frontend/docs/rules/b.md")], repos, "deale-context")).toEqual(["deale-context", "deale-frontend"])
  })
})

describe("criteria the test could not try", () => {
  const results = [{ id: "T1", criterion: "a", status: "pass", evidence: "ok" }, { id: "T2", criterion: "b", status: "untested", evidence: "No hay set de asesor" }] as never
  it("are read as such, and nothing else passes for them", () => {
    expect(parseResult(JSON.stringify({ verdict: "ready", results: [{ criterion: "b", status: "untested" }, { criterion: "c", status: "maybe" }] }), "test").results.map(r => r.status)).toEqual(["untested", "fail"])
  })
  it("keep prod shut until a person checks them by hand", () => {
    const tested = { key: "PP-1", stage: "test", status: "ready", results } as never
    expect(() => stageToRun(tested, "prod")).toThrow()
    const checked = checkedByHand(results, ["T2"], "2026-11-09")
    expect(checked[1]).toMatchObject({ status: "pass", evidence: "Comprobado a mano el 2026-11-09. No hay set de asesor" })
    expect(stageToRun({ ...(tested as object), results: checked } as never, "prod")).toBe("prod")
  })
})

describe("what a person reads", () => {
  it("each question says why it is asked, and each result what happened, in plain words", () => {
    const r = parseResult(JSON.stringify({ verdict: "needs-info", questions: [{ question: "¿A?", proposal: "Sí", context: "Si es sí, el PDF cambia." }] }), "refine")
    expect(r.questions[0]).toEqual({ id: "Q1", question: "¿A?", proposal: "Sí", context: "Si es sí, el PDF cambia." })
    const t = parseResult(JSON.stringify({ verdict: "ready", results: [{ criterion: "c", status: "fail", evidence: "orgType", summary: "El asesor lo ve en inglés." }] }), "test")
    expect(t.results[0]!.summary).toBe("El asesor lo ve en inglés.")
  })
  it("the questions in Jira carry their context", () => {
    expect(questionsComment("PP-1", [{ id: "Q1", question: "¿A?", proposal: "Sí", context: "Cambia el PDF." }], "refine")).toContain("Q1. ¿A?\nPor qué: Cambia el PDF.\nPropuesta: Sí")
  })
})

describe("asking the agent about what it left", () => {
  it("names what it is about and keeps it to reading", () => {
    const text = askPrompt("PP-1", "result:CA3", "¿Qué es orgType?")
    expect(text.startsWith("[Pipeline] PP-1 · pregunta")).toBe(true)
    expect(text).toContain("el resultado CA3")
    expect(text).toContain("«¿Qué es orgType?»")
    expect(text).toContain("No cambies nada")
  })
  it("only about what is there", () => {
    expect(isAbout("question:Q2")).toBe(true)
    expect(isAbout("finding:F1")).toBe(true)
    expect(isAbout("result:CA3")).toBe(true)
    expect(isAbout("plan")).toBe(false)
  })
})

describe("askRefusal", () => {
  const history = [{ n: 1, stage: "test", sessionId: "s" }]
  const ended = { sessionId: "s", status: "ready", history } as never
  it("asks one thing at a time, about something of a run that ended", () => {
    expect(askRefusal(ended, "result:CA3", "¿Qué?")).toBeNull()
    expect(askRefusal(null, "result:CA3", "¿Qué?")).toBe("No run to ask about")
    expect(askRefusal({ sessionId: "s", status: "running", history } as never, "result:CA3", "¿Qué?")).toBe("The agent is still at work: ask once it ends")
    expect(askRefusal(ended, "plan", "¿Qué?")).toBe("Nothing to ask")
    const waiting = { sessionId: "s", status: "ready", history, threads: { "result:CA3": [{ q: "a", a: null, at: 1000 }] } } as never
    expect(askRefusal(waiting, "result:CA3", "¿Y?", 2000)).toBe("It is still answering the last question")
    expect(askRefusal(waiting, "result:CA3", "¿Y?", 1000 + 6 * 60_000)).toBeNull()
  })
})

describe("a build after a failed test", () => {
  const results = [{ id: "CA3", criterion: "Asesor: español", status: "fail", evidence: "orgType", summary: "Lo ve en inglés" }, { id: "CA1", criterion: "x", status: "pass", evidence: "" }, { id: "M1", criterion: "m", status: "untested", evidence: "" }] as never
  const tested = { results, fixOf: { CA3: "PP-3250", CA1: "PP-3249" }, fixes: ["PP-3249", "PP-3250", "PP-3251"], threads: { "result:CA3": [{ q: "¿Qué es orgType?", a: "El papel…", at: 1 }, { q: "¿Y?", a: null, at: 2 }] } } as never
  it("fixes what failed (not what it could not try), each with what the test found, its [Fix] and what was asked", () => {
    expect(testFix(tested)).toEqual([{ id: "CA3", criterion: "Asesor: español", summary: "Lo ve en inglés", evidence: "orgType", subtask: "PP-3250", asked: [{ q: "¿Qué es orgType?", a: "El papel…" }] }])
    expect(testFix(tested, ["CA1"])).toEqual([])
  })
  it("moves in Jira only the [Fix] of what fails now", () => {
    expect(fixesNow(tested)).toEqual(["PP-3250"])
    expect(fixesNow({ fixes: ["PP-1"] } as never)).toEqual(["PP-1"])
  })
  it("adds only the units staging does not run yet", () => {
    const s = { units: [{ id: "U1" }, { id: "X1" }], deployed: { staging: { steps: [{ kind: "merge", unit: "U1", status: "done" }] } } } as never
    expect(unshipped(s).map(u => u.id)).toEqual(["X1"])
  })
  it("starts from a test only with something that failed", () => {
    expect(stageToRun({ stage: "test", status: "ready", results } as never, "build")).toBe("build")
  })
})

describe("the catalog of test data, by stage", () => {
  it("the test writes its data; refine, plan, build and review only read the catalog; the check in prod, nothing", () => {
    expect(argsFor("test", "/d")).toContain("Bash(python3 fixtures.py:*)")
    expect(argsFor("build", "/d")).toContain("Bash(python3 fixtures.py contexts:*)")
    expect(argsFor("build", "/d")).not.toContain("Bash(python3 fixtures.py:*)")
    expect(argsFor("smoke", "/d").some(a => a.includes("fixtures.py"))).toBe(false)
  })
})

describe("each run keeps what it left", () => {
  const base = { key: "PP-1", sessionId: null, startedAt: 1, endedAt: 2, askedAt: null, questions: [], error: null } as const
  const units = [{ id: "U1", repo: "a", title: "t", pr: "https://github.com/o/a/pull/1" }]
  it("a plan and a build their units; a review its findings; a test its results; nothing while it runs", () => {
    const at = (extra: object) => withRun({ ...base, units, findings: [{ id: "F1" }], results: [{ id: "T1" }], ...extra } as never).history!.at(-1)! as { kept?: unknown }
    expect(at({ stage: "build", status: "ready", runs: 2 }).kept).toEqual({ units })
    expect(at({ stage: "review", status: "ready", runs: 3 }).kept).toEqual({ findings: [{ id: "F1" }] })
    expect(at({ stage: "test", status: "ready", runs: 4 }).kept).toEqual({ results: [{ id: "T1" }] })
    expect(at({ stage: "build", status: "running", runs: 5 }).kept).toBeUndefined()
  })
})

describe("a build's pass keeps only what it did", () => {
  const u = (id: string) => ({ id, repo: "r", subtask: null, branch: "b", title: id, dependsOn: [], pr: `https://github.com/o/r/pull/${id}` })
  const base = { key: "PP-1", stage: "build", status: "ready", runs: 9, sessionId: null, startedAt: 1, endedAt: 2, askedAt: null, questions: [], error: null } as const
  const kept = (extra: object) => (withRun({ ...base, ...extra } as never).history!.at(-1)! as { kept?: { units?: { id: string }[] } }).kept!.units!.map(x => x.id)
  it("the first, every unit; a fix of the review, the units its findings were in; a fix of staging, its new units", () => {
    expect(kept({ units: [u("U1"), u("U2")] })).toEqual(["U1", "U2"])
    expect(kept({ units: [u("U1"), u("U2")], fixed: ["F1"], findings: [{ id: "F1", unit: "U2" }] })).toEqual(["U2"])
    expect(kept({ units: [u("U1"), u("X1")], deployed: { staging: { steps: [{ kind: "merge", unit: "U1", status: "done" }] } } })).toEqual(["X1"])
  })
})

describe("testedIn", () => {
  it("is the commit staging ran of each repo: its merge that went", () => {
    const deployed = { staging: { steps: [{ kind: "merge", repo: "api", sha: "a1", status: "done" }, { kind: "merge", repo: "web", sha: "w1", status: "failed" }, { kind: "manual", repo: "app", status: "done" }] } }
    expect(testedIn({ deployed } as never)).toEqual({ api: "a1" })
  })
})

describe("a stage that never got its agent", () => {
  it("fails a while after the board marked it at work without one; a release never", () => {
    expect(isStuck({ status: "running", pid: null, stage: "build", startedAt: 0 }, 4 * 60_000)).toBe(true)
    expect(isStuck({ status: "running", pid: null, stage: "build", startedAt: 0 }, 60_000)).toBe(false)
    expect(isStuck({ status: "running", pid: 12, stage: "build", startedAt: 0 }, 4 * 60_000)).toBe(false)
    expect(isStuck({ status: "running", pid: null, stage: "staging", startedAt: 0 }, 4 * 60_000)).toBe(false)
  })
})

describe("what an environment runs", () => {
  it("adds each release's steps to the ones before that went", () => {
    const before = { env: "staging", steps: [{ id: "R1", kind: "merge", unit: "U1", status: "done", sha: "a" }, { id: "R2", kind: "manual", status: "pending" }] } as never
    const fix = { env: "staging", steps: [{ id: "R1", kind: "merge", unit: "X1", status: "done", sha: "b" }] } as never
    expect(shippedWith(before, fix).steps.map(s => s.unit)).toEqual(["U1", "X1"])
  })
  it("after a rollback, the ticket can be built again", () => {
    expect(stageToRun({ stage: "staging", status: "failed", release: { env: "staging", rollback: true, steps: [] } } as never, "build")).toBe("build")
    expect(() => stageToRun({ stage: "staging", status: "failed", release: { env: "staging", steps: [] } } as never, "build")).toThrow()
  })
})


describe("Jira after a fix", () => {
  const u = (id: string) => ({ id, repo: "r", subtask: null, subtasks: [`S-${id}`], branch: "b", title: id, dependsOn: [] })
  const results = [{ id: "T2", criterion: "a", status: "fail" }, { id: "T3", criterion: "b", status: "fail" }] as never
  it("moves only the [Fix] of the criteria you chose to fix", () => {
    expect(fixesNow({ results, fixOf: { T2: "PP-2", T3: "PP-3" }, fixing: { from: "test", ids: ["T2"] } } as never)).toEqual(["PP-2"])
    expect(fixesNow({ results, fixOf: { T2: "PP-2", T3: "PP-3" } } as never)).toEqual(["PP-2", "PP-3"])
    expect(fixesNow({ results, fixOf: { T2: "PP-2" }, fixing: { from: "review", ids: ["F1"] } } as never)).toEqual([])
  })
  it("a fix of the review moves only the units its findings are in", () => {
    const s = { units: [u("U1"), u("U2")], findings: [{ id: "F1", unit: "U2" }, { id: "F2", unit: "U1" }], fixing: { from: "review", ids: ["F1"] } } as never
    expect(unitsNow(s).map(x => x.id)).toEqual(["U2"])
  })
  it("in staging, only the units whose release steps went are done", () => {
    const s = { units: [u("U1"), u("U2")], release: { env: "staging", steps: [{ unit: "U1", status: "done" }, { unit: "U2", status: "skipped" }] } } as never
    expect(releasedUnits(s).map(x => x.id)).toEqual(["U1"])
  })
  it("a build listing only its new units keeps the ones before", () => {
    expect(withUnits([u("U1"), u("U2")], [{ ...u("U2"), title: "new" }, u("X1")]).map(x => `${x.id}:${x.title}`)).toEqual(["U1:U1", "U2:new", "X1:X1"])
  })
})

describe("sessionOf", () => {
  const history = [{ n: 1, stage: "review", sessionId: "rev" }, { n: 2, stage: "build", sessionId: "bld" }, { n: 3, stage: "test", sessionId: "tst" }] as never
  it("asks the session that wrote it, whatever stage the ticket is at now", () => {
    expect(sessionOf({ sessionId: "now", history }, "finding:F1")).toBe("rev")
    expect(sessionOf({ sessionId: "now", history }, "result:CA3")).toBe("tst")
    expect(sessionOf({ sessionId: "now", history }, "question:Q1")).toBe("now")
  })
})

describe("a test after a fix", () => {
  it("knows what was fixed, what failed or was not tried before, and the repos the fix changed", () => {
    const state = { fixing: { from: "test", ids: ["CA3"] }, results: [{ id: "CA3", status: "fail" }, { id: "BE4", status: "fail" }, { id: "M1", status: "untested" }, { id: "CA1", status: "pass" }],
      units: [{ id: "U1", repo: "web" }, { id: "X1", repo: "company-service" }], deployed: { staging: { steps: [{ kind: "merge", unit: "U1", status: "done" }] } },
      release: { env: "staging", steps: [{ kind: "merge", unit: "X1", status: "done" }] } } as never
    expect(retestOf(state)).toEqual({ fixed: ["CA3"], before: ["BE4", "M1"], repos: ["company-service"] })
    expect(retestOf({ results: [] } as never)).toBeNull()
  })
})
