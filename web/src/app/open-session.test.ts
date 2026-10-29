// Which files Changes leaves out, so the chat opens them in Files.
import { expect, it } from "vitest"
import { isNotes } from "./open-session"

it("tells Claude's notes and temporary files from the work", () => {
  expect(isNotes("/Users/x/.claude/projects/p/memory/a.md")).toBe(true)
  expect(isNotes("/tmp/out.txt")).toBe(true)
  expect(isNotes("/private/tmp/out.txt")).toBe(true)
  expect(isNotes("/Users/x/dev/repo/src/a.ts")).toBe(false)
})
