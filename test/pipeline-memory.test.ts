import { describe, expect, it } from "bun:test"
import { AUTO_FIXES, autoNext, shippedWith, stageToRun, withScripts, toolDirs, noteText, parseResult, plainFindings, retestOf, sentBackSince, withEarlier, backRefusal, backWhy, continuePrompt, newsOf, pipelineKeyOf, spentIn, whyStart, type PipelineState, type Run } from "../lib/pipeline"
import { tookUnit } from "../lib/release"

const base: PipelineState = { key: "PP-1", stage: "refine", status: "ready", sessionId: null, runs: 1, startedAt: 1, endedAt: 2, askedAt: null, questions: [], error: null }
const run = (n: number, stage: Run["stage"], status: Run["status"] = "ready", extra: Partial<Run> = {}): Run =>
  ({ n, stage, sessionId: `s-${stage}`, startedAt: n, endedAt: n, status, questions: 0, units: 0, error: null, ...extra })

describe("on its own", () => {
  const blocker = { id: "F1", unit: "U1", severity: "blocker" as const, file: null, line: null, title: "t", detail: "", fix: "" }
  it("goes on to the review, and tests staging once it is deployed", () => {
    expect(autoNext({ ...base, auto: true })).toBe("plan")
    expect(autoNext({ ...base, auto: true, stage: "build" })).toBe("review")
    expect(autoNext({ ...base, auto: true, stage: "review" })).toBeNull()
    expect(autoNext({ ...base, auto: true, stage: "staging" })).toBe("test")
    expect(autoNext({ ...base, auto: false })).toBeNull()
  })
  it("fixes what a review or a test found a few times, then waits for you", () => {
    expect(autoNext({ ...base, auto: true, stage: "review", findings: [blocker] })).toBe("build")
    expect(autoNext({ ...base, auto: true, stage: "test", results: [{ id: "T1", criterion: "c", status: "fail", evidence: "" }] })).toBe("build")
    expect(autoNext({ ...base, auto: true, stage: "review", findings: [blocker], autoFixes: AUTO_FIXES })).toBeNull()
  })
  it("stops where a person decides: a criterion nobody could try", () => {
    expect(autoNext({ ...base, auto: true, stage: "test", results: [{ id: "T1", criterion: "c", status: "untested", evidence: "" }] })).toBeNull()
  })
})

describe("sending it back", () => {
  it("to refine, plan or build, once the stage before it was done, and not while one runs", () => {
    expect(backRefusal({ ...base, stage: "test", history: [run(1, "refine"), run(2, "plan")] }, "build")).toBeNull()
    expect(backRefusal({ ...base, history: [run(1, "refine")] }, "build")).toMatch(/plan done first/i)
    expect(backRefusal({ ...base, status: "running" }, "refine")).toMatch(/runs/)
    expect(backRefusal(base, "review")).toMatch(/Refine, Plan or Build/)
  })
  it("tells the stage what you said, what people wrote, and that what is deployed stays", () => {
    const state = { ...base, stage: "test" as const, deployed: { staging: { env: "staging" as const, steps: [] } }, news: { comments: [{ author: "Francisco", at: Date.parse("2026-11-09"), body: "Also the export" }] } }
    const why = backWhy(state, "plan", "Add the export")
    expect(why.cause).toBe("Sent back: Add the export")
    expect(why.text).toContain("Add the export")
    expect(why.text).toContain("Francisco, 2026-11-09: Also the export")
    expect(why.text).toContain("unidades nuevas")
    expect(backWhy(state, "refine", "").text).not.toContain("unidades nuevas")
  })
})

