import { expect, test } from "vitest"
import { AGAIN_AFTER, COLD_AFTER_MS, COLD_CONTEXT, costlyNow, EXPENSIVE_CONTEXT, hideValue, isExpensive, isHidden, money, tokens } from "./spend"

test("a conversation is costly once each step re-reads a lot of context", () => {
  expect(isExpensive(EXPENSIVE_CONTEXT - 1)).toBe(false)
  expect(isExpensive(EXPENSIVE_CONTEXT)).toBe(true)
})

test("an idle conversation is cold once its cache has expired, from a smaller size", () => {
  const now = 10 * COLD_AFTER_MS
  const idle = now - COLD_AFTER_MS
  expect(costlyNow(COLD_CONTEXT, idle, now)).toBe("cold")
  expect(costlyNow(COLD_CONTEXT - 1, idle, now)).toBe(null)
  expect(costlyNow(COLD_CONTEXT, idle + 1, now)).toBe(null)
  expect(costlyNow(EXPENSIVE_CONTEXT, idle + 1, now)).toBe("steps")
  expect(costlyNow(EXPENSIVE_CONTEXT, 0, now)).toBe("steps")
})

test("a hidden note comes back: the step note after 150K more, the cold note when it goes cold again", () => {
  const u = { context: 500_000, modelAt: 1000 }
  expect(isHidden("steps", undefined, u)).toBe(false)
  expect(isHidden("steps", hideValue("steps", u), { ...u, context: u.context + AGAIN_AFTER - 1 })).toBe(true)
  expect(isHidden("steps", hideValue("steps", u), { ...u, context: u.context + AGAIN_AFTER })).toBe(false)
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
