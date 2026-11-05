import { describe, expect, it } from "vitest"
import { SPECIALISTS, clampSplit, jobColumn, jobLabel, parseJobInput } from "./jobs-board"

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
