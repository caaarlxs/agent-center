import { describe, expect, it } from "bun:test"
import { accountLimits } from "../lib/limits"

const NOW = Date.parse("2026-11-03T15:00:00Z")
const FIVE = "2026-11-03T19:30:00.000Z"
const WEEK = "2026-11-10T14:00:00.000Z"
const reading = (at: number, five: number | null, week: number, fiveAt = FIVE, weekAt = WEEK) => ({
  at,
  windows: [...(five === null ? [] : [{ kind: "five_hour", percentUsed: five, resetsAt: fiveAt }]), { kind: "seven_day", percentUsed: week, resetsAt: weekAt }],
})

describe("accountLimits", () => {
  it("takes the highest use of each window, whichever session wrote last", () => {
    const got = accountLimits([reading(NOW, 6, 3), reading(NOW - 60_000, 44, 8), reading(NOW - 30_000, 33, 7)], NOW)!
    expect(got.windows).toEqual([
      { kind: "five_hour", percentUsed: 44, resetsAt: FIVE },
      { kind: "seven_day", percentUsed: 8, resetsAt: WEEK },
    ])
    expect(got.at).toBe(NOW)
  })
  it("leaves out readings of a window that already reset", () => {
    const old = reading(NOW - 3 * 3600_000, 40, 67, "2026-11-03T14:30:00.000Z", "2026-11-03T14:00:00.000Z")
    expect(accountLimits([old, reading(NOW, 20, 5)], NOW)!.windows.map(w => w.percentUsed)).toEqual([20, 5])
  })
  it("prefers readings with the 5-hour window to weekly-only ones", () => {
    expect(accountLimits([reading(NOW, null, 29), reading(NOW - 60_000, 20, 5)], NOW)!.windows.map(w => w.percentUsed)).toEqual([20, 5])
    expect(accountLimits([reading(NOW, null, 29)], NOW)!.windows).toEqual([{ kind: "seven_day", percentUsed: 29, resetsAt: WEEK }])
  })
  it("has none without readings", () => expect(accountLimits([null], NOW)).toBeNull())
})
