import { expect, test } from "vitest"
import { ARROWS, arrowStep } from "./arrow-code"

test("the arrows in order reach the end; a wrong key starts again", () => {
  let at = 0
  for (const k of ARROWS) at = arrowStep(at, k)
  expect(at).toBe(ARROWS.length)
  expect(arrowStep(3, "ArrowLeft")).toBe(0)
  expect(arrowStep(0, "a")).toBe(0)
})

test("a wrong key that starts the code counts as its first", () => {
  expect(arrowStep(1, "ArrowUp")).toBe(2)
  expect(arrowStep(2, "ArrowUp")).toBe(2) // ↑↑↑: still two up
  expect(arrowStep(5, "ArrowUp")).toBe(1)
})