describe("a stage's own session", () => {
  it("goes on with what changed, and is still the pipeline's", () => {
    const prompt = continuePrompt("PP-1", "/d/PP-1", "plan", [], "Te devuelven")
    expect(pipelineKeyOf(prompt)).toBe("PP-1")
    expect(prompt).toContain("Te devuelven")
    expect(prompt).toContain("plan.json.prev")
  })
  it("a run again after a stop goes on where it was; a fix says what it fixes", () => {
    expect(whyStart({ ...base, status: "failed", error: "Stopped by you" }, "refine")?.cause).toBe("Run again")
    expect(whyStart({ ...base, stage: "review" }, "build")?.cause).toBe("Fix the review")
    expect(whyStart({ ...base }, "plan")).toBeUndefined()
  })
  it("each run spends what it added to the session", () => {
    const spend = (cost: number) => ({ input: cost, output: 0, cacheRead: 0, cacheWrite: 0, cost, model: "m" })
    const history = [run(1, "refine", "needs-info"), run(2, "refine", "ready", { base: spend(3) })]
    expect(spentIn(history[0]!, history, spend(5))?.cost).toBe(3)
    expect(spentIn(history[1]!, history, spend(5))?.cost).toBe(2)
  })
})

describe("what people wrote since the last run", () => {
  it("is a person's, not the board's", () => {
    const c = (body: string, at: number) => ({ id: String(at), author: "A", authorId: null, at, body })
    expect(newsOf([c("🤖 Agent Center · done", 5), c("PR: https://x", 6), c("Respuestas a las preguntas del pipeline", 7), c("Old", 1), c("New scope", 8)] as never, 2))
      .toEqual({ comments: [{ author: "A", at: 8, body: "New scope" }] })
    expect(newsOf([], 2)).toBeNull()
  })
})

describe("what an environment runs", () => {
  it("a new PR under an id used before is new work", () => {
    const steps = [{ unit: "U1", links: [{ label: "PR #1", url: "https://github.com/o/r/pull/1" }] }]
    expect(tookUnit(steps, { id: "U1", pr: "https://github.com/o/r/pull/1" })).toBe(true)
    expect(tookUnit(steps, { id: "U1", pr: "https://github.com/o/r/pull/9" })).toBe(false)
    expect(tookUnit([{ unit: "U1" }], { id: "U1", pr: null })).toBe(true)
  })
})

describe("a review after a fix", () => {
  it("reviews only what changed since the last review", () => {
    const state = { ...base, stage: "build" as const, fixing: { from: "review" as const, ids: ["F1"] }, findings: [{ id: "F1", unit: "U1", severity: "major" as const, file: null, line: null, title: "t", detail: "", fix: "" }],
      units: [{ id: "U1", repo: "r", subtask: null, branch: "b", title: "t", dependsOn: [], pr: "https://github.com/o/r/pull/1" }], history: [run(13, "review", "ready", { endedAt: Date.parse("2026-11-10T10:00:00Z") })] }
    const why = whyStart(state, "review")
    expect(why?.cause).toBe("Review the fix")
    expect(why?.text).toContain("U1 (https://github.com/o/r/pull/1)")
    expect(why?.text).toContain("2026-11-10T10:00:00.000Z")
    expect(whyStart({ ...state, fixing: null }, "review")).toBeUndefined()
    const sent = { ...state, fixing: null, history: [...state.history, run(14, "build", "ready", { cause: "Sent back: copies" })] }
    expect(whyStart(sent, "review")?.cause).toBe("Review the change")
    expect(whyStart(sent, "review")?.text).toContain("sent-back.md")
  })
})

describe("your note when you send it back", () => {
  it("is what you wrote, without the lines of the files", () => {
    expect(noteText("Cambia los copies\n\nAttached images (open them with Read):\n- /a.png\n- /b.png")).toBe("Cambia los copies")
    expect(noteText("Attached image (open it with Read): /a.png")).toBeNull()
  })
})

describe("findings in plain words", () => {
  const f = { id: "F1", unit: "U2", severity: "blocker" as const, file: "a.py", line: 1, title: "run_planned salta", detail: "d", fix: "x" }
  it("a review keeps the explanation it wrote", () => {
    expect(parseResult(JSON.stringify({ verdict: "ready", findings: [{ ...f, plain: "Quien apagó el email lo vuelve a recibir." }] }), "review").findings[0]?.plain).toBe("Quien apagó el email lo vuelve a recibir.")
  })
  it("one written later goes into the findings without one, with its title", () => {
    const out = plainFindings([f, { ...f, id: "F2", plain: "ya" }], { F1: { title: "Se pierden los avisos apagados", plain: "Explicado" }, F2: { plain: "otra" } })
    expect(out[0]).toMatchObject({ title: "Se pierden los avisos apagados", plain: "Explicado", detail: "d" })
    expect(out[1]?.plain).toBe("ya")
  })
})

