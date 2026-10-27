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
})

describe("stampOf", () => {
  it("says a refusal first, with its reason", () => {
    expect(stampOf(p("a"), bridge({ failed: [{ id: "a", reason: "too long" }], isOpen: true }), true)).toEqual({ text: "Could not deliver: too long", isBad: true })
  })

  it("says a stuck message needs Claude desktop", () => {
    expect(stampOf(p("a"), bridge({ stuck: ["a"] }), false).isBad).toBe(true)
  })

  it("says it waits for the turn, or is on its way", () => {
    expect(stampOf(p("a"), bridge({ isOpen: true }), true).text).toMatch(/^Queued/)
    expect(stampOf(p("a"), bridge({ isOpen: true }), false).text).toBe("Sending…")
    expect(stampOf(p("a"), bridge({}), false).text).toBe("Waking the session…")
  })
})
