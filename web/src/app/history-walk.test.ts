import { expect, test } from "vitest"
import { walkTo } from "./history-walk"

test("a step through history opens, swaps, closes or leaves the panel", () => {
  expect(walkTo("a", "a")).toBe("stay")
  expect(walkTo(null, "a")).toBe("close")
  expect(walkTo("a", null)).toBe("open")
  expect(walkTo("b", "a")).toBe("swap")
  expect(walkTo(null, null)).toBe("stay")
})
