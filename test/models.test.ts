import { describe, expect, it } from "bun:test"
import { idsIn, modelName, newestModels } from "../lib/models"
import { priceOf } from "../lib/usage"

describe("newestModels", () => {
  it("keeps the newest of each family, the most capable first", () => {
    const ids = ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-fable-5-2", "claude-opus-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-sonnet-5"]
    expect(newestModels(ids)).toEqual([
      { id: "claude-fable-5-2", name: "Fable 5.2" },
      { id: "claude-opus-5-5", name: "Opus 5.5" },
      { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
      { id: "claude-haiku-5-5", name: "Haiku 5.5" },
    ])
  })
  it("compares versions as numbers, a bare major as .0", () => {
    expect(newestModels(["claude-opus-5-10", "claude-opus-5-9", "claude-opus-6"]).map(m => m.id)).toEqual(["claude-opus-6"])
  })
  it("leaves out a family it does not find", () => {
    expect(newestModels(["claude-opus-5-5"])).toEqual([{ id: "claude-opus-5-5", name: "Opus 5.5" }])
  })
})

describe("idsIn", () => {
  it("finds the model ids in a text, not dated ones nor longer names", () => {
    expect([...idsIn("x claude-fable-5-2\0claude-opus-4-20250514 claude-sonnet-5-5 us.anthropic.claude-haiku-5-5 claude-opus-5-5-latest")].sort())
      .toEqual(["claude-fable-5-2", "claude-haiku-5-5", "claude-sonnet-5-5"])
  })
})

describe("modelName", () => {
  it("names an id as the app does", () => {
    expect(modelName("claude-fable-5-2")).toBe("Fable 5.2")
    expect(modelName("claude-opus-5")).toBe("Opus 5")
    expect(modelName("gpt")).toBe("gpt")
  })
})

describe("priceOf", () => {
  it("prices a model newer than the list as its family's newest", () => {
    expect(priceOf("claude-fable-5-2")).toEqual(priceOf("claude-fable-5-1"))
    expect(priceOf("claude-haiku-6")).toEqual(priceOf("claude-haiku-5-5"))
    expect(priceOf("something-else")).toEqual(priceOf("claude-opus-5-5"))
  })
})
