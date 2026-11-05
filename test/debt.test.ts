import { describe, expect, it } from "bun:test"
import { debtIn, keyOf, merged, ticketOf, type DebtItem } from "../lib/debt"

const item = (extra = {}) => ({ rule: "BE-12", repo: "deal-service", file: "src/lambdas/list.py", line: 40, note: "Lee la tabla sin paginar", severity: "major", kind: "debt", ...extra }) as DebtItem

describe("debtIn", () => {
  it("reads what a stage saw and did not touch, dropping what has no repo, file or note", () => {
    expect(debtIn([item(), { repo: "x" }, item({ severity: "huge", rule: "" })])).toEqual([
      item(),
      { ...item(), rule: null, severity: "minor" },
    ])
  })
})

describe("merged", () => {
  const now = 1_000
  it("adds what is new, once per repo, file and rule, with the ticket it came from", () => {
    const reg = merged([], [item(), item({ line: 41 })], "PP-1", now)
    expect(reg).toHaveLength(1)
    expect(reg[0]).toMatchObject({ key: keyOf(item()), tickets: ["PP-1"], firstSeen: now, lastSeen: now, status: "open" })
  })
  it("keeps what was there, and notes each ticket that sees it again", () => {
    const once = merged([], [item()], "PP-1", now)
    const twice = merged(once, [item({ severity: "blocker" })], "PP-2", now + 5)
    expect(twice[0]).toMatchObject({ tickets: ["PP-1", "PP-2"], firstSeen: now, lastSeen: now + 5, severity: "blocker" })
  })
  it("tells apart two points with no rule by what they say", () => {
    expect(merged([], [item({ rule: null }), item({ rule: null, note: "Otra cosa" })], "PP-1", now)).toHaveLength(2)
  })
  it("leaves alone what was turned into a ticket or dismissed", () => {
    const done = merged([], [item()], "PP-1", now).map(e => ({ ...e, status: "ticketed" as const, jira: "PP-9" }))
    expect(merged(done, [item()], "PP-2", now + 1)[0]).toMatchObject({ status: "ticketed", jira: "PP-9", tickets: ["PP-1", "PP-2"] })
  })
})

describe("ticketOf", () => {
  it("writes one Jira ticket for the points chosen: a title by repo and rule, and each point with where it is and who saw it", () => {
    const reg = merged([], [item(), item({ file: "src/helpers/q.py", line: 7 })], "PP-1", 0)
    const t = ticketOf(reg)
    expect(t.summary).toBe("Deuda: deal-service, BE-12 (2 puntos)")
    expect(t.description).toContain("- `src/lambdas/list.py:40` (major, BE-12): Lee la tabla sin paginar. Visto en PP-1")
    expect(t.description).toContain("src/helpers/q.py:7")
  })
})

describe("improvements", () => {
  it("keeps a proposal apart from debt: nothing was done wrong, the team's tools could be better", () => {
    const proposal = item({ kind: "improvement", rule: "BE-19", note: "Añadir batch_get_all a core-lib", file: "src/helpers/batch.py" })
    const [read] = debtIn([proposal])
    expect(read!.kind).toBe("improvement")
    expect(debtIn([item()])[0]!.kind).toBe("debt")
    expect(merged([], [item(), proposal], "PP-1", 0).map(e => e.kind).sort()).toEqual(["debt", "improvement"])
  })
  it("names the Jira ticket by what it holds", () => {
    const reg = merged([], [item({ kind: "improvement", note: "Añadir batch_get_all a core-lib" })], "PP-1", 0)
    expect(ticketOf(reg).summary).toBe("Mejora: deal-service, BE-12 (1 punto)")
  })
})
