import { describe, expect, it } from "vitest"
import { mergeOf, placesOf } from "./refs"

describe("placesOf", () => {
  it("shows a branch once, here, online or both, the current one first", () => {
    const shown = placesOf([
      { name: "origin/feat/x", kind: "remote" }, { name: "feat/x", kind: "branch" },
      { name: "origin/main", kind: "remote" }, { name: "fix/y", kind: "head" }, { name: "v1.0", kind: "tag" },
    ])
    expect(shown.branches).toEqual([
      { name: "fix/y", isHere: true, isOnline: false, isCurrent: true },
      { name: "feat/x", isHere: true, isOnline: true, isCurrent: false },
      { name: "main", isHere: false, isOnline: true, isCurrent: false },
    ])
    expect(shown.tags).toEqual(["v1.0"])
  })
})

describe("mergeOf", () => {
  it("reads a pull request and a branch merge", () => {
    expect(mergeOf("Merge pull request #127 from deale-org/fix/informa-events-getitem-iam")).toEqual({ pr: 127, from: "fix/informa-events-getitem-iam", into: null })
    expect(mergeOf("Merge remote-tracking branch 'origin/feat/gpt-gen' into feat/gpt-fields")).toEqual({ pr: null, from: "feat/gpt-gen", into: "feat/gpt-fields" })
    expect(mergeOf("Merge branch 'main' of github.com:o/r")).toEqual({ pr: null, from: "main", into: null })
  })
  it("is nothing for a plain commit", () => {
    expect(mergeOf("fix(teaser): a fix")).toBeNull()
  })
})
