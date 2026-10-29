// Each check and each reviewer of a PR, as GitHub gives them (lib/github.ts).
import { describe, expect, it } from "bun:test"
import { checkOf, reviewersOf } from "../lib/github"

describe("checkOf", () => {
  it("reads a check run, with its log and how long it took", () => {
    expect(checkOf({ name: "Unit tests", conclusion: "SUCCESS", detailsUrl: "u", startedAt: "2026-10-29T13:32:44Z", completedAt: "2026-10-29T13:33:28Z" }))
      .toEqual({ name: "Unit tests", state: "pass", url: "u", seconds: 44 })
  })
  it("reads a status context still running", () => {
    expect(checkOf({ context: "ci/x", state: "PENDING", targetUrl: "t" })).toEqual({ name: "ci/x", state: "pending", url: "t", seconds: null })
  })
  it("tells failed and skipped apart", () => {
    expect(checkOf({ name: "a", conclusion: "TIMED_OUT" }).state).toBe("fail")
    expect(checkOf({ name: "b", conclusion: "SKIPPED" }).state).toBe("skip")
  })
})

describe("reviewersOf", () => {
  it("keeps each reviewer's last word and adds who is still asked", () => {
    const latest = [{ author: { login: "ana" }, state: "APPROVED" }, { author: { login: "bo" }, state: "DISMISSED" }]
    const requested = [{ login: "bo" }, { name: "Backend", slug: "backend" }]
    expect(reviewersOf(latest, requested)).toEqual([
      { login: "ana", state: "APPROVED" },
      { login: "bo", state: "PENDING" },
      { login: "backend", state: "PENDING" },
    ])
  })
})
