import { describe, expect, it } from "bun:test"
import { DEFAULT_CONFIG } from "../lib/release"
import { chatPrompt, partIn, partPrompt, stepsForYou, stepsHash } from "../lib/your-part"

const note = { why: "Meta approves every template", how: [], done: null, check: null }
const order = [
  { kind: "manual", id: null, text: "Ask Meta for the templates", envs: ["staging"], note },
  { kind: "manual", id: null, text: "Turn the flag on", envs: ["staging", "prod"] },
  { kind: "unit", id: "U1", text: null, envs: [] },
]
const unit = { id: "U1", repo: "mobile-app", subtask: null, branch: "feat/U1", title: "U1", dependsOn: [], status: "done", pr: "https://github.com/acme/mobile-app/pull/9" }
const config = { ...DEFAULT_CONFIG, repos: { "mobile-app": { staging: "manual:Publish the app", prod: "manual:Publish the app" } } }
const state = { key: "PP-1", stage: "review", status: "ready", units: [unit], scripts: [], order } as never

describe("stepsForYou", () => {
  it("lists each step a person does once, with the environments it goes to: the plan's with their id and note, a repo's own too", () => {
    expect(stepsForYou(state, config as never)).toEqual([
      { id: "M1", text: "Ask Meta for the templates", envs: ["staging"], note: { id: "M1", ...note } },
      { id: "M2", text: "Turn the flag on", envs: ["staging", "prod"], note: { id: "M2", why: null, how: [], done: null, check: null } },
      { id: null, text: "mobile-app: Publish the app", envs: ["staging", "prod"], note: null },
    ])
  })
  it("tells, by its hash, when the plan changed the steps", () => {
    const steps = stepsForYou(state, config as never)
    expect(stepsHash(steps)).toBe(stepsHash(stepsForYou(state, config as never)))
    expect(stepsHash(steps.slice(1))).not.toBe(stepsHash(steps))
  })
})

describe("the guide", () => {
  it("asks for every step by its id, with the plan's why, and for what to copy in full", () => {
    const text = partPrompt("[Pipeline]", "PP-1", "/d/PP-1", stepsForYou(state, config as never), "/d/PP-1/out.json", "Ana Ruiz")
    expect(text.startsWith("[Pipeline] PP-1 · tu parte")).toBe(true)
    expect(text).toContain("- M1 [staging] «Ask Meta for the templates». Por qué, según el plan: Meta approves every template")
    expect(text).toContain("- — [staging, prod] «mobile-app: Publish the app».")
    expect(text).toContain("el texto entero")
  })
  it("speaks to its reader, the person the plan may name: never sends them to ask themselves", () => {
    const text = partPrompt("[Pipeline]", "PP-1", "/d/PP-1", [], "/o.json", "Ana Ruiz")
    expect(text).toContain("La lee Ana Ruiz, que hace estos pasos: háblale de tú.")
    expect(text).toContain("nunca le digas que pregunte, pida o avise a Ana.")
    expect(partPrompt("[Pipeline]", "PP-1", "/d/PP-1", [], "/o.json", null)).not.toContain("La lee")
  })
  it("keeps the sections with a title and steps, and only links that are URLs", () => {
    const part = partIn({ intro: " It changes x ", sections: [
      { step: "M1", title: "Ask Meta", when: "Now", context: "c", where: [{ label: "Meta", url: "https://business.facebook.com" }, { label: "x", url: "nowhere" }], steps: ["One", ""], done: "d", unlocks: "u" },
      { step: null, title: "No steps", steps: [] },
    ] }, "h", 5)
    expect(part).toEqual({ from: "h", at: 5, intro: "It changes x", sections: [{ step: "M1", title: "Ask Meta", when: "Now", context: "c", where: [{ label: "Meta", url: "https://business.facebook.com" }], steps: ["One"], done: "d", unlocks: "u" }] })
    expect(partIn({ sections: [] }, "h", 5)).toBeNull()
    expect(partIn(null, "h", 5)).toBeNull()
  })
})

describe("chatPrompt", () => {
  it("opens a chat of yours (no pipeline tag) on the step, pointing at the guide and the context", () => {
    const text = chatPrompt("PP-1", "/d/PP-1", { step: "M1", title: "Ask Meta" }, "Ask Meta for the templates")
    expect(text.startsWith("PP-1 · Tu parte: Ask Meta")).toBe(true)
    expect(text).toContain("«Ask Meta for the templates»")
    expect(text).toContain("/d/PP-1/your-part.json (sección del paso M1)")
  })
})

describe("the guide's steps, as done as they can be", () => {
  const prompt = partPrompt("[Pipeline]", "PP-1", "/d/PP-1", [{ id: "M1", text: "Crear la fila en el Finder", envs: ["prod"], note: null }] as never, "/d/PP-1/your-part.draft.json", null)
  it("asks for commands ready to paste and the whole text of a message; a step the build scripted is the board's to run", () => {
    expect(prompt).toContain("comando listo para pegar")
    expect(prompt).toContain("/d/PP-1/steps/<id del paso>.sh, ese paso lo hace el board")
    expect(prompt).toContain("el texto entero del mensaje")
  })
  it("still lets it write only the guide, and run nothing", () => {
    expect(prompt).toContain("Solo lee: no cambies nada más que /d/PP-1/your-part.draft.json. Nunca ejecutes nada contra un entorno.")
  })
})

