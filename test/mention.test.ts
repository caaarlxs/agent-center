import { describe, expect, it } from "bun:test"
import { docWith } from "../lib/jira"

describe("docWith", () => {
  it("opens the comment with a mention of each person, so that Jira tells them", () => {
    const doc = docWith("Dos preguntas.", ["acc-1"])
    expect(doc.content[0]).toEqual({ type: "paragraph", content: [{ type: "mention", attrs: { id: "acc-1" } }, { type: "text", text: " " }] })
    expect(doc.content[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Dos preguntas." }] })
  })
  it("is the plain comment with nobody to tell", () => {
    expect(docWith("Hola", []).content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }])
  })
})
