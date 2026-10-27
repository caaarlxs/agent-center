import { expect, test } from "vitest"
import { isStale } from "./update"

const fresh = { server: false, page: "a", hook: false, bridge: false }

test("nothing is stale while all matches what the page loaded", () => {
  expect(isStale(fresh, fresh)).toBe(false)
  expect(isStale(null, fresh)).toBe(false)
})

test("the server, the hook or the mod out of date is stale", () => {
  expect(isStale({ ...fresh, server: true }, fresh)).toBe(true)
  expect(isStale({ ...fresh, bridge: true }, fresh)).toBe(true)
})

test("a page whose files changed since it loaded is stale, a field added later too", () => {
  expect(isStale({ ...fresh, page: "b" }, fresh)).toBe(true)
  expect(isStale({ ...fresh, later: "x" }, { ...fresh, later: "w" })).toBe(true)
  expect(isStale({ ...fresh, later: "x" }, fresh)).toBe(false)
})

test("a page build older than its sources needs Update, even if it already was at load", () => {
  expect(isStale({ web: "stale" }, { web: "stale" })).toBe(true)
  expect(isStale({ web: "fresh" }, { web: "fresh" })).toBe(false)
})
