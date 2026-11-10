import { expect, test } from "vitest"
import { SIZES, nextSize } from "./size"

test("a step up or down the sizes, never past the ends", () => {
  expect(nextSize(1, 1)).toBe(1.25)
  expect(nextSize(1, -1)).toBe(0.8)
  expect(nextSize(SIZES.at(-1)!, 1)).toBe(SIZES.at(-1))
  expect(nextSize(SIZES[0]!, -1)).toBe(SIZES[0])
})

test("a size between steps goes to the next one that way", () => {
  expect(nextSize(1.1, 1)).toBe(1.25)
  expect(nextSize(1.1, -1)).toBe(1)
})
