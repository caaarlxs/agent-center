import { describe, expect, it } from "bun:test"
import { prStateOf, prStates, scenarioOf } from "../lib/stage-extras"

describe("prStateOf", () => {
  it("counts what people said after its last commit, on an open PR", () => {
    const pr = { state: "OPEN", isDraft: false, mergeable: "MERGEABLE", commits: [{ committedDate: "2026-11-17T10:00:00Z" }],
      comments: [{ body: "old", createdAt: "2026-11-16T10:00:00Z" }, { body: "Cambia el glosario", createdAt: "2026-11-20T08:52:55Z" }], reviews: [{ body: "", submittedAt: "2026-11-20T09:00:00Z" }, { body: "LGTM", submittedAt: "2026-11-20T09:10:00Z" }] }
    expect(prStateOf(pr)).toEqual({ state: "OPEN", isDraft: false, isConflicting: false, comments: 2 })
  })
  it("says merged, open, a draft and with conflicts", () => {
    expect(prStateOf({ state: "MERGED", isDraft: false, mergeStateStatus: "UNKNOWN" })).toEqual({ state: "MERGED", isDraft: false, isConflicting: false })
    expect(prStateOf({ state: "OPEN", isDraft: true, mergeStateStatus: "DIRTY" })).toEqual({ state: "OPEN", isDraft: true, isConflicting: true })
    expect(prStateOf({ state: "OPEN", mergeable: "CONFLICTING" })!.isConflicting).toBe(true)
    expect(prStateOf(null)).toBeNull()
    expect(prStateOf({ state: "WAT" })).toBeNull()
  })
})

describe("prStates", () => {
  it("reads an open PR again after two minutes, a merged one never", async () => {
    let calls = 0
    const sh = async (cmd: string[]) => (calls++, { ok: true, out: JSON.stringify({ state: cmd[3]!.endsWith("/1") ? "MERGED" : "OPEN", isDraft: false }) })
    const urls = ["https://github.com/o/r/pull/1", "https://github.com/o/r/pull/2"]
    expect(Object.values(await prStates(urls, sh, 1_000)).map(p => p.state)).toEqual(["MERGED", "OPEN"])
    await prStates(urls, sh, 60_000)
    expect(calls).toBe(2)
    await prStates(urls, sh, 200_000)
    expect(calls).toBe(3)
  })
  it("leaves out a PR GitHub does not answer for", async () => {
    expect(await prStates(["https://github.com/o/r/pull/9"], async () => ({ ok: false, out: "" }), 0)).toEqual({})
  })
})

describe("scenarioOf", () => {
  it("names the accounts used and what the test made", () => {
    const raw = { accounts: { company: ["language-es"], advisor: [] }, pieces: [{ id: "empPaneles", model: "company", vars: { name: "Empresa Paneles {n} SL" } }, { model: "x" }] }
    expect(scenarioOf(raw)).toEqual({ accounts: ["company: language-es", "advisor"], pieces: [{ id: "empPaneles", model: "company", name: "Empresa Paneles {n} SL" }] })
    expect(scenarioOf(null)).toBeNull()
  })
})
