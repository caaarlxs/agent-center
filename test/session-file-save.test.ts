import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isEditable, saveSessionFile } from "../lib/session-files"

describe("saveSessionFile", () => {
  test("writes a text file when nobody changed it since it was read", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "ac-save-")), "q.md")
    await writeFile(path, "[ ] Sí")
    const mtime = (await stat(path)).mtimeMs
    const res = await saveSessionFile({ path, ext: "md" }, "[x] Sí", mtime, false)
    expect(res.ok).toBe(true)
    expect(await readFile(path, "utf8")).toBe("[x] Sí")
  })
  test("refuses when it changed on disk, unless forced", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "ac-save-")), "q.md")
    await writeFile(path, "a")
    const res = await saveSessionFile({ path, ext: "md" }, "b", 1, false)
    expect(res).toMatchObject({ conflict: true, status: 409 })
    expect(await readFile(path, "utf8")).toBe("a")
    expect((await saveSessionFile({ path, ext: "md" }, "b", 1, true)).ok).toBe(true)
  })
  test("never writes a file that is not text", async () => {
    expect(isEditable("md")).toBe(true)
    expect(isEditable("csv")).toBe(true)
    expect(isEditable("docx")).toBe(false)
    expect(isEditable("png")).toBe(false)
    expect((await saveSessionFile({ path: "/tmp/x.docx", ext: "docx" }, "b", 1, true)).status).toBe(400)
  })
})
