import { describe, expect, it } from "vitest"
import { columnOf, isQueued } from "./pipeline-board"

const at = (stage: "refine" | "plan", status: "running" | "needs-info" | "ready" | "failed") => ({ stage, status }) as never

describe("columnOf", () => {
  it("puts a ticket in its stage's column while the stage is open", () => {
    expect(columnOf(at("refine", "running"))).toBe(0)
    expect(columnOf(at("plan", "needs-info"))).toBe(1)
    expect(columnOf(at("plan", "failed"))).toBe(1)
  })
  it("moves a ticket whose stage is done to the next column, waiting", () => {
    expect(columnOf(at("refine", "ready"))).toBe(1)
    expect(columnOf(at("plan", "ready"))).toBe(2)
    expect(isQueued(at("plan", "ready"))).toBe(true)
    expect(isQueued(at("plan", "running"))).toBe(false)
  })
})
