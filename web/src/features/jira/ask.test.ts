import { describe, expect, it } from "vitest"
import { isWaiting } from "./Ask"

describe("isWaiting", () => {
  it("is the last question without its answer, for a while only", () => {
    expect(isWaiting([])).toBe(false)
    expect(isWaiting([{ q: "a", a: null, at: 1000 }], 2000)).toBe(true)
    expect(isWaiting([{ q: "a", a: "b", at: 1000 }], 2000)).toBe(false)
    expect(isWaiting([{ q: "a", a: null, at: 1000, error: "no" }], 2000)).toBe(false)
    expect(isWaiting([{ q: "a", a: null, at: 1000 }], 1000 + 6 * 60_000)).toBe(false)
  })
})

import { startedState } from "./Pipeline"
describe("startedState", () => {
  it("shows a stage at work at once: the one asked for, from now", () => {
    const s = startedState({ key: "PP-1", stage: "test", status: "ready", error: "x", questions: [{ id: "Q1" }] } as never, "build")
    expect(s).toMatchObject({ stage: "build", status: "running", error: null, questions: [], sessionId: null })
  })
})
