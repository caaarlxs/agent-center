import { describe, expect, it } from "bun:test"
import { anchorOf, decidedForAgent, newDescription, proposalsIn, ticketsOfYours, waitsOn, withProposals, type Proposal } from "../lib/proposals"

const p = (extra: Partial<Proposal> = {}): Proposal => ({ id: "R1-T1", kind: "bug", summary: "El owner no se actualiza", description: "D", why: "W", linkTo: null, status: "proposed", ...extra })

describe("proposalsIn", () => {
  it("reads what the agent proposes, numbered by its run, and leaves out what has no title", () => {
    const out = proposalsIn([{ kind: "bug", summary: " A ", description: "d", why: "w", linkTo: "PP-3", question: "Q7" }, { summary: "" }, { kind: "epic", summary: "B", linkTo: "nope", question: "7" }], 4, "refine")
    expect(out).toEqual([
      { id: "R4-T1", kind: "bug", summary: "A", description: "d", why: "w", linkTo: "PP-3", question: "Q7", stage: "refine", status: "proposed" },
      { id: "R4-T2", kind: "task", summary: "B", description: "", why: "", linkTo: null, question: null, stage: "refine", status: "proposed" },
    ])
    expect(proposalsIn(undefined, 1, "refine")).toEqual([])
  })
})

describe("withProposals", () => {
  it("keeps what you created or dismissed; the stage's pending ones give way to what it proposes now", () => {
    const before = [p({ status: "created", created: "PP-9" }), p({ id: "R1-T2", summary: "Ya no hace falta", stage: "refine" }), p({ id: "R1-T3", summary: "Descartado", status: "dismissed" })]
    const out = withProposals(before, [p({ id: "R2-T1", summary: "el owner  NO se actualiza" }), p({ id: "R2-T2", summary: "descartado" }), p({ id: "R2-T3", summary: "Otro" })], "refine")
    expect(out.map(x => [x.id, x.status])).toEqual([["R1-T1", "created"], ["R1-T3", "dismissed"], ["R2-T3", "proposed"]])
  })
  it("a run of another stage leaves the pending ones of this one", () => {
    const before = [p({ id: "R1-T1", stage: "refine" })]
    expect(withProposals(before, [p({ id: "R3-T1", summary: "Del plan", stage: "plan" })], "plan").map(x => x.id)).toEqual(["R1-T1", "R3-T1"])
  })
})

describe("a ticket that depends on an answer", () => {
  it("waits while its question is open", () => {
    expect(waitsOn(p({ question: "Q7" }), ["Q6", "Q7"])).toBe(true)
    expect(waitsOn(p({ question: "Q7" }), [])).toBe(false)
    expect(waitsOn(p(), ["Q7"])).toBe(false)
  })
  it("the agent reads only what you decided", () => {
    expect(decidedForAgent([p(), p({ status: "created", created: "PP-9" }), p({ status: "dismissed", summary: "X" })])).toEqual([
      { summary: "El owner no se actualiza", kind: "bug", status: "created", key: "PP-9" },
      { summary: "X", kind: "bug", status: "dismissed", key: null },
    ])
  })
})

describe("where a new ticket goes", () => {
  it("with a ticket of yours: the agent's choice if it is yours, else the first of yours", () => {
    const epic = { key: "PP-1", local: true, children: [{ key: "PP-2" }, { key: "PP-3" }] }
    expect(ticketsOfYours(epic)).toEqual(["PP-2", "PP-3"])
    expect(ticketsOfYours({ key: "PP-5" })).toEqual(["PP-5"])
    expect(anchorOf(p({ linkTo: "PP-3" }), ticketsOfYours(epic))).toBe("PP-3")
    expect(anchorOf(p({ linkTo: "PP-1" }), ticketsOfYours(epic))).toBe("PP-2")
    expect(anchorOf(p(), [])).toBeNull()
  })
  it("says why it goes apart and where it comes from", () => {
    expect(newDescription(p(), "PP-2815")).toBe("D\n\nPor qué va aparte: W\n\nPropuesto por el agente al trabajar en PP-2815.")
  })
})
