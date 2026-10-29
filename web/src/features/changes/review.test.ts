import { describe, expect, it, test } from "vitest"
import { changeFor, keyOf, reviewMessage } from "./review"

test("comments go as one message, by file and line, deleted lines marked", () => {
  const msg = reviewMessage(
    [
      { path: "b.ts", side: "new", no: 3, code: "const b = 2", text: "Use 3" },
      { path: "a.ts", side: "old", no: 9, code: "  old()", text: "Keep it\nplease" },
    ],
    "feat/x",
  )
  expect(msg).toBe(
    "Comments on your changes (branch feat/x):\n\n" +
      "1. `a.ts:9` (deleted line)\n   > old()\n   Keep it\n   please\n\n" +
      "2. `b.ts:3`\n   > const b = 2\n   Use 3\n\n" +
      "Apply these comments and tell me what you changed.",
  )
})

test("a comment's key names its file, side and line", () => {
  expect(keyOf({ path: "a.ts", side: "new", no: 4 })).toBe("a.ts:new:4")
})

describe("changeFor", () => {
  const files = [{ path: "src/a.ts" }, { path: "b.md" }]
  it("finds the changed file a conversation path names", () => {
    expect(changeFor(files, "/Users/x/repo/src/a.ts")).toEqual({ path: "src/a.ts" })
    expect(changeFor(files, "b.md")).toEqual({ path: "b.md" })
  })
  it("finds none for a file the diff lacks", () => {
    expect(changeFor(files, "/Users/x/repo/src/xa.ts")).toBeUndefined()
  })
})
