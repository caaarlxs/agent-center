// What still runs old code after a `git pull` (lib/freshness.ts): a folder's
// print changes when one of its files does, and only then.

import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { printOf } from "../lib/freshness"

let root = ""
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ac-fresh-"))
  await mkdir(join(root, "lib"))
  await writeFile(join(root, "lib", "a.ts"), "export const a = 1\n")
  await writeFile(join(root, "notes.md"), "not code\n")
})
afterAll(() => rm(root, { recursive: true, force: true }))

test("a folder's print changes when one of its files does", async () => {
  const before = await printOf(root, ["lib/**/*.ts"])
  expect(await printOf(root, ["lib/**/*.ts"])).toBe(before)
  await writeFile(join(root, "notes.md"), "still not code, changed\n")
  expect(await printOf(root, ["lib/**/*.ts"])).toBe(before) // not one of its files
  await Bun.sleep(10)
  await writeFile(join(root, "lib", "a.ts"), "export const a = 2 // pulled\n")
  expect(await printOf(root, ["lib/**/*.ts"])).not.toBe(before)
  await writeFile(join(root, "lib", "b.ts"), "export const b = 1\n")
  const withNew = await printOf(root, ["lib/**/*.ts"])
  await rm(join(root, "lib", "b.ts"))
  expect(await printOf(root, ["lib/**/*.ts"])).not.toBe(withNew) // a file gone counts too
})
