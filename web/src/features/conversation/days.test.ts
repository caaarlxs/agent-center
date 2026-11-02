import { describe, expect, it } from "vitest"
import { dayBreaks, dayLabel } from "./days"

const now = new Date(2026, 10, 2, 15, 0).getTime() // Mon 2 Nov 2026, 15:00
const at = (d: number, h = 10) => new Date(2026, 10, d, h).toISOString()

describe("dayLabel", () => {
  it("names a day by how far back it is", () => {
    expect(dayLabel(Date.parse(at(2)), now)).toBe("Today")
    expect(dayLabel(Date.parse(at(1, 23)), now)).toBe("Yesterday")
    expect(dayLabel(new Date(2026, 9, 29, 10).getTime(), now)).toBe("Thursday")
    expect(dayLabel(new Date(2026, 9, 20, 10).getTime(), now)).toBe("Tue 20 Oct")
    expect(dayLabel(new Date(2025, 9, 20, 10).getTime(), now)).toBe("Mon 20 Oct 2025")
  })
})

describe("dayBreaks", () => {
  it("marks nothing when everything is from today", () => {
    expect(dayBreaks([{ key: "a", at: at(2, 9) }, { key: "b", at: at(2, 11) }], now).size).toBe(0)
  })
  it("marks the first message of each day, skipping items with no time", () => {
    const breaks = dayBreaks([{ key: "a", at: at(1, 9) }, { key: "t" }, { key: "b", at: at(1, 18) }, { key: "c", at: at(2, 8) }], now)
    expect([...breaks]).toEqual([["a", "Yesterday"], ["c", "Today"]])
  })
})
