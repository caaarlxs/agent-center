import { expect, it } from "vitest"
import { isStaleBuild } from "./stale-build"

it("tells a piece of an old build gone from any other error", () => {
  expect(isStaleBuild(new TypeError("Failed to fetch dynamically imported module: http://localhost:7777/assets/Commits-DWqFB0aB.js"))).toBe(true)
  expect(isStaleBuild(new TypeError("Importing a module script failed."))).toBe(true)
  expect(isStaleBuild(new TypeError("l is not a function"))).toBe(false)
})
