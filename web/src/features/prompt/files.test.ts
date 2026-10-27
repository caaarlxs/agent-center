import { describe, expect, it } from "vitest"
import { fileName, sentFiles, withFiles } from "./files"

describe("withFiles", () => {
  it("leaves a message without files as it is", () => {
    expect(withFiles("hi", [])).toBe("hi")
  })

  it("names one image after the text", () => {
    expect(withFiles("look", ["/u/a.png"])).toBe("look\n\nAttached image (open it with Read): /u/a.png")
  })

  it("lists several files, any kind, with no text", () => {
    expect(withFiles("", ["/u/a.png", "/u/b.pdf"])).toBe("Attached files (open them with Read):\n- /u/a.png\n- /u/b.pdf")
  })
})

describe("sentFiles", () => {
  const up = "/Users/me/.claude/agent-center/uploads/abc-1"
  it("takes the files out of the line that names them", () => {
    const sent = sentFiles(withFiles("look", [`${up}/1700000000000-a1b2c3-shot.png`, `${up}/1700000000001-d4e5f6-notes.pdf`]))
    expect(sent).toEqual({ text: "look", images: ["abc-1/1700000000000-a1b2c3-shot.png"], files: ["abc-1/1700000000001-d4e5f6-notes.pdf"] })
  })

  it("leaves a message without files as it is", () => {
    expect(sentFiles("hola")).toEqual({ text: "hola", images: [], files: [] })
  })

  it("names a file as it was called", () => {
    expect(fileName("abc-1/1700000000001-d4e5f6-notes.pdf")).toBe("notes.pdf")
  })
})
