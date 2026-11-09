import { describe, expect, it } from "vitest"
import { pipelineCounts } from "./pipeline-seen"

const run = (key: string, status: string, endedAt: number | null = null) => ({ key, status, endedAt }) as never

describe("pipelineCounts", () => {
  it("counts the agents at work, and those that ended after you last opened them", () => {
    const items = [run("A", "running"), run("B", "ready", 200), run("C", "failed", 300), run("D", "ready", 50), run("E", "needs-info", 400)]
    expect(pipelineCounts(items, { epoch: 100, read: {} })).toEqual({ working: 1, toRead: 2 })
    expect(pipelineCounts(items, { epoch: 100, read: { B: 250 } })).toEqual({ working: 1, toRead: 1 })
    expect(pipelineCounts(items, { epoch: 100, read: { B: 150 } })).toEqual({ working: 1, toRead: 2 }) // it ended again after
  })
})