describe("after a Send back, each stage only what is new", () => {
  const sent = [run(1, "review"), run(2, "test"), run(3, "build", "ready", { cause: "Sent back: copies" })]
  it("a stage knows it was sent back since it last ended well", () => {
    expect(sentBackSince({ history: sent }, "test")).toBe(true)
    expect(sentBackSince({ history: [...sent, run(4, "test")] }, "test")).toBe(false)
    expect(sentBackSince({ history: sent }, "smoke")).toBe(false)
  })
  it("the test tries only the change, and keeps the results it does not try again", () => {
    expect(retestOf({ history: sent, backNote: "Informa → Registro Mercantil", units: [], release: null }, "test")).toEqual({ change: "Informa → Registro Mercantil", repos: [] })
    expect(whyStart({ ...base, stage: "staging", history: sent }, "test")?.cause).toBe("Test what changed")
    const toPlan = [run(1, "plan"), run(2, "build"), run(3, "refine", "ready", { cause: "Sent back: scope" })]
    const plan = whyStart({ ...base, history: toPlan, backNote: "scope", deployed: { staging: { env: "staging", steps: [] } } }, "plan")
    expect(plan?.cause).toBe("After the change")
    expect(plan?.text).toContain("unidades nuevas")
    const r = (id: string, status: "pass" | "fail") => ({ id, criterion: id, status, evidence: "" })
    expect(withEarlier([r("CA1", "pass"), r("CA2", "fail")], [r("CA2", "pass"), r("N1", "pass")]).map(x => `${x.id}:${x.status}`)).toEqual(["CA1:pass", "CA2:pass", "N1:pass"])
  })
})

describe("node and pnpm for a release's scripts", () => {
  it("nvm's default version, else the newest; pnpm's folder; only what is there", () => {
    const tree: Record<string, string[]> = { "/h/.nvm/versions/node": ["v20.19.5", "v22.9.0", "v22.23.4", "v18.1.0"], "/h/.nvm/versions/node/v22.23.4/bin": ["node"], "/h/.nvm/versions/node/v20.19.5/bin": ["node"], "/h/Library/pnpm": ["pnpm"] }
    expect(toolDirs("/h", d => tree[d] ?? [], () => "22")).toEqual(["/h/.nvm/versions/node/v22.23.4/bin", "/h/Library/pnpm"])
    expect(toolDirs("/h", d => tree[d] ?? [], () => "20")).toEqual(["/h/.nvm/versions/node/v20.19.5/bin", "/h/Library/pnpm"])
    expect(toolDirs("/h", () => [], () => "")).toEqual([])
  })
})

describe("what a fix leaves for staging", () => {
  it("a build's scripts join the plan's; staging runs again from a test that has something pending", () => {
    const x = (id: string, title: string) => ({ id, unit: null, title, command: "c", when: "", envs: [] })
    expect(withScripts([x("S1", "a"), x("S2", "old")], [x("S2", "new")]).map(s => `${s.id}:${s.title}`)).toEqual(["S1:a", "S2:new"])
    const tested = { ...base, stage: "test" as const, results: [{ id: "CA3", criterion: "c", status: "fail" as const, evidence: "" }] }
    expect(stageToRun(tested, "staging", ["staging"])).toBe("staging")
    expect(() => stageToRun(tested, "staging", [])).toThrow()
  })
})

describe("what an environment ran, release after release", () => {
  it("keeps a script you skipped, so it is not offered again", () => {
    const step = (id: string, kind: string, status: string) => ({ id, kind, status, script: kind === "execute" ? "S1" : null, unit: "U1", sha: null }) as never
    const kept = shippedWith({ env: "staging", steps: [step("R1", "merge", "done"), step("R2", "execute", "skipped"), step("R3", "simulate", "skipped")] }, { env: "staging", steps: [] })
    expect(kept.steps.map((s: { id: string }) => s.id)).toEqual(["R1", "R2"])
  })
})
