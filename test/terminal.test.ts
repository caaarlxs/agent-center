import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isTrusted, lastLink, trust } from "../lib/terminal"

describe("isTrusted", () => {
  test("counts only the folder's own answer, not a trusted parent's", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ac-trust-"))
    const file = join(dir, ".claude.json")
    await writeFile(file, JSON.stringify({ projects: { "/r": { hasTrustDialogAccepted: true }, "/r/b": { hasTrustDialogAccepted: false } } }))
    expect(await isTrusted("/r", file)).toBe(true)
    expect(await isTrusted("/r/a", file)).toBe(false) // under a trusted folder: Claude Code still asks
    expect(await isTrusted("/r/b", file)).toBe(false)
  })

  test("is false without the file or with one it cannot read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ac-trust-"))
    expect(await isTrusted("/r", join(dir, "missing.json"))).toBe(false)
    await writeFile(join(dir, "bad.json"), "{")
    expect(await isTrusted("/r", join(dir, "bad.json"))).toBe(false)
  })
})

// What Claude Code 2.1 writes on screen for /remote-control (captured from a session).
describe("lastLink", () => {
  const on = (s: string) => `❯ /remote-control\n  /remote-control is active · Continue here, on your phone, or at https://claude.ai/code/session_${s}\n`
  test("reads the link Claude Code shows", () => {
    expect(lastLink(on("01Mm8TTcQ7rLSxW8Y2bGzCqN"))).toBe("https://claude.ai/code/session_01Mm8TTcQ7rLSxW8Y2bGzCqN")
  })
  test("takes the newest when it was turned on again", () => {
    expect(lastLink(on("01AAA") + "  ⎿  Remote Control disconnected.\n" + on("01BBB"))).toBe("https://claude.ai/code/session_01BBB")
  })
  test("reads it from the menu shown when it is on already", () => {
    expect(lastLink("   Remote Control\n   This session is available in the Claude mobile app and at https://claude.ai/code/session_01CCC.\n     Disconnect this session\n")).toBe("https://claude.ai/code/session_01CCC")
  })
  test("null when there is none", () => {
    expect(lastLink("❯ \n")).toBeNull()
  })
})

describe("trust", () => {
  test("marks a folder trusted, keeps the rest of the record and the file only yours", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ac-trust-"))
    const file = join(dir, ".claude.json")
    await writeFile(file, JSON.stringify({ userID: "x", projects: { "/a": { hasTrustDialogAccepted: true }, "/b": { allowedTools: ["Read"] } } }), { mode: 0o600 })
    expect(await trust("/b", file)).toBe(true)
    expect(await trust("/new", file)).toBe(true)
    const config = JSON.parse(await readFile(file, "utf8"))
    expect(config.userID).toBe("x")
    expect(config.projects["/b"]).toEqual({ allowedTools: ["Read"], hasTrustDialogAccepted: true })
    expect(config.projects["/a"].hasTrustDialogAccepted).toBe(true)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })
})
