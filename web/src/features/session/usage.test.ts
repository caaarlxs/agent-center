import { describe, expect, it } from "vitest"
import { usageOf } from "./usage"

describe("usageOf", () => {
  it("gives the share, the tone and the tokens written short", () => {
    expect(usageOf({ context: 173_400, window: 1_000_000 })).toEqual({ pct: 17, tone: "ok", tokens: "173k", window: "1000k" })
    expect(usageOf({ context: 700, window: 1000 })).toMatchObject({ pct: 70, tone: "ask", tokens: "700" })
    expect(usageOf({ context: 990, window: 1000 })).toMatchObject({ pct: 99, tone: "bad" })
  })
  it("never passes 100%", () => expect(usageOf({ context: 1200, window: 1000 }).pct).toBe(100))
})
