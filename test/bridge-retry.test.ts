import { expect, test } from "bun:test"
import { RETRY_WITHIN_MS, retriesAfterStop } from "../lib/bridge"

test("a recent message refused after a stop goes again once the session works; not before, not an old one, no other refusal", () => {
  const stopped = "the session was stopped and nobody has sent input since"
  const now = 10 * RETRY_WITHIN_MS
  expect(retriesAfterStop(stopped, true, now - 60_000, now)).toBe(true)
  expect(retriesAfterStop(stopped, false, now - 60_000, now)).toBe(false)
  expect(retriesAfterStop("a UserPromptSubmit hook blocked it", true, now - 60_000, now)).toBe(false)
  expect(retriesAfterStop(stopped, true, now - RETRY_WITHIN_MS - 1, now)).toBe(false) // hours old: out of place now
})
