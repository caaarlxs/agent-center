import { expect, test } from "vitest"
import { EXPENSIVE_CONTEXT, isExpensive, money, tokens } from "./spend"

test("a conversation is costly once each step re-reads a lot of context", () => {
  expect(isExpensive(EXPENSIVE_CONTEXT - 1)).toBe(false)
  expect(isExpensive(EXPENSIVE_CONTEXT)).toBe(true)
})

test("tokens and money, short", () => {
  expect(tokens(717_400)).toBe("717K")
  expect(tokens(1_250_000)).toBe("1.3M")
  expect(tokens(900)).toBe("900")
  expect(money(0.137)).toBe("$0.14")
  expect(money(184.4)).toBe("$184")
  expect(money(12.34)).toBe("$12.3")
})
