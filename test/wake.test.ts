// When the board keeps starting a session (lib/wake.ts), and when a heartbeat's
// "busy" no longer holds (lib/bridge.ts).
import { describe, expect, it } from "bun:test"
import { busyNow, openNow } from "../lib/bridge"
import { wantsWake } from "../lib/wake"

describe("wantsWake", () => {
  it("keeps at it while messages wait or a Wake was asked", () => {
    expect(wantsWake({ pending: 2, isOpen: false }, false, false)).toBe(true)
    expect(wantsWake({ pending: 0, isOpen: false }, true, false)).toBe(true)
  })
  it("stops once it is open, in a turn, or nothing waits", () => {
    expect(wantsWake({ pending: 1, isOpen: true }, true, false)).toBe(false)
    expect(wantsWake({ pending: 1, isOpen: false }, true, true)).toBe(false)
    expect(wantsWake({ pending: 0, isOpen: false }, false, false)).toBe(false)
  })
})

describe("busyNow", () => {
  it("drops busy when the session's process is gone", () => {
    expect(busyNow(true, false)).toBe(false)
  })
  it("keeps what the heartbeat says otherwise", () => {
    expect(busyNow(true, true)).toBe(true)
    expect(busyNow(true, null)).toBe(true)
    expect(busyNow(false, false)).toBe(false)
  })
})

describe("openNow", () => {
  const now = 1_000_000
  it("is open on a fresh heartbeat while the process runs or is not read yet", () => {
    expect(openNow(now - 2000, true, now)).toBe(true)
    expect(openNow(now - 2000, null, now)).toBe(true)
  })
  it("is closed once the process is gone, or the heartbeat is old", () => {
    expect(openNow(now - 2000, false, now)).toBe(false)
    expect(openNow(now - 60_000, true, now)).toBe(false)
  })
})
