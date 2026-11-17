import { describe, expect, test } from "bun:test"
import { sessionName } from "../lib/client"

// What `/rename` takes (Claude Code 2.1): one line, up to 200 characters, any text.
describe("sessionName", () => {
  test("keeps accents, emoji and symbols", () => {
    expect(sessionName("Prueba ñ áé 🚀 / test #1")).toBe("Prueba ñ áé 🚀 / test #1")
  })
  test("one line: new lines and runs of spaces become one space", () => {
    expect(sessionName("  uno\n dos\t\ttres  ")).toBe("uno dos tres")
  })
  test("at most 200 characters", () => {
    expect(sessionName("x".repeat(300))).toHaveLength(200)
  })
  test("empty stays empty", () => {
    expect(sessionName("   ")).toBe("")
  })
})
