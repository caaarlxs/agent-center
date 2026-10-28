import { describe, expect, it } from "vitest"
import { modelNow } from "./Settings"

describe("the model a session uses now", () => {
  it("is the one switched to on the board, until it answers with another", () => {
    expect(modelNow({ model: "claude-opus-5-5", modelAt: 100 }, { value: "claude-sonnet-5-5", at: 200 })).toBe("claude-sonnet-5-5")
    expect(modelNow({ model: "claude-opus-5-5", modelAt: 300 }, { value: "claude-sonnet-5-5", at: 200 })).toBe("claude-opus-5-5") // picked in the app since
  })
  it("is the one it answered with when nothing was switched", () => {
    expect(modelNow({ model: "claude-opus-5-5", modelAt: 100 }, null)).toBe("claude-opus-5-5")
    expect(modelNow(null, null)).toBeNull()
  })
})
