// Waking sleeping sessions so their messages arrive. The client keeps a
// session's process only while it is in use: it stops it after 30 idle
// minutes, or sooner under memory pressure ("CliGovernor ... evicting" in its
// log). A session without a process cannot run the bridge mod, so its messages
// wait. The client's own link (claude://code/continue) starts the process
// again; a link opened while the client still tidies up a process that just
// ended does nothing, so it is tried again every WAKE_EVERY_MS, up to WAKE_TRIES.
//
// The client skips the start when it no longer trusts the session's folder
// ("Skipping warm for local_<id> — workspace no longer trusted"): only the
// person can fix that, by opening the session in the client and accepting.
// It also skips it when it already runs as many sessions as the Mac's memory
// allows ("[CCD] Warming session local_<id>" then "[CliGovernor] at cap;
// yielding warm spawn"; 6 on a 16 GB Mac): a background start never goes
// past that cap, a message written in the client does. Then the board runs
// the turn itself (`deliver`, lib/deliver.ts) and says so.

import { open, stat } from "node:fs/promises"
import { isBusy, status, waitingSessions } from "./bridge"
import { DESKTOP_LOG } from "./config"
import { readDesktop } from "./desktop"
import { hostIdOf } from "./sessions"

const WAKE_EVERY_MS = 20_000
const WAKE_TRIES = 4
const LOOP_MS = 5000
const LOG = DESKTOP_LOG
const LOG_TAIL = 512 * 1024

// tries: links opened since the session went quiet; untrusted: the client
// refused to start it for its folder; atCap: it did not start it because it
// runs as many sessions as it allows (the last try).
export type WakeState = { tries: number; at: number; untrusted: boolean; atCap: boolean; isOver: boolean }
const wakes = new Map<string, WakeState>()

export function wakeState(id: string) {
  const w = wakes.get(id)
  return w ? { tries: w.tries, untrusted: w.untrusted, atCap: w.atCap, isOver: w.isOver } : null
}

// The client's log since `since`: did it refuse to start this session (its
// host ids), for its folder or for its cap?
async function refusal(hostIds: string[], since: number): Promise<{ untrusted: boolean; atCap: boolean }> {
  const none = { untrusted: false, atCap: false }
  try {
    const { size } = await stat(LOG)
    const handle = await open(LOG, "r")
    try {
      const length = Math.min(size, LOG_TAIL)
      const buf = Buffer.alloc(length)
      await handle.read(buf, 0, length, size - length)
      const lines = buf.toString("utf8").split("\n")
      const recent = (line: string) => Date.parse(line.slice(0, 19).replace(" ", "T")) >= since - 2000
      const out = { ...none }
      lines.forEach((line, i) => {
        if (!recent(line) || !hostIds.some(h => line.includes(h))) return
        if (line.includes("— workspace no longer trusted") && line.includes("Skipping warm for")) out.untrusted = true
        // The governor's answer follows the warm, without the session's id.
        if (line.includes("[CCD] Warming session") && lines.slice(i + 1, i + 4).some(l => l.includes("[CliGovernor] at cap; yielding warm spawn")))
          out.atCap = true
      })
      return out
    } finally {
      await handle.close()
    }
  } catch {
    return none
  }
}

type Activate = (id: string) => Promise<{ ok: boolean }>
type Deliver = (id: string) => Promise<boolean>

async function tick(activate: Activate, deliver: Deliver) {
  for (const id of await waitingSessions()) {
    const bridge = await status(id)
    if (!bridge.pending || bridge.isOpen || isBusy(bridge)) {
      wakes.delete(id)
      continue
    }
    const w = wakes.get(id) ?? { tries: 0, at: 0, untrusted: false, atCap: false, isOver: false }
    wakes.set(id, w)
    if (w.at && !w.untrusted) {
      const hostId = (await hostIdOf(id, await readDesktop())).hostId
      const found = await refusal([`local_${id}`, ...(hostId ? [hostId] : [])], w.at)
      w.untrusted = found.untrusted
      if (found.atCap) w.atCap = true
      if (w.atCap && !w.untrusted && (await deliver(id))) {
        wakes.delete(id)
        continue
      }
    }
    if (w.untrusted || w.tries >= WAKE_TRIES) {
      w.isOver = true
      continue
    }
    if (Date.now() - w.at < WAKE_EVERY_MS) continue
    w.tries++
    w.at = Date.now()
    await activate(id).catch(() => {})
  }
}

// A wake asked from the board ("Wake", or a message just sent) counts as a
// try and starts the count again.
export function wokeNow(id: string) {
  wakes.set(id, { tries: 1, at: Date.now(), untrusted: false, atCap: false, isOver: false })
}

export function startWaking(activate: Activate, deliver: Deliver) {
  let isRunning = false
  setInterval(async () => {
    if (isRunning) return
    isRunning = true
    try {
      await tick(activate, deliver)
    } finally {
      isRunning = false
    }
  }, LOOP_MS)
}
