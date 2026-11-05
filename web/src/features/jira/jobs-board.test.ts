import { describe, expect, it } from "vitest"
import { SPECIALISTS, addToDraft, canSendDraft, draftProblem, clampSplit, jobColumn, jobLabel, jobToSend, parseJobInput, sendText } from "./jobs-board"

const job = (extra = {}) => ({ id: "JOB-1", stage: "review", ticket: null, prs: [{ url: "https://github.com/o/web/pull/4", repo: "web", number: 4 }], ...extra }) as never

describe("the specialists", () => {
  it("one a column of the pipeline, in its order: the test in Staging, the check in Prod", () => {
    expect(SPECIALISTS.map(s => s.stage)).toEqual(["refine", "plan", "build", "review", "test", "smoke"])
    expect(jobColumn(job())).toBe(3)
    expect(jobColumn(job({ stage: "test" }))).toBe(4)
  })
})

describe("jobLabel", () => {
  it("names a job by its ticket, else its PR, else how many PRs", () => {
    expect(jobLabel(job({ ticket: "PP-7" }))).toBe("PP-7")
    expect(jobLabel(job())).toBe("web #4")
    expect(jobLabel(job({ prs: [{ repo: "a", number: 1 }, { repo: "b", number: 2 }] }))).toBe("2 PRs")
  })
})

describe("parseJobInput", () => {
  it("takes a ticket key and PR links from what you paste, in any order", () => {
    expect(parseJobInput("pp-2774 https://github.com/o/web/pull/4\nhttps://github.com/o/api/pull/9/files")).toEqual({
      ticket: "PP-2774", prs: ["https://github.com/o/web/pull/4", "https://github.com/o/api/pull/9"], error: null,
    })
  })
  it("a ticket's link is its key", () => {
    expect(parseJobInput("https://deale.atlassian.net/browse/PP-12").ticket).toBe("PP-12")
  })
  it("one ticket a job", () => {
    expect(parseJobInput("PP-1 PP-2").error).toBe("One ticket a job")
  })
  it("says what it did not understand", () => {
    expect(parseJobInput("PP-1 hola").error).toBe("Not a ticket or a PR: hola")
  })
  it("only the reviewer takes PRs", () => {
    expect(parseJobInput("https://github.com/o/web/pull/4", false).error).toBe("This one takes a ticket")
  })
})

describe("clampSplit", () => {
  it("keeps both halves in sight", () => {
    expect(clampSplit(0.05)).toBe(0.2)
    expect(clampSplit(0.95)).toBe(0.85)
    expect(clampSplit(Number.NaN)).toBe(0.62)
  })
})

describe("a job you write", () => {
  const empty = { ticket: null, prs: [] }
  it("what you paste joins what is there; a new ticket takes the old one's place", () => {
    const one = addToDraft(empty, "PP-1 https://github.com/o/web/pull/4", true)
    expect(one).toEqual({ draft: { ticket: "PP-1", prs: ["https://github.com/o/web/pull/4"] }, error: null })
    expect(addToDraft(one.draft, "https://github.com/o/web/pull/4 https://github.com/o/api/pull/9 PP-2", true).draft).toEqual({ ticket: "PP-2", prs: ["https://github.com/o/web/pull/4", "https://github.com/o/api/pull/9"] })
  })
  it("what it does not understand stays out, and it says why", () => {
    expect(addToDraft({ ticket: "PP-1", prs: [] }, "hola", true)).toEqual({ draft: { ticket: "PP-1", prs: [] }, error: "Not a ticket or a PR: hola" })
  })
  it("sends the ticket (yours, or the one the PRs name) and the PRs you left ticked", () => {
    const resolved = { ticket: { key: "PP-1", summary: "x", isNamed: true }, prs: [{ url: "a", repo: "web", number: 1, title: "", isFound: false }, { url: "b", repo: "api", number: 2, title: "", isFound: true }], error: null }
    expect(jobToSend({ ticket: null, prs: ["a"] }, resolved, ["b"])).toEqual({ ticket: "PP-1", prs: ["a"] })
    expect(jobToSend({ ticket: "PP-1", prs: [] }, null, [])).toEqual({ ticket: "PP-1", prs: [] })
  })
  it("the reviewer's button says how many PRs it reviews", () => {
    expect(sendText("review", 1)).toBe("Review 1 PR")
    expect(sendText("review", 3)).toBe("Review 3 PRs")
    expect(sendText("plan", 0)).toBe("Send")
  })
})

describe("what stops a job", () => {
  const found = (prs: number, error: string | null = null) => ({ ticket: { key: "PP-1", summary: "", isNamed: false }, prs: Array.from({ length: prs }, (_, i) => ({ url: `u${i}`, repo: "web", number: i, title: "", isFound: true })), error })
  it("says what you pasted wrong, what the lookup found wrong, or that no PR names the ticket", () => {
    expect(draftProblem("Not a ticket or a PR: x", null, true)).toBe("Not a ticket or a PR: x")
    expect(draftProblem(null, found(1, "PP-9 is not in Jira"), true)).toBe("PP-9 is not in Jira")
    expect(draftProblem(null, found(0), true)).toBe("No open PR names PP-1")
    expect(draftProblem(null, found(0), false)).toBeNull()
  })
  it("goes once looked up, with PRs for the reviewer and a ticket for the rest", () => {
    expect(canSendDraft({ ticket: "PP-1", prs: ["u0"] }, found(1), false, true)).toBe(true)
    expect(canSendDraft({ ticket: "PP-1", prs: ["u0"] }, found(1), true, true)).toBe(false)
    expect(canSendDraft({ ticket: "PP-1", prs: [] }, found(1), false, true)).toBe(false)
    expect(canSendDraft({ ticket: "PP-1", prs: [] }, found(0), false, false)).toBe(true)
  })
})
