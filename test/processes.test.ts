import { describe, expect, it } from "bun:test"
import { type Tracks, processOf } from "../lib/processes"

const beat = (proc: string, surfaces: string[] = []) => ({ proc, surfaces })

describe("processOf", () => {
  it("says a session runs in a terminal when its process draws there", () => {
    const t: Tracks = new Map()
    expect(processOf(t, "s", beat("a", ["terminal"]), 0)).toEqual({ inTerminal: true, isDoubled: false })
    expect(processOf(t, "s", beat("b", ["desktop"]), 1000)).toEqual({ inTerminal: false, isDoubled: false })
  })
  it("one change of process is a restart, not two at once", () => {
    const t: Tracks = new Map()
    processOf(t, "s", beat("a"), 0)
    processOf(t, "s", beat("a"), 2000)
    expect(processOf(t, "s", beat("b"), 4000).isDoubled).toBe(false)
    expect(processOf(t, "s", beat("b"), 6000).isDoubled).toBe(false)
  })
  it("two processes that take turns writing are two at once", () => {
    const t: Tracks = new Map()
    processOf(t, "s", beat("a", ["terminal"]), 0)
    processOf(t, "s", beat("b"), 2000)
    expect(processOf(t, "s", beat("a", ["terminal"]), 4000)).toEqual({ inTerminal: true, isDoubled: true })
  })
  it("forgets it once one of them has been quiet a while", () => {
    const t: Tracks = new Map()
    processOf(t, "s", beat("a"), 0)
    processOf(t, "s", beat("b"), 2000)
    processOf(t, "s", beat("a"), 4000)
    expect(processOf(t, "s", beat("a"), 40_000).isDoubled).toBe(false)
  })
  it("an older mod, with no process: nothing known", () => {
    expect(processOf(new Map(), "s", {}, 0)).toEqual({ inTerminal: false, isDoubled: false })
  })
  it("keeps each session apart", () => {
    const t: Tracks = new Map()
    processOf(t, "s", beat("a"), 0)
    expect(processOf(t, "x", beat("b"), 1000).isDoubled).toBe(false)
  })
})
