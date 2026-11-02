import { describe, expect, it } from "vitest"
import type { Card } from "@/lib/api-types"
import { nextSteps, type WorkState } from "./next-steps"

const state = (s: Partial<WorkState> = {}): WorkState => ({ branch: "fix/x", base: "main", uncommitted: 0, unpushed: 0, ahead: 0, ...s })
const pr = (p: Partial<Card["prs"][number]> = {}) => ({ number: 48, title: "", url: "u", state: "OPEN", isDraft: false, reviewDecision: null, checks: "pass", ...p }) as Card["prs"][number]
const labels = (s: ReturnType<typeof nextSteps>) => s.map(x => x.label)

describe("nextSteps", () => {
  it("commits what is not committed, or pushes what is not pushed", () => {
    expect(labels(nextSteps(state({ uncommitted: 3, unpushed: 2 }), null))).toEqual(["Review the changes", "Commit"])
    expect(labels(nextSteps(state({ unpushed: 2 }), null))).toEqual(["Push"])
  })
  it("opens a PR for a branch with commits of its own and none open", () => {
    expect(labels(nextSteps(state({ ahead: 2 }), null))).toEqual(["Open a PR"])
    expect(labels(nextSteps(state({ ahead: 2, branch: "main" }), null))).toEqual([])
  })
  it("fixes a PR's failing checks, or reviews a PR that is ready", () => {
    expect(labels(nextSteps(state({ ahead: 2 }), pr({ checks: "fail" })))).toEqual(["Fix the checks"])
    expect(labels(nextSteps(state({ ahead: 2 }), pr()))).toEqual(["Review PR #48"])
    expect(labels(nextSteps(state({ ahead: 2 }), pr({ isDraft: true })))).toEqual([])
  })
  it("says nothing without a repository", () => {
    expect(nextSteps(null, null)).toEqual([])
  })
})
