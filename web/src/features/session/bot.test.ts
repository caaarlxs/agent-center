import { describe, expect, it } from "vitest"
import { botOf, botState } from "./bot"

describe("a session's bot", () => {
  it("is always the same for a session, and sessions spread over the bodies", () => {
    expect(botOf("a34cbfbf-a9c4-49af-8f23-6b0be74e2b02")).toBe(botOf("a34cbfbf-a9c4-49af-8f23-6b0be74e2b02"))
    const ids = Array.from({ length: 60 }, (_, i) => `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`)
    expect(new Set(ids.map(botOf)).size).toBeGreaterThan(10)
  })
  it("works while the session works, sleeps while its process is asleep, else idles", () => {
    expect(botState("working", true)).toBe("working")
    expect(botState("review", false)).toBe("sleeping")
    expect(botState("review", true)).toBe("default")
  })
})
