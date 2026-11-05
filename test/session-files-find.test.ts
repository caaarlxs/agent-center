import { describe, expect, test } from "bun:test"
import { endingIn, isListed, isMade } from "../lib/session-files"

describe("endingIn", () => {
  test("finds a file named by a path relative to a folder above the session's", () => {
    const paths = ["/Users/x/deale/compliance/iso/qalea/pendientes.html", "/Users/x/deale/compliance/iso/qalea/compliance/iso/qalea/pendientes.html", "/Users/x/other/pendientes.html"]
    expect(endingIn(paths, "compliance/iso/qalea/pendientes.html")).toEqual(paths.slice(0, 2))
    expect(endingIn(paths, "./qalea/pendientes.html")).toEqual(paths.slice(0, 2))
  })
  test("never for an absolute path, nor a part of a file's name", () => {
    expect(endingIn(["/a/b/c.md"], "/b/c.md")).toEqual([])
    expect(endingIn(["/a/bc.md"], "c.md")).toEqual([])
  })
})

describe("isListed", () => {
  test("lists what was sent or published, and the documents it wrote, never its code or notes", () => {
    expect(isListed({ path: "/r/a.ts", source: "sent", at: 0 })).toBe(true)
    expect(isListed({ path: "/r/pendientes.html", source: "written", at: 0 })).toBe(true)
    expect(isListed({ path: "/r/informe.pdf", source: "written", at: 0 })).toBe(true)
    expect(isListed({ path: "/r/src/app.ts", source: "written", at: 0 })).toBe(false)
    expect(isListed({ path: "/Users/x/.claude/projects/p/memory/a.md", source: "written", at: 0 })).toBe(false)
    expect(isListed({ path: "/tmp/out.md", source: "written", at: 0 })).toBe(false)
    expect(isListed({ path: "/r/notes.md", source: "mentioned", at: 0 })).toBe(false)
  })
})

describe("isMade", () => {
  test("lists a document the session only named when it changed around then or after: one a script made", () => {
    const named = { path: "/r/pendientes.html", source: "mentioned" as const, at: 1_000_000_000 }
    expect(isMade(named, named.at - 60_000)).toBe(true)
    expect(isMade(named, named.at + 3_600_000)).toBe(true)
    expect(isMade(named, named.at - 86_400_000)).toBe(false) // an old README it only quoted
    expect(isMade({ ...named, path: "/r/src/app.ts" }, named.at)).toBe(false)
  })
})
