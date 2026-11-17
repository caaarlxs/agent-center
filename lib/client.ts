// Acting on the Claude desktop app from the board, through its own links
// (claude://) and macOS: open or wake a session, start a new one, pick a
// folder. With settings.sessions = "terminal" the same actions go to Claude
// Code's CLI instead (lib/terminal.ts), and Claude desktop is never opened.

import { inTerminal } from "./config"
import { deliverHere } from "./deliver"
import { readDesktop } from "./desktop"
import { running } from "./launch"
import { exec } from "./proc"
import { hostIdOf } from "./sessions"
import { groupOf } from "./snapshot"
import * as terminal from "./terminal"

const CLAUDE_APP = "com.anthropic.claudefordesktop"

// The app in front, by bundle id (null when it cannot be told).
async function frontApp() {
  const asn = (await exec(["/usr/bin/lsappinfo", "front"], { timeoutMs: 2000 })).stdout.trim()
  if (!asn) return null
  const info = (await exec(["/usr/bin/lsappinfo", "info", "-only", "bundleid", asn], { timeoutMs: 2000 })).stdout
  return info.match(/"CFBundleIdentifier"="([^"]+)"/)?.[1] ?? null
}

// `background`: the app handles the link without coming to the front. `open
// -g` asks for that, but the app brings itself forward when it starts a
// session; when it does, the app that was in front comes back.
// AGENT_CENTER_DRY_RUN (the tests): nothing is opened, as if it worked.
async function openUrl(url: string, { background = false } = {}) {
  if (process.env.AGENT_CENTER_DRY_RUN) return true
  const before = background ? await frontApp() : null
  const ok = (await exec(["open", ...(background ? ["-g"] : []), url])).code === 0
  if (ok && before && before !== CLAUDE_APP) void giveFocusBack(before)
  return ok
}

// Watched for a few seconds: the app can come forward once for the link and
// again when the session starts.
const FOCUS_WATCH_MS = 8000
async function giveFocusBack(bundleId: string) {
  const until = Date.now() + FOCUS_WATCH_MS
  let given = 0
  while (Date.now() < until && given < 3) {
    await Bun.sleep(120)
    if ((await frontApp()) !== CLAUDE_APP) continue
    await exec(["open", "-b", bundleId])
    given++
    console.log(`focus given back to ${bundleId}`)
  }
}

const continueUrl = (hostId: string) => `claude://code/continue?${new URLSearchParams({ session: hostId, source: "desktop_action" })}`
const importUrl = (id: string) => `claude://resume?session=${encodeURIComponent(id)}`

// Starts a session's process without leaving the board, so the bridge mod
// delivers what waits: the client's own link, in the background (it does
// switch the session the client shows). A session the client never had is
// imported, which starts it too. lib/wake.ts tries again while messages wait.
// At most once every 15 s per session.
const activatedAt = new Map<string, number>()
export async function activate(id: string): Promise<{ ok: boolean; error?: string; again?: boolean; imported?: boolean; headless?: boolean }> {
  if (inTerminal()) return wakeInTerminal(id)
  if (running.has(id)) return { ok: false, error: "A turn runs here, headless: it moves to Claude when it ends" }
  if (Date.now() - (activatedAt.get(id) ?? 0) < 15_000) return { ok: true, again: true }
  activatedAt.set(id, Date.now())
  const { hostId } = await hostIdOf(id, await readDesktop())
  // Never in the client (started from here, or in a terminal): import it.
  // The client keeps the same session id, so its queued messages still apply.
  if (!hostId) return { ok: await openUrl(importUrl(id), { background: true }), imported: true }
  return { ok: await openUrl(continueUrl(hostId), { background: true }) }
}

// The session's folder: the board's group for it, else the hook's record.
async function folderOf(id: string) {
  return groupOf(id)?.lead.cwd ?? (await hostIdOf(id, await readDesktop())).cwd
}

// Terminal mode: the session starts in tmux and its bridge mod delivers. When
// tmux cannot run it (see lib/terminal.ts), what waits runs headless; the
// wake loop (lib/wake.ts) calls again for messages still in their undo window.
async function wakeInTerminal(id: string) {
  const folder = await folderOf(id)
  if (!folder) return { ok: false, error: "The board does not know this session's folder" }
  const started = await terminal.wake(id, folder, groupOf(id)?.lead.mode)
  if (started.ok) return { ok: true }
  if (started.reason === "running") return { ok: false, error: "A turn runs here, headless: messages go when it ends" }
  if (started.reason === "failed") return { ok: false, error: started.error }
  await deliverHere(id)
  return { ok: true, headless: true }
}

// After a turn the board ran headless (a new session, a fork, Start fresh):
// Claude desktop imports the session, so it shows there; in terminal mode it
// stays asleep until a message wakes it.
export async function adopt(id: string) {
  if (!inTerminal()) await activate(id)
}

// Shows the session in the app, in front (terminal mode: a Terminal window).
export async function openInClient(id: string): Promise<{ ok: boolean; error?: string }> {
  if (inTerminal()) {
    const folder = await folderOf(id)
    return folder ? terminal.open(id, folder) : { ok: false, error: "The board does not know this session's folder" }
  }
  const { hostId } = await hostIdOf(id, await readDesktop())
  if (hostId) return { ok: await openUrl(continueUrl(hostId)) }
  // Never opened in the app (a terminal or headless session): import it.
  if (running.has(id)) return { ok: false, error: "A turn runs here, headless: open it in Claude when it ends" }
  return { ok: await openUrl(importUrl(id)) }
}

// Remote Control (lib/terminal.ts): the session also usable from a phone or
// claude.ai/code. Only in terminal mode: Claude desktop has its own switch.
export async function remoteControl(id: string, on: boolean): Promise<terminal.Remote> {
  if (!inTerminal()) return { ok: false, error: "Turn on Setup → Without Claude desktop to switch Remote Control from here; in Claude desktop, use its own switch" }
  if (!on) return terminal.remoteOff(id)
  const folder = await folderOf(id)
  if (!folder) return { ok: false, error: "The board does not know this session's folder" }
  return terminal.remoteOn(id, folder, groupOf(id)?.lead.mode)
}

export const remoteLink = (id: string) => (inTerminal() ? terminal.remoteOf(id) : Promise.resolve(null))

// A new session in the app, in `folder`, with `prompt` written but not sent.
export async function newInClient(folder: string, prompt: string) {
  if (inTerminal()) return terminal.openNew(folder, prompt)
  const params = new URLSearchParams({ folder })
  if (prompt) params.set("q", prompt)
  return openUrl(`claude://code/new?${params}`)
}

// macOS's folder picker, in front of everything; null when cancelled.
export async function pickFolder() {
  const script = [
    'tell application "System Events"',
    "  activate",
    '  set picked to choose folder with prompt "Folder for the new session"',
    "end tell",
    "POSIX path of picked",
  ].join("\n")
  // Waits for the person: no timeout worth having.
  const { code, stdout } = await exec(["/usr/bin/osascript", "-e", script], { timeoutMs: 30 * 60_000 })
  const folder = stdout.trim().replace(/\/$/, "")
  return code === 0 && folder ? folder : null
}
