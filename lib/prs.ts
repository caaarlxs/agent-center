// The GitHub pull requests a conversation mentions (created with `gh pr create`,
// linked in a reply...), newest mention first. Transcripts are append-only, so
// each pass reads only what was added since the last one.

import { stat } from "node:fs/promises"
import { own, readAppended } from "./files"
import { transcriptPath } from "./transcript"

const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g

const scans = new Map<string, { offset: number; seen: Map<string, number>; tick: number }>()

export async function prUrlsIn(sessionId: string, limit = 5): Promise<string[]> {
  const path = await transcriptPath(sessionId)
  if (!path) return []
  const { size } = await stat(path)
  let scan = scans.get(sessionId)
  if (!scan || size < scan.offset) {
    scan = { offset: 0, seen: new Map(), tick: 0 }
    scans.set(sessionId, scan)
  }
  const urls = scan
  scan.offset = await readAppended(path, scan.offset, size, text => {
    for (const url of text.match(PR_URL) ?? []) urls.seen.set(own(url), ++urls.tick)
  })
  return [...scan.seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([url]) => url)
}
