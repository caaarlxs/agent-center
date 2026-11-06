import { expect, test } from "bun:test"
import { customizeAfter } from "../lib/board"

test("one session customizes Agent Center: marking another moves it, unmarking clears it only on that one", () => {
  expect(customizeAfter(undefined, "a", false)).toBe("a")
  expect(customizeAfter("a", "b", false)).toBe("b")
  expect(customizeAfter("a", "a", true)).toBeUndefined()
  expect(customizeAfter("a", "b", true)).toBe("a")
})
