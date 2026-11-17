import { describe, expect, test } from "bun:test"
import { isCommand } from "../lib/client"

describe("isCommand", () => {
  test("a command, with or without arguments", () => {
    for (const t of ["/compact", "/model sonnet", "/rename Mi sesión 🚀", "  /clear", "/plugin:do-it now", "/compact\n"]) expect(isCommand(t)).toBe(true)
  })
  test("not a command: a path, plain text, a lone slash", () => {
    for (const t of ["/Users/dmora/repo is slow", "/tmp/x.log", "please /compact", "/", "/ 1", "/123"]) expect(isCommand(t)).toBe(false)
  })
})
