// The servers Claude desktop runs for its sessions (its "Servers" list: a
// session's preview_start, or one started from the menu). The app starts
// them itself, not the session's process, and their command lines do not
// name the session: only its log does, each time the list changes
// ("[Launch] Updating active servers store { count, servers: '[…]' }").
// The log is read once, then only what it adds; the last list stands.

import { stat } from "node:fs/promises"
import { DESKTOP_LOG } from "./config"
import { readAppended } from "./files"

export type AppServer = { hostId: string; name: string; port: number }

const MARK = "[Launch] Updating active servers store"
let offset = 0
let last: AppServer[] = []

function ingest(text: string) {
  for (const line of text.split("\n")) {
    if (!line.includes(MARK)) continue
    const raw = line.match(/servers: '(\[.*\])' \}/)?.[1]
    try {
      const list = JSON.parse(raw ?? "") as any[]
      // The browser pane counts as one, with no port.
      last = list.filter(s => s.status !== "stopped" && Number(s.port) > 0 && typeof s.sessionId === "string")
        .map(s => ({ hostId: s.sessionId, name: String(s.name ?? "server"), port: Number(s.port) }))
    } catch {} // a line cut short: the one before stands
  }
}

export async function appServers(): Promise<AppServer[]> {
  try {
    const { size } = await stat(DESKTOP_LOG)
    if (size < offset) (offset = 0), (last = []) // a new log
    offset = await readAppended(DESKTOP_LOG, offset, size, ingest)
  } catch {
    return []
  }
  return last
}
