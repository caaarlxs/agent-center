import { describe, expect, it } from "vitest"
import { type Live, shownLive } from "./session-events"

const now = 1_000_000
const live = (over: Partial<Live> = {}): Live => ({ turnId: "t", step: 0, text: "Writing…", done: false, at: now - 100, ...over })

describe("the answer being written", () => {
  it("shows while the model writes it", () => expect(shownLive(live(), 10, null, now)).toBe("Writing…"))
  it("stays after the step ends until the transcript has it", () => {
    expect(shownLive(live({ done: true }), 10, 10, now)).toBe("Writing…")
    expect(shownLive(live({ done: true }), 11, 10, now)).toBeNull()
  })
  it("is not shown once it stopped long ago, or with nothing written", () => {
    expect(shownLive(live({ at: now - 120_000 }), 10, null, now)).toBeNull()
    expect(shownLive(live({ text: "" }), 10, null, now)).toBeNull()
    expect(shownLive(null, 10, null, now)).toBeNull()
  })
})
