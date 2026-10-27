import { describe, expect, it } from "vitest"
import type { PrDetail } from "@/lib/api-types"
import { mergeState, readinessRows } from "./readiness"

const pr = (o: Partial<PrDetail> = {}) =>
  ({ number: 7, url: "https://github.com/o/r/pull/7", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: "pass", failing: [], pending: [], reviewDecision: null, baseRefName: "main", ...o }) as unknown as PrDetail

describe("mergeState", () => {
  it("reads GitHub's state", () => {
    expect(mergeState(pr())).toMatchObject({ text: "Ready to merge", canMerge: true })
    expect(mergeState(pr({ isDraft: true }))).toMatchObject({ canMerge: false })
    expect(mergeState(pr({ mergeable: "CONFLICTING" }))).toMatchObject({ text: "Has conflicts with the base branch", canMerge: false })
    expect(mergeState(pr({ mergeStateStatus: "BEHIND" }))).toMatchObject({ text: "Out of date with the base branch", tone: "ask" })
    expect(mergeState(pr({ mergeStateStatus: "UNKNOWN" }))).toMatchObject({ tone: "muted", canMerge: true })
  })
})

describe("readinessRows", () => {
  it("lists what blocks, with a message to fix it", () => {
    const rows = readinessRows(pr({ checks: "fail", failing: ["lint", "test"], mergeable: "CONFLICTING" }), { threads: [], local: { uncommitted: 2, unpushed: 1 }, tasks: [] })
    expect(rows.filter(r => r.tone === "bad").map(r => r.text)).toEqual([
      "2 failing checks: lint, test",
      "In the session's folder: 2 uncommitted files and 1 unpushed commit",
      "Conflicts with main",
    ])
    expect(rows[0].ask?.text).toContain("gh pr checks 7")
  })
  it("says all is fine", () => {
    const rows = readinessRows(pr({ reviewDecision: "APPROVED" }), { threads: [], local: { uncommitted: 0, unpushed: 0 } })
    expect(rows.map(r => r.tone)).toEqual(["ok", "ok", "ok", "ok"])
  })
  it("quotes unresolved comments", () => {
    const rows = readinessRows(pr(), { threads: [{ path: "a.ts", line: 3, isOutdated: false, author: "bo", body: "fix\nthis" }] })
    expect(rows[2].ask?.text).toContain("1. `a.ts:3` — @bo:\n   fix\n   this")
  })
})
