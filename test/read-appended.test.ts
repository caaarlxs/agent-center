import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readAppended } from "../lib/files"

const fileWith = async (text: string) => {
  const path = join(await mkdtemp(join(tmpdir(), "ac-read-")), "t.jsonl")
  await writeFile(path, text)
  return path
}
const linesOf = async (path: string, from: number, size: number) => {
  const lines: string[] = []
  const next = await readAppended(path, from, size, text => lines.push(...text.split("\n").filter(Boolean)))
  return { lines, next }
}

describe("readAppended", () => {
  test("hands whole lines, a line longer than a piece too", async () => {
    const long = JSON.stringify({ image: "x".repeat(3 * 1024 * 1024) })
    const text = `{"a":1}\n${long}\n{"b":2}\n`
    const { lines, next } = await linesOf(await fileWith(text), 0, text.length)
    expect(lines.map(l => JSON.parse(l)).map(o => Object.keys(o)[0])).toEqual(["a", "image", "b"])
    expect(next).toBe(text.length)
  })
  test("leaves a line still being written for the next time", async () => {
    const text = `{"a":1}\n{"b":`
    const { lines, next } = await linesOf(await fileWith(text), 0, text.length)
    expect(lines).toEqual(['{"a":1}'])
    expect(next).toBe(8)
  })
  test("leaves a long line still being written too", async () => {
    const text = `{"a":1}\n{"image":"${"x".repeat(2.5 * 1024 * 1024)}`
    const { lines, next } = await linesOf(await fileWith(text), 0, text.length)
    expect(lines).toEqual(['{"a":1}'])
    expect(next).toBe(8)
  })
})
