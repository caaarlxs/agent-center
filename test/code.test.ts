// The "Code" tab's files (lib/code.ts): the tree with git's status, reading
// only inside the repository, and saving only what nobody changed meanwhile.

import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { codeTree, marksOf, readCode, saveCode, searchCode, versionsOf } from "../lib/code"

let repo = ""
const git = (...args: string[]) => Bun.spawnSync(["git", "-C", repo, ...args], { env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } })

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "ac-code-"))
  await mkdir(join(repo, "src"))
  await writeFile(join(repo, "src", "a.ts"), "export const a = 1\n")
  await writeFile(join(repo, "README.md"), "# Repo\n")
  await writeFile(join(repo, ".gitignore"), "ignored.log\nlocal/\nnode_modules/\n")
  git("init", "-q")
  git("add", ".")
  git("commit", "-q", "-m", "first")
  await writeFile(join(repo, "src", "a.ts"), "export const a = 2\n") // modified
  await writeFile(join(repo, "src", "b.ts"), "export const b = 1\n") // new
  await writeFile(join(repo, "ignored.log"), "noise\n")
  await mkdir(join(repo, "local"))
  await writeFile(join(repo, "local", ".env"), "KEY=1\n")
  await mkdir(join(repo, "node_modules", "pkg"), { recursive: true })
  await writeFile(join(repo, "node_modules", "pkg", "index.js"), "noise\n")
  await writeFile(join(repo, "bin.dat"), Buffer.from([1, 0, 2]))
  await symlink("/etc/hosts", join(repo, "hosts-link"))
})
afterAll(() => rm(repo, { recursive: true, force: true }))

test("lists what git sees, with its status, and what it ignores apart", async () => {
  const tree = await codeTree(join(repo, "src"))
  expect(tree.isGit).toBe(true)
  expect(tree.files).toContain("src/a.ts")
  expect(tree.files).toContain("src/b.ts")
  expect(tree.files).toContain("ignored.log")
  expect(tree.ignored.sort()).toEqual(["ignored.log", "local/.env"])
  expect(tree.files.some(f => f.startsWith("node_modules/"))).toBe(false)
  expect(tree.status["src/a.ts"]).toBe("M")
  expect(tree.status["src/b.ts"]).toBe("U")
})

test("reads only inside the repository", async () => {
  expect((await readCode(repo, "src/a.ts")).text).toBe("export const a = 2\n")
  expect((await readCode(repo, "../../etc/hosts")).status).toBe(404)
  expect((await readCode(repo, "hosts-link")).status).toBe(404) // a link out of it
  expect((await readCode(repo, "bin.dat")).binary).toBe(true)
})

test("saves only what nobody changed since it was read", async () => {
  const read = await readCode(repo, "README.md")
  expect((await saveCode(repo, "README.md", "# Mine\n", read.mtime!, false)).ok).toBe(true)
  await Bun.sleep(20)
  await writeFile(join(repo, "README.md"), "# Claude's\n") // changed meanwhile
  const stale = await saveCode(repo, "README.md", "# Mine again\n", read.mtime!, false)
  expect(stale.conflict).toBe(true)
  expect(await readFile(join(repo, "README.md"), "utf8")).toBe("# Claude's\n")
  expect((await saveCode(repo, "README.md", "# Mine again\n", 0, true)).ok).toBe(true) // "Keep mine"
  expect(await readFile(join(repo, "README.md"), "utf8")).toBe("# Mine again\n")
})

test("searches the files git sees, new ones included", async () => {
  const { matches } = await searchCode(repo, "EXPORT CONST")
  expect(matches.map(m => m.path).sort()).toEqual(["src/a.ts", "src/b.ts"])
  expect(matches.find(m => m.path === "src/b.ts")).toEqual({ path: "src/b.ts", line: 1, text: "export const b = 1" })
  expect((await searchCode(repo, "EXPORT", { caseSensitive: true })).matches).toEqual([])
  expect((await searchCode(repo, "const [ab] = 2", { regex: true })).matches.map(m => m.path)).toEqual(["src/a.ts"])
  expect((await searchCode(repo, "noise")).matches).toEqual([]) // ignored by git
})

test("gives a changed file as it was and as it is", async () => {
  const v = await versionsOf(repo, "src/a.ts", null)
  expect(v.original).toBe("export const a = 1\n")
  expect(v.modified).toBe("export const a = 2\n")
  expect((await versionsOf(repo, "src/b.ts", null)).original).toBe("") // new
})

test("marks the lines changed since the branch started", async () => {
  await writeFile(join(repo, "src", "c.ts"), "one\ntwo\nthree\nfour\n")
  git("add", "src/c.ts")
  git("commit", "-q", "-m", "c")
  await writeFile(join(repo, "src", "c.ts"), "one\nTWO\nthree\nfour\nfive\n") // two changed, five added
  expect(await marksOf(repo, "src/c.ts")).toEqual([{ kind: "mod", from: 2, to: 2 }, { kind: "add", from: 5, to: 5 }])
  await writeFile(join(repo, "src", "c.ts"), "one\nfour\n") // two and three deleted
  expect(await marksOf(repo, "src/c.ts")).toEqual([{ kind: "del", from: 1, to: 1 }])
  expect(await marksOf(repo, "src/b.ts")).toEqual([{ kind: "add", from: 1, to: 1 }]) // new
  expect(await marksOf(repo, "../outside.ts")).toBeNull()
})
