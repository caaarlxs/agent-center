import { describe, expect, it } from "vitest"
import { indexOf, mayBePath, placeOf } from "./links"

const index = indexOf({ root: "/Users/ana/code/shop", files: ["backend/migrations/close.sql", "src/api.ts", "README.md"] })

describe("placeOf", () => {
  it("places a relative file and a line", () => {
    expect(placeOf("backend/migrations/close.sql", index)).toEqual({ path: "backend/migrations/close.sql", isDir: false })
    expect(placeOf("src/api.ts:42", index)).toEqual({ path: "src/api.ts", line: 42, isDir: false })
    expect(placeOf("src/api.ts:42:7", index)).toEqual({ path: "src/api.ts", line: 42, isDir: false })
    expect(placeOf("src/api.ts#L9", index)).toEqual({ path: "src/api.ts", line: 9, isDir: false })
    expect(placeOf("./README.md", index)).toEqual({ path: "README.md", isDir: false })
  })
  it("places a folder, with or without its slash", () => {
    expect(placeOf("backend/migrations/", index)).toEqual({ path: "backend/migrations", isDir: true })
    expect(placeOf("backend", index)).toEqual({ path: "backend", isDir: true })
  })
  it("places an absolute path inside the repository, and ~ as its home", () => {
    expect(placeOf("/Users/ana/code/shop/src/api.ts", index)).toEqual({ path: "src/api.ts", isDir: false })
    expect(placeOf("~/code/shop/README.md", index)).toEqual({ path: "README.md", isDir: false })
  })
  it("leaves out what is not in the tree: other folders, branches, words, files not written yet", () => {
    for (const text of ["/tmp/notes.md", "/Users/ana/code/shopping/src/api.ts", "main", "feature/ux-states", "src/new.ts", "two words.md"]) expect(placeOf(text, index)).toBeNull()
  })
})

describe("mayBePath", () => {
  it("asks for the tree only for text that looks like a path", () => {
    expect(mayBePath("backend/app.py")).toBe(true)
    expect(mayBePath("api.ts:42")).toBe(true)
    expect(mayBePath("README.md")).toBe(true)
    expect(mayBePath("main")).toBe(false)
    expect(mayBePath("npm run dev")).toBe(false)
  })
})
