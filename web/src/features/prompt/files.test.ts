import { describe, expect, it } from "vitest"
import { withFiles } from "./files"

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
