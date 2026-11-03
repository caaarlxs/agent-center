import { describe, expect, it } from "vitest"
import { readComment } from "./comment"

describe("readComment", () => {
  it("tells the pipeline's comments, their title apart from their text", () => {
    expect(readComment("🤖 Agent Center · Refinamiento de PP-1\n\nAntes de implementar…")).toEqual({ isAgent: true, title: "Refinamiento de PP-1", text: "Antes de implementar…" })
  })
  it("leaves a person's comment as it is", () => {
    expect(readComment("Respuestas\n\nQ1 ok")).toEqual({ isAgent: false, title: null, text: "Respuestas\n\nQ1 ok" })
  })
})
