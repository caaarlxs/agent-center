import { describe, expect, it } from "vitest"
import { duration, modelName, tickLabel, ticksOf } from "./Trace"

describe("duration", () => {
  it("writes a time short", () => {
    expect([duration(420), duration(3200), duration(42_000), duration(192_000), duration(4_000_000)]).toEqual(["420ms", "3.2s", "42s", "3m 12s", "1h 6m"])
  })
})

describe("ticksOf", () => {
  it("picks a round step that gives a few ticks", () => {
    expect(ticksOf(47_000)).toEqual([0, 10_000, 20_000, 30_000, 40_000])
    expect(ticksOf(530_000).length).toBeLessThanOrEqual(7)
    expect(ticksOf(530_000)[1]).toBe(120_000)
  })
})

describe("tickLabel", () => {
  it("writes a tick short", () => {
    expect([0, 30_000, 120_000, 150_000, 3_600_000].map(tickLabel)).toEqual(["0", "30s", "2m", "2m 30s", "1h"])
  })
})

describe("modelName", () => {
  it("says a model as people do", () => {
    expect(["claude-opus-5-5", "claude-fable-5-1", "claude-haiku-4-5-20251001", "claude-sonnet-5-5[1m]"].map(modelName)).toEqual(["Opus 5.5", "Fable 5.1", "Haiku 4.5", "Sonnet 5.5"])
  })
})
