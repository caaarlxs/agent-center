// Which version of the board runs (lib/version.ts): the commit its folder
// is at, or none when the folder is not a git clone.

import { afterAll, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { versionOf } from "../lib/version"

const dirs: string[] = []
const temp = async () => (dirs.push(await mkdtemp(join(tmpdir(), "ac-version-"))), dirs.at(-1)!)
afterAll(() => Promise.all(dirs.map(d => rm(d, { recursive: true, force: true }))))

test("names the commit the folder is at, with its date", async () => {
  const dir = await temp()
  const git = (...args: string[]) => Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args])
  git("init", "-q")
  await writeFile(join(dir, "a.txt"), "a\n")
  git("add", ".")
  git("commit", "-qm", "first")
  const head = new TextDecoder().decode(git("rev-parse", "--short=7", "HEAD").stdout).trim()
  const v = versionOf(dir)
  expect(v?.commit).toBe(head)
  expect(Number.isNaN(Date.parse(v!.date))).toBe(false)
})

test("says nothing outside a git clone", async () => {
  expect(versionOf(await temp())).toBeNull()
})
