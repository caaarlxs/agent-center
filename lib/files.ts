// Small file helpers shared by the readers of Claude Code's files and the
// writers of the server's own state.

import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

// Small pieces, two files at a time: when the board starts, every card's
// readers want their whole transcript at once, and Bun keeps the peak it
// reaches (8 MB pieces, all files together, came to gigabytes).
const CHUNK = 1024 * 1024
const READERS = 2
let reading = 0
const waiting: (() => void)[] = []
async function turn<T>(work: () => Promise<T>): Promise<T> {
  if (reading >= READERS) await new Promise<void>(go => waiting.push(go))
  reading++
  try {
    return await work()
  } finally {
    reading--
    waiting.shift()?.()
  }
}

export async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"))
}

// Written aside under a unique name, then renamed: a reader never sees half a
// file, and two writers never share a temp file.
export async function writeJsonAtomic(path: string, value: unknown, { pretty = false } = {}) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, pretty ? 2 : undefined))
  await rename(tmp, path)
}

// A string of its own: a match or a slice of a string keeps the whole string
// alive in Bun (JavaScriptCore), so one PR address kept from a piece of a
// transcript kept the whole piece (megabytes). Keep a copy instead.
export const own = (text: string) => Buffer.from(text, "utf8").toString("utf8")

// What a growing file (a transcript) added past `offset`, in whole lines,
// handed to `ingest` piece by piece; answers the offset to start from next
// time. A line still being written waits for the next call.
export async function readAppended(path: string, offset: number, size: number, ingest: (text: string) => void) {
  if (size <= offset) return offset
  return turn(() => readPieces(path, offset, size, ingest))
}

async function readPieces(path: string, offset: number, size: number, ingest: (text: string) => void) {
  const buf = Buffer.allocUnsafe(Math.min(CHUNK, size - offset)) // one buffer, reused piece after piece
  const long: Buffer[] = [] // the pieces of a line longer than one
  let at = offset
  const handle = await open(path, "r")
  try {
    while (at < size) {
      const { bytesRead } = await handle.read(buf, 0, Math.min(buf.length, size - at), at)
      if (bytesRead === 0) break
      const end = buf.subarray(0, bytesRead).lastIndexOf(0x0a) + 1
      if (end === 0) {
        long.push(Buffer.from(buf.subarray(0, bytesRead)))
        at += bytesRead
        continue
      }
      const piece = buf.subarray(0, end)
      ingest((long.length ? Buffer.concat([...long.splice(0), piece]) : piece).toString("utf8"))
      at += end
      offset = at // whole lines read up to here
    }
  } finally {
    await handle.close()
  }
  return offset
}
