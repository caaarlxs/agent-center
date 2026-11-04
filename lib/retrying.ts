// A session whose turn waits on the API: Claude Code writes a row for each
// failed call it will try again ({ type: "system", subtype: "api_error",
// retryAttempt, maxRetries, retryInMs }), and the turn goes on once one
// answers. While such a row is the last one and its wait (with some slack)
// has not run out, the session is retrying, not stuck.

import { open, stat } from "node:fs/promises"
import type { Doing } from "./bridge"
import { transcriptPath } from "./transcript"

const TAIL = 32 * 1024
const SLACK_MS = 20_000 // the call after the wait may take a while to answer

export function retryOf(rows: any[], now: number): Doing | null {
  const last = rows.filter(r => !r?.isSidechain && (r?.type === "assistant" || r?.type === "user" || r?.type === "system")).at(-1)
  if (last?.type !== "system" || last.subtype !== "api_error" || typeof last.retryAttempt !== "number") return null
  const at = Date.parse(last.timestamp ?? "") || 0
  if (now - at > (Number(last.retryInMs) || 0) + SLACK_MS) return null
  return { kind: "retrying", attempt: last.retryAttempt, max: Number(last.maxRetries) || null }
}

// The rows at the end of a session's transcript (the last few kilobytes).
async function tailRows(sessionId: string): Promise<any[]> {
  const path = await transcriptPath(sessionId)
  if (!path) return []
  const { size } = await stat(path)
  const from = Math.max(0, size - TAIL)
  const handle = await open(path, "r")
  try {
    const buf = Buffer.alloc(size - from)
    await handle.read(buf, 0, buf.length, from)
    const lines = buf.toString("utf8").split("\n")
    if (from > 0) lines.shift()
    return lines.flatMap(l => {
      try {
        return l ? [JSON.parse(l)] : []
      } catch {
        return []
      }
    })
  } finally {
    await handle.close()
  }
}

export async function retryingOf(sessionId: string, now = Date.now()): Promise<Doing | null> {
  return retryOf(await tailRows(sessionId).catch(() => []), now)
}
