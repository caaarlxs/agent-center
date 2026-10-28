import { describe, expect, it } from "vitest"
import { progressOf } from "./progress"

describe("progressOf", () => {
  it("counts required steps apart from the rest", () => {
    const steps = [
      { need: "Required", isDone: true }, { need: "Required", isDone: false },
      { need: "Recommended", isDone: true }, { need: "Optional", isDone: false },
    ]
    expect(progressOf(steps)).toEqual({ required: { done: 1, total: 2 }, optional: { done: 1, total: 2 } })
  })
})
