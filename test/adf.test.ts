import { describe, expect, it } from "bun:test"
import { adfOf, inlineOf } from "../lib/adf"

describe("inlineOf", () => {
  it("bold, italics, code and links become marks; the rest stays text", () => {
    expect(inlineOf("**Contexto.** Ver `a.py` y [doc](https://x.io/p) en _staging_ o *prod*")).toEqual([
      { type: "text", text: "Contexto.", marks: [{ type: "strong" }] },
      { type: "text", text: " Ver " },
      { type: "text", text: "a.py", marks: [{ type: "code" }] },
      { type: "text", text: " y " },
      { type: "text", text: "doc", marks: [{ type: "link", attrs: { href: "https://x.io/p" } }] },
      { type: "text", text: " en " },
      { type: "text", text: "staging", marks: [{ type: "em" }] },
      { type: "text", text: " o " },
      { type: "text", text: "prod", marks: [{ type: "em" }] },
    ])
  })
  it("a lone asterisk or underscore is text", () => {
    expect(inlineOf("2 * 3 = snake_case")).toEqual([{ type: "text", text: "2 * 3 = snake_case" }])
  })
})

describe("adfOf", () => {
  it("paragraphs, lists, headings, rules and code as Jira's own blocks", () => {
    const doc = adfOf("**Qué pasa.**\n\n1. Uno\n2. Dos\n\n* CA1. Dado\n- CA2. Cuando\n\n## Para el pipeline\n\n---\n\n```py\nx = 1\n```\nfin")
    expect(doc.content.map(b => b.type)).toEqual(["paragraph", "orderedList", "bulletList", "heading", "rule", "codeBlock", "paragraph"])
    expect((doc.content[1] as any).content).toHaveLength(2)
    expect((doc.content[2] as any).content[1].content[0].content[0].text).toBe("CA2. Cuando")
    expect(doc.content[3]).toEqual({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Para el pipeline" }] })
    expect(doc.content[5]).toEqual({ type: "codeBlock", attrs: { language: "py" }, content: [{ type: "text", text: "x = 1" }] })
  })
  it("lines of one paragraph join; a blank line splits them", () => {
    expect(adfOf("una\ndos\n\ntres").content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "una dos" }] },
      { type: "paragraph", content: [{ type: "text", text: "tres" }] },
    ])
  })
})
