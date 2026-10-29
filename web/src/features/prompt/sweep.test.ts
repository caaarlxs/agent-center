import { describe, expect, it } from "vitest"
import { sweepAt } from "./sweep"

describe("the glow while Whisper writes what you said", () => {
  it("gathers into one beam, then sweeps the box from side to side", () => {
    expect(sweepAt(0).gather).toBe(0)
    expect(sweepAt(300).gather).toBe(1)
    const offsets = Array.from({ length: 40 }, (_, i) => sweepAt(i * 100).offset!)
    expect(Math.max(...offsets)).toBeGreaterThan(0.6)
    expect(Math.min(...offsets)).toBeLessThan(-0.6)
    expect(offsets.every(o => Math.abs(o) <= 0.8)).toBe(true)
  })
})
