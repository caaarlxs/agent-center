import { describe, expect, it } from "bun:test"
import { jobPrompt, nextJobId, prRef, ticketFromPrs, unitsOfPrs, validJob, type PrInfo } from "../lib/jobs"

const pr = (n: number, extra: Partial<PrInfo> = {}): PrInfo => ({ url: `https://github.com/acme/web/pull/${n}`, repo: "web", number: n, title: `PR ${n}`, head: `feat/x-${n}`, base: "master", body: "", worktree: null, ...extra })

describe("prRef", () => {
  it("reads the owner, repo and number of a PR's address, with or without what follows", () => {
    expect(prRef("https://github.com/acme/web/pull/12")).toEqual({ url: "https://github.com/acme/web/pull/12", owner: "acme", repo: "web", number: 12 })
    expect(prRef(" https://github.com/acme/web/pull/12/files?x=1 ")).toEqual({ url: "https://github.com/acme/web/pull/12", owner: "acme", repo: "web", number: 12 })
    expect(prRef("https://github.com/acme/web/issues/12")).toBeNull()
    expect(prRef("PP-12")).toBeNull()
  })
})

describe("validJob", () => {
  it("every specialist needs the ticket; the reviewer, the PRs or the ticket", () => {
    expect(validJob("plan", { ticket: null, prs: [] })).toBe("Plan needs a ticket")
    expect(validJob("plan", { ticket: "PP-1", prs: [] })).toBeNull()
    expect(validJob("review", { ticket: null, prs: [] })).toBe("Review needs the PRs or a ticket")
    expect(validJob("review", { ticket: null, prs: ["https://github.com/acme/web/pull/1"] })).toBeNull()
    expect(validJob("review", { ticket: "PP-1", prs: [] })).toBeNull()
  })
  it("says which address is not a PR", () => {
    expect(validJob("review", { ticket: null, prs: ["https://github.com/acme/web/pull/1", "nope"] })).toBe("Not a PR: nope")
  })
  it("a ticket key is a ticket key", () => {
    expect(validJob("plan", { ticket: "pp 1", prs: [] })).toBe("Not a ticket key: pp 1")
  })
})

describe("nextJobId", () => {
  it("numbers the jobs one after the other, from the highest", () => {
    expect(nextJobId([])).toBe("JOB-1")
    expect(nextJobId(["JOB-3", "JOB-10", "x", "JOB-2.old-1"])).toBe("JOB-11")
  })
})

describe("ticketFromPrs", () => {
  it("takes the ticket the PRs name, in their title, branch or text, of your projects", () => {
    expect(ticketFromPrs([pr(1, { title: "Fix UTF-8 parsing", head: "feat/PP-2774-teaser" })], ["PP"])).toBe("PP-2774")
    expect(ticketFromPrs([pr(1), pr(2, { body: "Closes PP-9" })], ["PP"])).toBe("PP-9")
    expect(ticketFromPrs([pr(1)], ["PP"])).toBeNull()
  })
})

describe("unitsOfPrs", () => {
  it("each PR is a unit, so the findings say which PR they are in", () => {
    expect(unitsOfPrs([pr(4, { title: "Teaser" })])).toEqual([{ id: "U1", repo: "web", subtask: null, subtasks: [], branch: "feat/x-4", title: "Teaser", dependsOn: [], status: "done", pr: "https://github.com/acme/web/pull/4" }])
  })
})

describe("jobPrompt", () => {
  it("tells the session apart from yours, as the pipeline's are", () => {
    expect(jobPrompt("review", "JOB-3", "/d", { ticket: "PP-1", prs: [pr(1)] }).startsWith("[Pipeline] JOB-3 · revisar")).toBe(true)
  })
  it("with a ticket, the reviewer judges the PRs against it", () => {
    const text = jobPrompt("review", "JOB-3", "/d", { ticket: "PP-1", prs: [pr(1)] })
    expect(text).toContain("/d/ticket.md")
    expect(text).toContain("/d/prs.json")
    expect(text).not.toContain("No hay ticket")
  })
  it("without one, it reviews the code alone, and says so", () => {
    expect(jobPrompt("review", "JOB-3", "/d", { ticket: null, prs: [pr(1)] })).toContain("No hay ticket")
  })
})

describe("every specialist", () => {
  const job = (done = {}) => ({ ticket: "PP-1", prs: [], done })
  it("reads the ticket with its children, and writes only its files; the builder, its PRs as drafts", () => {
    for (const stage of ["refine", "plan", "test", "smoke"] as const) {
      const text = jobPrompt(stage, "JOB-2", "/d", job())
      expect(text).toContain("/d/ticket.md")
      expect(text).toContain("No escribas en Jira, en GitHub ni en los repos")
    }
    expect(jobPrompt("build", "JOB-2", "/d", job())).toContain("Abre cada PR como borrador; nunca mergees ni despliegues")
  })
  it("takes what the pipeline already did of the ticket; without it, it does that first", () => {
    expect(jobPrompt("plan", "JOB-2", "/d", job({ "refine.md": "/p/PP-1/refine.md" }))).toContain("/p/PP-1/refine.md: úsalo")
    expect(jobPrompt("plan", "JOB-2", "/d", job())).toContain("No hay refinamiento")
    expect(jobPrompt("build", "JOB-2", "/d", job({ "plan.json": "/p/PP-1/plan.json" }))).toContain("/p/PP-1/plan.json: síguelo")
    expect(jobPrompt("build", "JOB-2", "/d", job())).toContain("No hay plan: haz primero uno")
  })
  it("the tester stays in staging; the prod checker only reads", () => {
    expect(jobPrompt("test", "JOB-2", "/d", job())).toContain("Solo staging")
    expect(jobPrompt("smoke", "JOB-2", "/d", job())).toContain("Solo lectura")
  })
})
