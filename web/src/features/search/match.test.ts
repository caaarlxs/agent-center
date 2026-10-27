import { describe, expect, it } from "vitest"
import { markedParts, plain, quoteOf, termsOf } from "./match"

describe("search hits", () => {
  it("keeps words of two letters or more", () => expect(termsOf("  a Deploy  to ")).toEqual(["deploy", "to"]))
  it("starts the quote shortly before the first match", () => {
    const text = "This is a long line with many words before the deploy happens tonight"
    expect(quoteOf(text, ["deploy"])).toBe("…words before the deploy happens tonight")
    expect(quoteOf("deploy now", ["deploy"])).toBe("deploy now")
  })
  it("marks the words, any case", () => expect(markedParts("Fix the Deploy", ["deploy"])).toEqual(["Fix the ", "Deploy", ""]))
  it("drops Markdown from titles", () => expect(plain("**Fix** `x` in [docs](http://a)")).toBe("Fix x in docs"))
})
