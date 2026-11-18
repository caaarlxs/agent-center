import { expect, test } from "vitest"
import { COLD_AFTER_MS, COLD_CONTEXT, costlyNow, EXPENSIVE_CONTEXT, GROWTH, hideValue, isExpensive, isHidden, money, stepWithout, tokens } from "./spend"

test("a conversation is costly once each step re-reads a lot of context", () => {
  expect(isExpensive(EXPENSIVE_CONTEXT - 1)).toBe(false)
  expect(isExpensive(EXPENSIVE_CONTEXT)).toBe(true)
})

test("a conversation is costly once it grew a lot over what its task needs, whatever its size", () => {
  const now = 10 * COLD_AFTER_MS
  expect(costlyNow({ context: 300_000, base: 250_000 }, now, now)).toBe(null)
  expect(costlyNow({ context: 250_000 + GROWTH - 1, base: 250_000 }, now, now)).toBe(null)
  expect(costlyNow({ context: 250_000 + GROWTH, base: 250_000 }, now, now)).toBe("steps")
  expect(costlyNow({ context: GROWTH + 20_000, base: 20_000 }, 0, now)).toBe("steps")
})

test("an idle conversation is cold once its cache has expired, from a smaller size", () => {
  const now = 10 * COLD_AFTER_MS
  const idle = now - COLD_AFTER_MS
  expect(costlyNow({ context: COLD_CONTEXT, base: COLD_CONTEXT }, idle, now)).toBe("cold")
  expect(costlyNow({ context: COLD_CONTEXT - 1, base: 0 }, idle, now)).toBe(null)
  expect(costlyNow({ context: COLD_CONTEXT, base: COLD_CONTEXT }, idle + 1, now)).toBe(null)
})

test("a step without the history re-reads only what the task needs", () => {
  expect(stepWithout({ context: 800_000, base: 200_000, stepCost: 0.16 })).toBeCloseTo(0.04)
  expect(stepWithout({ context: 0, base: 0, stepCost: 0 })).toBe(0)
})

test("a hidden note comes back: the step note after it grows as much again, the cold note when it goes cold again", () => {
  const u = { context: 500_000, modelAt: 1000 }
  expect(isHidden("steps", undefined, u)).toBe(false)
  expect(isHidden("steps", hideValue("steps", u), { ...u, context: u.context + GROWTH - 1 })).toBe(true)
  expect(isHidden("steps", hideValue("steps", u), { ...u, context: u.context + GROWTH })).toBe(false)
  expect(isHidden("cold", hideValue("cold", u), u)).toBe(true)
  expect(isHidden("cold", hideValue("cold", u), { ...u, modelAt: 2000 })).toBe(false)
})

test("tokens and money, short", () => {
  expect(tokens(717_400)).toBe("717K")
  expect(tokens(1_250_000)).toBe("1.3M")
  expect(tokens(900)).toBe("900")
  expect(money(0.137)).toBe("$0.14")
  expect(money(184.4)).toBe("$184")
  expect(money(12.34)).toBe("$12.3")
})
