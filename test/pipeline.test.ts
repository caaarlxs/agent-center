import { describe, expect, it } from "bun:test"
import { checkedIn, MARK, answeredAfter, answersComment, argsFor, parseResult, pipelineKeyOf, stageToRun, unbuilt, withRun, questionsComment, snapshotOf } from "../lib/pipeline"

const questions = [
  { id: "Q1", question: "¿Cuál es el copy?", proposal: "El del ticket" },
  { id: "Q2", question: "¿Se quita la frase?", proposal: "Sí" },
]

describe("parseResult", () => {
  it("reads the verdict and the questions", () => {
    expect(parseResult(JSON.stringify({ verdict: "needs-info", questions }), "refine")).toEqual({ verdict: "needs-info", questions, units: [], checklist: [] })
    expect(parseResult(`{"verdict":"ready","questions":[]}`, "refine")).toEqual({ verdict: "ready", questions: [], units: [], checklist: [] })
  })
  it("numbers questions without an id and drops empty ones", () => {
    const r = parseResult(JSON.stringify({ verdict: "needs-info", questions: [{ question: "¿A?", proposal: "" }, { question: " " }] }), "refine")
    expect(r.questions).toEqual([{ id: "Q1", question: "¿A?", proposal: "" }])
  })
  it("reads a plan's units, numbering the ones without an id", () => {
    const units = [{ repo: "company-service", subtask: "PP-2", branch: "feat/PP-2-x", title: "Campo", dependsOn: [] }, { id: "U9", repo: "deale-frontend", title: "Aviso", dependsOn: ["U1"] }, { title: "sin repo" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", units }), "plan").units).toEqual([
      { id: "U1", repo: "company-service", subtask: "PP-2", branch: "feat/PP-2-x", title: "Campo", dependsOn: [] },
      { id: "U9", repo: "deale-frontend", subtask: null, branch: "", title: "Aviso", dependsOn: ["U1"] },
    ])
  })
  it("reads what the build left of each unit: its status and its PR", () => {
    const units = [{ id: "U1", repo: "company-service", title: "Campo", status: "done", pr: "https://github.com/deale-org/company-service/pull/7" }, { id: "U2", repo: "deale-frontend", title: "Aviso", status: "weird" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", units }), "build").units).toEqual([
      { id: "U1", repo: "company-service", subtask: null, branch: "", title: "Campo", dependsOn: [], status: "done", pr: "https://github.com/deale-org/company-service/pull/7" },
      { id: "U2", repo: "deale-frontend", subtask: null, branch: "", title: "Aviso", dependsOn: [], status: "failed", pr: null },
    ])
  })
  it("reads a plan's to-do list in plain words, each item numbered and tied to its unit", () => {
    const checklist = [{ text: "Guardar por qué una empresa no se publica", unit: "U1" }, { id: "C7", text: "Mostrar el aviso en la app" }, { text: " " }]
    const units = [{ repo: "company-service", title: "Campo" }]
    expect(parseResult(JSON.stringify({ verdict: "ready", units, checklist }), "plan").checklist).toEqual([
      { id: "C1", text: "Guardar por qué una empresa no se publica", unit: "U1" },
      { id: "C7", text: "Mostrar el aviso en la app", unit: null },
    ])
    expect(parseResult(JSON.stringify({ verdict: "ready", units }), "plan").checklist).toEqual([])
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
  const at = (stage: "refine" | "plan" | "build", status: "running" | "needs-info" | "ready" | "failed") => ({ stage, status }) as never
  it("runs the ticket's own stage again, or refines a new one", () => {
    expect(stageToRun(null)).toBe("refine")
    expect(stageToRun(at("plan", "failed"))).toBe("plan")
  })
  it("builds only once the plan is done", () => {
    expect(stageToRun(at("plan", "ready"), "build")).toBe("build")
    expect(() => stageToRun(at("plan", "running"), "build")).toThrow()
    expect(stageToRun(at("build", "failed"))).toBe("build")
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
  it("runs every stage clean (none of your settings, hooks or connectors) on its model and effort", () => {
    const args = argsFor("refine", "/data/pipeline")
    expect(args).toEqual(expect.arrayContaining(["--setting-sources", "project,local", "--strict-mcp-config", "--model", "claude-opus-5-5", "--effort", "high"]))
    expect(argsFor("plan", "/data/pipeline")).toEqual(expect.arrayContaining(["--effort", "medium"]))
    expect(argsFor("build", "/data/pipeline")).toEqual(expect.arrayContaining(["--add-dir", "/data/pipeline/repos"]))
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
