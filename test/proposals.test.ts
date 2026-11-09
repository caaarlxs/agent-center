import { describe, expect, it } from "bun:test"
import { anchorOf, newDescription, proposalsIn, ticketsOfYours, withProposals, type Proposal } from "../lib/proposals"

const p = (extra: Partial<Proposal> = {}): Proposal => ({ id: "R1-T1", kind: "bug", summary: "El owner no se actualiza", description: "D", why: "W", linkTo: null, status: "proposed", ...extra })

describe("proposalsIn", () => {
  it("reads what the agent proposes, numbered by its run, and leaves out what has no title", () => {
    const out = proposalsIn([{ kind: "bug", summary: " A ", description: "d", why: "w", linkTo: "PP-3" }, { summary: "" }, { kind: "epic", summary: "B", linkTo: "nope" }], 4)
    expect(out).toEqual([
      { id: "R4-T1", kind: "bug", summary: "A", description: "d", why: "w", linkTo: "PP-3", status: "proposed" },
      { id: "R4-T2", kind: "task", summary: "B", description: "", why: "", linkTo: null, status: "proposed" },
    ])
    expect(proposalsIn(undefined, 1)).toEqual([])
  })
})

describe("withProposals", () => {
  it("keeps the ones of before as they are, and adds only the new titles", () => {
    const before = [p({ status: "created", created: "PP-9" })]
    const out = withProposals(before, [p({ id: "R2-T1", summary: "el owner  NO se actualiza" }), p({ id: "R2-T2", summary: "Otro" })])
    expect(out.map(x => [x.id, x.status])).toEqual([["R1-T1", "created"], ["R2-T2", "proposed"]])
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
