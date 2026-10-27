import { expect, test } from "vitest"
import type { Card } from "@/lib/api-types"
import { ago, labelOf, urgencyOf } from "./state"

const card = (extra: Partial<Card>) => ({ column: "review", isStale: false, isInterrupted: false, waitingSince: null, ...extra }) as Card
const MIN = 60_000

test("ages run to months", () => {
  expect(ago(0, 29 * 24 * 60 * MIN)).toBe("29 d")
  expect(ago(0, 65 * 24 * 60 * MIN)).toBe("2 mo")
})

test("a session waiting for you grows urgent: under 10 minutes, to 30, past 30", () => {
  expect(urgencyOf(card({ column: "asking", waitingSince: 1 }), 5 * MIN + 1)).toBe("low")
  expect(urgencyOf(card({ column: "asking", waitingSince: 1 }), 10 * MIN + 1)).toBe("mid")
  expect(urgencyOf(card({ column: "asking", waitingSince: 1 }), 31 * MIN + 1)).toBe("high")
  expect(urgencyOf(card({ column: "review", waitingSince: 1 }), 31 * MIN + 1)).toBeNull()
})

test("an interrupted session says so; a stuck one says stuck", () => {
  expect(labelOf(card({ isInterrupted: true }))).toBe("Interrupted")
  expect(labelOf(card({ isStale: true }))).toBe("Stuck")
  expect(labelOf(card({ column: "pending" }))).toBe("Pending")
})
