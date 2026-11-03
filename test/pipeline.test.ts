import { describe, expect, it } from "bun:test"
import { MARK, answeredAfter, answersComment, parseRefine, questionsComment, snapshotOf } from "../lib/pipeline"

const questions = [
  { id: "Q1", question: "¿Cuál es el copy?", proposal: "El del ticket" },
  { id: "Q2", question: "¿Se quita la frase?", proposal: "Sí" },
]

describe("parseRefine", () => {
  it("reads the verdict and the questions", () => {
    expect(parseRefine(JSON.stringify({ verdict: "needs-info", questions }))).toEqual({ verdict: "needs-info", questions })
    expect(parseRefine(`{"verdict":"ready","questions":[]}`)).toEqual({ verdict: "ready", questions: [] })
  })
  it("numbers questions without an id and drops empty ones", () => {
    const r = parseRefine(JSON.stringify({ verdict: "needs-info", questions: [{ question: "¿A?", proposal: "" }, { question: " " }] }))
    expect(r.questions).toEqual([{ id: "Q1", question: "¿A?", proposal: "" }])
  })
  it("refuses what is not a verdict", () => {
    expect(() => parseRefine("not json")).toThrow()
    expect(() => parseRefine(`{"verdict":"maybe"}`)).toThrow()
    expect(() => parseRefine(`{"verdict":"needs-info","questions":[]}`)).toThrow()
  })
})

describe("comments", () => {
  it("asks each question with its proposal, marked as the agent's", () => {
    const text = questionsComment("PP-1", questions)
    expect(text.startsWith(MARK)).toBe(true)
    expect(text).toContain("Q1. ¿Cuál es el copy?\nPropuesta: El del ticket")
    expect(text).toContain("Q2. ¿Se quita la frase?")
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
