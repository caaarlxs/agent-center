// How much memory the page and the server use, a line every 10 minutes
// (logs/memory.jsonl): the page sends its JavaScript heap, its DOM and its
// cards; the server adds its own footprint, as Activity Monitor counts it.
// To see what grows over a day. Capped: past MAX_BYTES the file starts again.

import { appendFile, mkdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { LOGS_DIR } from "./config"
import { exec } from "./proc"

const PATH = join(LOGS_DIR, "memory.jsonl")
const MAX_BYTES = 2 * 1024 * 1024
const MB = 1_000_000
const count = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null)

export type PageMemory = { heap?: unknown; nodes?: unknown; cards?: unknown; uptime?: unknown; view?: unknown }
export type ServerMemory = { footprint: number | null; rss: number }

export function lineOf(page: PageMemory, server: ServerMemory, at: number) {
  const heap = count(page.heap)
  const uptime = count(page.uptime)
  return `${JSON.stringify({
    at: new Date(at).toISOString(),
    page: { heapMB: heap === null ? null : Math.round(heap / MB), nodes: count(page.nodes), cards: count(page.cards), uptimeMin: uptime === null ? null : Math.round(uptime / 60_000), view: String(page.view ?? "").replace(/[^\w-]/g, "").slice(0, 20) },
    server: { footprintMB: server.footprint, rssMB: Math.round(server.rss / MB) },
  })}\n`
}

// The server's footprint in MB (macOS's `footprint`), null when it cannot tell.
async function footprint() {
  const { stdout } = await exec(["/usr/bin/footprint", "-p", String(process.pid)], { timeoutMs: 10_000 }).catch(() => ({ stdout: "" }))
  const mb = stdout.match(/phys_footprint: (\d+) MB/)?.[1]
  return mb ? Number(mb) : null
}

export async function logMemory(page: PageMemory) {
  await mkdir(LOGS_DIR, { recursive: true })
  if (((await stat(PATH).catch(() => null))?.size ?? 0) > MAX_BYTES) await writeFile(PATH, "")
  await appendFile(PATH, lineOf(page, { footprint: await footprint(), rss: process.memoryUsage().rss }, Date.now()))
}
