import { describe, expect, it } from "vitest"
import type { Bridge } from "@/lib/api-types"
import { isStuckNow, reachOf } from "./reach"

const bridge = (b: Partial<Bridge>) => ({ isOpen: false, pending: 0, failed: [], stuck: [], queued: [], wake: null, isArchived: false, lastSeen: null, ...b }) as Bridge
const atCap = { tries: 1, untrusted: false, atCap: true, isOver: false }

describe("reachOf", () => {
  it("says Claude is at its cap while messages wait for a closed session", () => {
    expect(reachOf(bridge({ wake: atCap, pending: 1 }), false)).toMatchObject({ tone: "bad", text: expect.stringMatching(/^Claude already runs as many sessions/) })
  })

  it("says nothing of the cap once the session is open or nothing waits", () => {
    expect(reachOf(bridge({ wake: atCap, pending: 1, isOpen: true }), false).tone).toBe("on")
    expect(reachOf(bridge({ wake: atCap }), false).tone).toBe("off")
  })

  it("says busy while a turn runs with a recent beat", () => {
    expect(reachOf(bridge({ lastSeen: 1000 }), true, false, 2000).text).toBe("Busy: delivered when the turn ends")
  })
})

describe("isStuckNow", () => {
  it("counts the cap as stuck", () => {
    expect(isStuckNow(bridge({ wake: atCap }))).toBe(true)
    expect(isStuckNow(bridge({}))).toBe(false)
  })
})
