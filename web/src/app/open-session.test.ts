// Which files Changes leaves out, so the chat opens them in Files.
import { expect, it } from "vitest"
import { beside, isNotes, opensBeside, openSession, showTab } from "./open-session"

it("tells Claude's notes and temporary files from the work", () => {
  expect(isNotes("/Users/x/.claude/projects/p/memory/a.md")).toBe(true)
  expect(isNotes("/tmp/out.txt")).toBe(true)
  expect(isNotes("/private/tmp/out.txt")).toBe(true)
  expect(isNotes("/Users/x/dev/repo/src/a.ts")).toBe(false)
})

it("opens a file beside the panel when the board has room, never from a workspace", () => {
  expect(opensBeside("chat", 900)).toBe(true)
  expect(opensBeside("prs", 420)).toBe(true)
  expect(opensBeside("chat", 300)).toBe(false)
  expect(opensBeside("files", 900)).toBe(false)
  expect(opensBeside("code", 900)).toBe(false)
})

it("closes the file beside when the panel changes session, closes or shows a workspace", () => {
  openSession("a")
  beside.set({ id: "a", path: "/x.md" })
  showTab("prs")
  expect(beside.get()).toEqual({ id: "a", path: "/x.md" })
  showTab("files")
  expect(beside.get()).toBeNull()
  beside.set({ id: "a", path: "/x.md" })
  openSession("b")
  expect(beside.get()).toBeNull()
  beside.set({ id: "b", path: "/x.md" })
  openSession(null)
  expect(beside.get()).toBeNull()
})
