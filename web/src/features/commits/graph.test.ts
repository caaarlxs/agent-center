import { describe, expect, it } from "vitest"
import { lanesOf } from "./graph"

const c = (hash: string, ...parents: string[]) => ({ hash, parents })

describe("lanesOf", () => {
  it("keeps a straight history in one lane", () => {
    const rows = lanesOf([c("c", "b"), c("b", "a"), c("a")])
    expect(rows.map(r => r.lane)).toEqual([0, 0, 0])
    expect(rows[2].below).toEqual([])
  })
  it("draws a branch beside its base, and its merge", () => {
    // m merges f into main; f branched from a.
    const rows = lanesOf([c("m", "b", "f"), c("f", "a"), c("b", "a"), c("a")])
    expect(rows[0].parents).toEqual([0, 1]) // main goes on, the branch opens a lane
    expect(rows[1].lane).toBe(1)
    expect(rows[2].lane).toBe(0)
    expect(rows[3].joins).toEqual([1]) // the branch's line ends at its base
  })
  it("puts a branch tip with no child in a lane of its own", () => {
    const rows = lanesOf([c("x", "a"), c("main", "a"), c("a")])
    expect(rows[1].lane).toBe(1)
    expect(rows[2].lane).toBe(0)
    expect(rows[2].joins).toEqual([1])
  })
})
