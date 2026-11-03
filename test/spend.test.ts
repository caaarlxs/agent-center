import { describe, expect, it } from "bun:test"
import { spendOf } from "../lib/usage"

describe("spendOf", () => {
  it("adds up a conversation's tokens by kind, its main model and its API-equivalent cost", () => {
    const s = spendOf([
      { model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0 } },
      { model: "claude-opus-5-5", usage: { input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      { model: "claude-haiku-5-5", usage: { output_tokens: 10 } },
    ])
    expect(s).toMatchObject({ input: 1000, output: 3010, cacheRead: 1_000_000, cacheWrite: 0, model: "claude-opus-5-5" })
    expect(s.cost).toBeCloseTo((1000 * 4 + 3000 * 20 + 1_000_000 * 0.2 + 10 * 0.5) / 1_000_000, 4)
  })
  it("is nothing for no messages", () => {
    expect(spendOf([])).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, model: null })
  })
})
