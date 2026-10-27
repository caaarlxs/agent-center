import { describe, expect, it } from "vitest"
import type { Card } from "@/lib/api-types"
import { forecast, limitRows, resetAt, topSpenders, untilText } from "./pace"

const H = 3600_000
const now = new Date(2026, 9, 27, 12, 0).getTime() // a Tuesday, noon

describe("untilText", () => {
  it("drops a zero part", () => {
    expect(untilText(34 * 60_000)).toBe("34 min")
    expect(untilText(2 * H)).toBe("2 h")
    expect(untilText(2 * H + 10 * 60_000)).toBe("2 h 10 min")
    expect(untilText(48 * H)).toBe("2 d")
    expect(untilText(58 * H)).toBe("2 d 10 h")
  })
})

describe("resetAt", () => {
  it("says today, tomorrow or the weekday", () => {
    expect(resetAt(now + 2 * H, now)).toBe("today at 14:00")
    expect(resetAt(now + 24 * H, now)).toBe("tomorrow at 12:00")
    expect(resetAt(now + 6 * 24 * H, now)).toBe("Monday at 12:00")
  })
})

describe("forecast", () => {
  const span = 5 * H
  it("is silent early in the window or at low use", () => {
    expect(forecast(50, now + span - 10 * 60_000, span, now)).toBeNull()
    expect(forecast(2, now + H, span, now)).toBeNull()
  })
  it("says when it fills up before the reset", () => {
    // 60% in 2 h: 30%/h, full in 80 min, the reset is in 3 h
    expect(forecast(60, now + 3 * H, span, now)).toEqual({ fullAt: now + (40 / 60) * 2 * H })
  })
  it("else, where it gets at the reset", () => {
    expect(forecast(20, now + 3 * H, span, now)).toEqual({ atReset: 50 })
  })
})

describe("limitRows", () => {
  it("measures the time gone by and the pace", () => {
    const [row] = limitRows({ at: now, windows: [{ kind: "five_hour", percentUsed: 80, resetsAt: new Date(now + 2.5 * H).toISOString() }] }, now)
    expect(row).toMatchObject({ label: "5 hours", pct: 80, tone: "ask", elapsed: 50, pace: "over", left: "2 h 30 min", hasReset: false })
  })
  it("shows a window that already reset at 0", () => {
    const [row] = limitRows({ at: now, windows: [{ kind: "seven_day", percentUsed: 95, resetsAt: new Date(now - H).toISOString() }] }, now)
    expect(row).toMatchObject({ pct: 0, tone: "ok", hasReset: true, elapsed: null, pace: null, left: null, ahead: null })
  })
  it("without a reset time, says nothing about pace", () => {
    const [row] = limitRows({ at: now, windows: [{ kind: "five_hour", percentUsed: 30 }] }, now)
    expect(row).toMatchObject({ reset: null, elapsed: null, pace: null })
  })
})

describe("topSpenders", () => {
  const card = (id: string, recentCost: number) => ({ id, usage: { recentCost } }) as unknown as Card
  it("keeps the three that spent most, with their share", () => {
    const top = topSpenders([card("a", 1), card("b", 6), card("c", 0), card("d", 2), card("e", 1)])
    expect(top.map(t => [t.card.id, t.share])).toEqual([["b", 60], ["d", 20], ["a", 10]])
  })
  it("is empty when nothing was spent", () => expect(topSpenders([card("a", 0)])).toEqual([]))
})
