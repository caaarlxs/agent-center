import { describe, expect, it } from "vitest"
import { momentPlan } from "./plan"

describe("momentPlan", () => {
  it("runs the steps one after the other, then gives the place back", () => {
    expect(momentPlan([600, 900])).toEqual([{ step: 0, at: 0 }, { step: 1, at: 600 }, { step: -1, at: 1500 }])
  })
  it("with reduced motion shows only the outcome of a sequence", () => {
    expect(momentPlan([600, 900], true)).toEqual([{ step: 1, at: 0 }, { step: -1, at: 900 }])
  })
  it("with reduced motion skips a single-step moment", () => {
    expect(momentPlan([1200], true)).toEqual([])
  })
})
