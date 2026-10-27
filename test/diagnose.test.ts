// Why a message would not reach a session (lib/diagnose.ts): the session runs
// without the bridge mod, or with an older one.

import { expect, test } from "bun:test"
import { blockerOf } from "../lib/diagnose"

const now = 10_000_000
const PROTOCOL = 9

test("a session that worked lately while its mod gave no sign runs without the mod", () => {
  expect(blockerOf({ lastSeen: null, version: 0 }, now - 60_000, PROTOCOL, now)).toBe("no-mod")
  expect(blockerOf({ lastSeen: now - 3_600_000, version: 9 }, now - 60_000, PROTOCOL, now)).toBe("no-mod") // beat long before
})

test("a mod that beats while the session works is fine; an older one is said", () => {
  expect(blockerOf({ lastSeen: now - 2000, version: 9 }, now - 60_000, PROTOCOL, now)).toBeNull()
  expect(blockerOf({ lastSeen: now - 50_000, version: 9 }, now - 60_000, PROTOCOL, now)).toBeNull() // beat around its last activity
  expect(blockerOf({ lastSeen: now - 2000, version: 6 }, now - 60_000, PROTOCOL, now)).toBe("old-mod")
})

test("a session quiet for long says nothing: it may only be asleep", () => {
  expect(blockerOf({ lastSeen: null, version: 0 }, now - 3 * 3_600_000, PROTOCOL, now)).toBeNull()
  expect(blockerOf({ lastSeen: null, version: 0 }, null, PROTOCOL, now)).toBeNull()
})
