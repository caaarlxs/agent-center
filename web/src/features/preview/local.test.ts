import { describe, expect, it } from "vitest"
import { frameUrl, localUrlOf } from "./local"

describe("localUrlOf", () => {
  it("is a page served on this machine, whole", () => {
    expect(localUrlOf("http://localhost:3000")).toBe("http://localhost:3000/")
    expect(localUrlOf("http://127.0.0.1:5173/app?x=1#top")).toBe("http://127.0.0.1:5173/app?x=1#top")
    expect(localUrlOf("https://localhost:8443/")).toBe("https://localhost:8443/")
    expect(localUrlOf("http://0.0.0.0:8000/docs")).toBe("http://localhost:8000/docs") // "every address": this machine
    expect(localUrlOf("http://[::1]:4000/")).toBe("http://[::1]:4000/")
  })
  it("reads an address typed without its scheme", () => {
    expect(localUrlOf("localhost:3000/login")).toBe("http://localhost:3000/login")
    expect(localUrlOf(" 127.0.0.1:8080 ")).toBe("http://127.0.0.1:8080/")
  })
  it("is nothing for a page elsewhere, a file or no address", () => {
    for (const no of ["https://github.com", "http://localhost.evil.com:3000", "http://example.com/?u=http://localhost:3000", "file:///etc/passwd", "javascript:alert(1)", "/Users/x/a.md", "", undefined])
      expect(localUrlOf(no)).toBeNull()
  })
})

describe("frameUrl", () => {
  it("is the page as it is when the board is open on the same machine", () => {
    expect(frameUrl("http://localhost:3000/a", "localhost")).toBe("http://localhost:3000/a")
    expect(frameUrl("http://localhost:3000/a", "127.0.0.1")).toBe("http://localhost:3000/a")
  })
  it("asks the board's machine when the board is open from another one", () => {
    expect(frameUrl("http://localhost:3000/a?b=1", "mini.local")).toBe("http://mini.local:3000/a?b=1")
  })
})
