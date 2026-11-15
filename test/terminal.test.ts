import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isTrusted } from "../lib/terminal"

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
