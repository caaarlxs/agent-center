import { describe, expect, it } from "vitest"
import type { Bridge } from "@/lib/api-types"
import { deliveredOf, stampOf, waitingOf } from "./pending"

const bridge = (b: Partial<Bridge>) => ({ isOpen: false, failed: [], stuck: [], queued: [], wake: null, ...b }) as Bridge
const p = (id: string, text = "hi") => ({ id, text, at: 1 })

describe("waitingOf", () => {
  it("adds what the server holds that is not mine, once", () => {
    expect(waitingOf([p("1-a")], [{ id: "1-a", text: "hi" }, { id: "5-b", text: "other" }])).toEqual([p("1-a"), { id: "5-b", text: "other", at: 5 }])
  })

  it("leaves out what was taken back", () => {
    expect(waitingOf([], [{ id: "5-b", text: "other" }], ["5-b"])).toEqual([])
  })
})

describe("deliveredOf", () => {
  it("finds the messages the transcript now has", () => {
    expect(deliveredOf([p("a", "hello "), p("b", "bye")], ["hello"])).toEqual(["a"])
  })

  it("finds several delivered at once in one prompt", () => {
    expect(deliveredOf([p("a", "first"), p("b", "second"), p("c", "third")], ["first\n\nsecond"])).toEqual(["a", "b"])
  })
})

describe("stampOf", () => {
  it("says a refusal first, with its reason", () => {
    expect(stampOf(p("a"), bridge({ failed: [{ id: "a", reason: "too long" }], isOpen: true }), true)).toEqual({ text: "Could not deliver: too long", isBad: true })
  })

  it("says a stuck message needs Claude desktop", () => {
    expect(stampOf(p("a"), bridge({ stuck: ["a"] }), false).isBad).toBe(true)
  })

  it("says a session without the mod never takes it, with its Claude Code", () => {
    expect(stampOf(p("a"), bridge({ blocker: "no-mod", cliVersion: "2.1.0" }), false)).toEqual({
      text: "This session runs without the bridge mod (Claude Code 2.1.0): update Claude desktop, then close the session and open it again", isBad: true,
    })
  })

  it("says Claude is at its cap only while the session is closed", () => {
    const wake = { tries: 1, untrusted: false, atCap: true, isOver: false }
    expect(stampOf(p("a"), bridge({ wake }), false).text).toMatch(/^Claude is at its limit/)
    expect(stampOf(p("a"), bridge({ wake, isOpen: true }), false).text).toBe("Sending…")
  })

  it("says a message for a session busy in a long tool run is queued", () => {
    expect(stampOf(p("a"), bridge({ busy: true, lastSeen: 1000 }), false, 2000).text).toMatch(/^Queued/)
  })

  it("says it waits for the turn, or is on its way", () => {
    expect(stampOf(p("a"), bridge({ isOpen: true }), true).text).toMatch(/^Queued/)
    expect(stampOf(p("a"), bridge({ isOpen: true }), false).text).toBe("Sending…")
    expect(stampOf(p("a"), bridge({}), false).text).toBe("Waking the session in the background…")
  })
})
