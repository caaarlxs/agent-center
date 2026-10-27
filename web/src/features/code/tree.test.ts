import { expect, test } from "vitest"
import { changedFolders, parentsOf, rankFiles, treeOf } from "./tree"

test("paths become folders and files, each folder with its path", () => {
  const root = treeOf(["README.md", "src/a.ts", "src/lib/b.ts"])
  expect(root.files).toEqual(["README.md"])
  const src = root.dirs.get("src")!
  expect(src.path).toBe("src")
  expect(src.files).toEqual(["src/a.ts"])
  expect(src.dirs.get("lib")!.path).toBe("src/lib")
})

test("the folders above a path", () => {
  expect(parentsOf("a/b/c.ts")).toEqual(["a", "a/b"])
  expect(parentsOf("c.ts")).toEqual([])
})

test("folders holding a changed file", () => {
  expect([...changedFolders({ "src/lib/b.ts": "M", "x.md": "U" })].sort()).toEqual(["src", "src/lib"])
})

test("go to file: letters in order, the name first, then the shortest", () => {
  const paths = ["src/feature/readme-util.ts", "README.md", "docs/read.md", "lib/other.ts"]
  expect(rankFiles(paths, "readme")).toEqual(["README.md", "src/feature/readme-util.ts"])
  expect(rankFiles(paths, "rdm")).toEqual(["README.md", "docs/read.md", "src/feature/readme-util.ts"]) // same rank: the shortest first
  expect(rankFiles(paths, "zzz")).toEqual([])
})
