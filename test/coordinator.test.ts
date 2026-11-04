import { describe, expect, it } from "bun:test"
import { childrenIn, deliverablesOf, toStart, waitsFor } from "../lib/coordinator"

const ref = (key: string, kind: string) => ({ key, kind })
const state = (stage: string, status: string, extra = {}) => ({ stage, status, ...extra }) as never

describe("deliverablesOf", () => {
  it("is the children that are delivered on their own: stories, tasks and bugs, not sub-tasks", () => {
    expect(deliverablesOf({ children: [ref("PP-2", "story"), ref("PP-3", "subtask"), ref("PP-4", "bug"), ref("PP-5", "task")] } as never)).toEqual(["PP-2", "PP-4", "PP-5"])
    expect(deliverablesOf({ children: [ref("PP-3", "subtask")] } as never)).toEqual([])
  })
})

describe("childrenIn", () => {
  it("reads the parent's order, keeps only its own children, and adds any it left out, last", () => {
    const order = [{ key: "PP-4", dependsOn: ["PP-2"] }, { key: "PP-2", dependsOn: [] }, { key: "PP-9", dependsOn: [] }]
    expect(childrenIn(order, ["PP-2", "PP-4", "PP-5"])).toEqual([{ key: "PP-4", dependsOn: ["PP-2"] }, { key: "PP-2", dependsOn: [] }, { key: "PP-5", dependsOn: [] }])
  })
  it("keeps the ticket order when the agent gave none", () => {
    expect(childrenIn(undefined, ["PP-2", "PP-4"])).toEqual([{ key: "PP-2", dependsOn: [] }, { key: "PP-4", dependsOn: [] }])
  })
})

describe("toStart", () => {
  const children = [{ key: "PP-2", dependsOn: [] }, { key: "PP-3", dependsOn: [] }, { key: "PP-4", dependsOn: [] }]
  it("starts the children not started yet, in order, two at a time", () => {
    expect(toStart(children, {}, 2)).toEqual(["PP-2", "PP-3"])
    expect(toStart(children, { "PP-2": state("refine", "running") }, 2)).toEqual(["PP-3"])
    expect(toStart(children, { "PP-2": state("refine", "ready"), "PP-3": state("plan", "running") }, 2)).toEqual(["PP-4"])
    expect(toStart(children, { "PP-2": state("refine", "running"), "PP-3": state("refine", "running") }, 2)).toEqual([])
  })
})

describe("waitsFor", () => {
  const children = [{ key: "PP-2", dependsOn: [] }, { key: "PP-4", dependsOn: ["PP-2"] }]
  it("holds a child's staging until what it depends on is in staging", () => {
    expect(waitsFor("PP-4", children, { "PP-2": state("review", "ready") })).toEqual(["PP-2"])
    expect(waitsFor("PP-4", children, { "PP-2": state("staging", "ready", { deployed: { staging: {} } }) })).toEqual([])
    expect(waitsFor("PP-2", children, {})).toEqual([])
  })
})
