// What a session changed in files outside a git repository it works in: the
// original rebuilt from the file as it is now, undoing the session's edits.

import { expect, test } from "bun:test"
import { originalOf } from "../lib/session-changes"

test("undoes the session's edits, last first, to find the file as it was", () => {
  const now = "uno\nDOS\ntres\nCUATRO\n"
  const edits = [
    { kind: "edit" as const, old: "dos", new: "DOS", replaceAll: false },
    { kind: "edit" as const, old: "cuatro", new: "CUATRO", replaceAll: false },
  ]
  expect(originalOf(now, edits)).toBe("uno\ndos\ntres\ncuatro\n")
})

test("a file the session created was not there; one it rewrote was what the tool read", () => {
  expect(originalOf("nuevo\n", [{ kind: "create" }, { kind: "edit", old: "a", new: "b", replaceAll: false }])).toBe("")
  expect(originalOf("v3\n", [{ kind: "write", original: "v1\n" }, { kind: "edit", old: "v2", new: "v3", replaceAll: false }])).toBe("v1\n")
})

test("an edit someone undid since leaves the text as it is", () => {
  expect(originalOf("x\n", [{ kind: "edit", old: "a", new: "gone", replaceAll: false }])).toBe("x\n")
  expect(originalOf("b b\n", [{ kind: "edit", old: "a", new: "b", replaceAll: true }])).toBe("a a\n")
})
