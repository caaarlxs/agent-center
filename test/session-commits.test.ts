// The commits a session made, and where they show on GitHub (lib/session-commits.ts).
import { describe, expect, it } from "bun:test"
import { hashesIn, isNamed, refsOf, webOf } from "../lib/session-commits"

describe("isNamed", () => {
  const text = '"[main 1ef7fe1] Dots cards" then "a14e694..f174b83  main -> main" and id a34cbfbf-a9c4'
  const named = new Set(hashesIn(text))
  it("knows a commit the transcript names, short or whole", () => {
    expect(isNamed("1ef7fe1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", named)).toBe(true)
    expect(isNamed("f174b83bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", named)).toBe(true)
  })
  it("not one it never names", () => {
    expect(isNamed("9999999ccccccccccccccccccccccccccccccccc", named)).toBe(false)
  })
})

describe("webOf", () => {
  it("turns a GitHub remote into its page", () => {
    expect(webOf("git@github.com:caaarlxs/agent-center.git")).toBe("https://github.com/caaarlxs/agent-center")
    expect(webOf("https://github.com/deale-org/admin-service")).toBe("https://github.com/deale-org/admin-service")
  })
  it("knows no page for other remotes", () => {
    expect(webOf("git@gitlab.com:a/b.git")).toBeNull()
    expect(webOf(null)).toBeNull()
  })
})

describe("refsOf", () => {
  it("tells the current branch, branches, remote branches and tags apart", () => {
    expect(refsOf("HEAD -> refs/heads/main, refs/remotes/origin/main, refs/remotes/origin/HEAD, tag: refs/tags/v1.0, refs/heads/retro-style")).toEqual([
      { name: "main", kind: "head" },
      { name: "origin/main", kind: "remote" },
      { name: "v1.0", kind: "tag" },
      { name: "retro-style", kind: "branch" },
    ])
  })
  it("reads a detached HEAD and nothing", () => {
    expect(refsOf("HEAD")).toEqual([{ name: "HEAD", kind: "head" }])
    expect(refsOf("")).toEqual([])
  })
})
