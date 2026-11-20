import { describe, expect, it } from "bun:test"
import { commentsOf } from "../lib/github"

describe("commentsOf", () => {
  it("keeps open review threads, reviews that ask for changes, and what was said after the last commit", () => {
    const pr = {
      commits: { nodes: [{ commit: { committedDate: "2026-11-17T10:00:00Z" } }] },
      reviewThreads: { nodes: [
        { isResolved: false, path: "a.ts", comments: { nodes: [{ author: { login: "ana" }, body: "Renombra esto", url: "u1" }, { author: { login: "carlos" }, body: "Ok" }] } },
        { isResolved: true, path: "b.ts", comments: { nodes: [{ author: { login: "ana" }, body: "Hecho" }] } },
      ] },
      reviews: { nodes: [
        { state: "CHANGES_REQUESTED", body: "Falta el test", url: "u2", submittedAt: "2026-11-16T10:00:00Z", author: { login: "luis" } },
        { state: "APPROVED", body: "LGTM", url: "u3", submittedAt: "2026-11-20T10:00:00Z", author: { login: "ana" } },
        { state: "COMMENTED", body: "viejo", submittedAt: "2026-11-15T10:00:00Z", author: { login: "ana" } },
      ] },
      comments: { nodes: [{ body: "Glosario", url: "u4", createdAt: "2026-11-20T08:52:55Z", author: { login: "moramaan" } }, { body: "antes", createdAt: "2026-11-10T08:00:00Z", author: { login: "x" } }] },
    }
    expect(commentsOf(pr).map(c => [c.author, c.body, c.path])).toEqual([
      ["ana", "Renombra esto\n@carlos: Ok", "a.ts"], ["luis", "Falta el test", null], ["ana", "LGTM", null], ["moramaan", "Glosario", null],
    ])
  })
})
