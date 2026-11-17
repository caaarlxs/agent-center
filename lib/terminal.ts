// Sessions without Claude desktop (settings.sessions = "terminal"): the board
// wakes, opens and starts sessions with Claude Code's CLI instead of the app's
// claude:// links. A woken session runs `claude --resume <id>` in a tmux
// session of the board's own (its own socket, `tmux -L agent-center`, so the
// person's tmux is never touched), detached: nothing comes to the front. The
// bridge mod loads in it as in any session and delivers what waits, answers
// questions and approvals, and stops turns. "Open" attaches a Terminal window
// to that same tmux session, so there is still one process per transcript.
//
// When tmux cannot run the session (tmux missing, a folder Claude Code was
// never told to trust, which would hold the session on its trust question, or
// too many sessions alive already) the caller runs the turn headless instead
// (lib/deliver.ts), as it does when Claude desktop is at its cap.
//
// Sessions the board started and nobody uses are ended: no turn running,
// nothing waiting, no window attached, no Remote Control and no output for IDLE_MS. Their
// transcript stays; the next message starts them again.

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises"
import { join } from "node:path"
import { isBusy, status } from "./bridge"
import { HOME, MODES, STATE_DIR, settings } from "./config"
import { claudeBinary, running } from "./launch"
import { claudeEnv, exec } from "./proc"

const SOCKET = "agent-center"
const PREFIX = "s-"
const IDLE_MS = 30 * 60_000
const REAP_EVERY_MS = 60_000
// As many as Claude desktop keeps on a 16 GB Mac: past that the oldest idle
// one ends, or the turn runs headless.
const MAX_LIVE = 6
const SCRIPTS_DIR = join(STATE_DIR, "terminal")

const brewPath = `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`
export const tmuxPath = () => Bun.which("tmux", { PATH: brewPath })

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id)
const nameOf = (id: string) => `${PREFIX}${id}`
const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`

async function tmux(args: string[], timeoutMs = 5000) {
  const bin = tmuxPath()
  if (!bin) return { code: 127, stdout: "", stderr: "tmux is not installed" }
  return exec([bin, "-L", SOCKET, ...args], { timeoutMs, env: claudeEnv() })
}

type Live = { id: string; attached: boolean; activityAt: number }
export async function liveSessions(): Promise<Live[]> {
  const { code, stdout } = await tmux(["list-sessions", "-F", "#{session_name} #{session_attached} #{session_activity}"])
  if (code !== 0) return []
  return stdout
    .trim()
    .split("\n")
    .map(line => line.split(" "))
    .filter(([name]) => name?.startsWith(PREFIX))
    .map(([name, attached, activity]) => ({ id: name!.slice(PREFIX.length), attached: Number(attached) > 0, activityAt: Number(activity) * 1000 }))
}

export const isLive = async (id: string) => (await liveSessions()).some(s => s.id === id)

// Claude Code asks once per folder whether to trust it, and a session waits on
// that question before it does anything. Only the folder's own answer counts
// (~/.claude.json): a trusted parent folder does not spare the question.
export async function isTrusted(folder: string, claudeJson = join(HOME, ".claude.json")) {
  try {
    const projects = JSON.parse(await readFile(claudeJson, "utf8")).projects ?? {}
    return projects[folder]?.hasTrustDialogAccepted === true
  } catch {
    return false
  }
}

// Whether the session can be idle-ended: nothing running or waiting in it.
async function isIdle(id: string) {
  const b = await status(id)
  return !isBusy(b) && !b.pending && !b.question && !b.permission
}

// Ends the session nobody used for longest, to make room. False: none can go.
async function makeRoom() {
  const idle = (await liveSessions()).filter(s => !s.attached && !remote.has(s.id)).sort((a, b) => a.activityAt - b.activityAt)
  for (const s of idle) {
    if (!(await isIdle(s.id))) continue
    await tmux(["kill-session", "-t", nameOf(s.id)])
    remote.delete(s.id)
    console.log(`terminal: ended ${s.id} to make room`)
    return true
  }
  return false
}

export type Started = { ok: true } | { ok: false; reason: "no-tmux" | "untrusted" | "full" | "running" | "failed"; error?: string }

// Starts the session in tmux, detached, unless it runs there already.
// `args`: what follows `claude` (--resume <id>, or --session-id <id> for a new one).
async function start(id: string, folder: string, args: string[]): Promise<Started> {
  if (!tmuxPath()) return { ok: false, reason: "no-tmux" }
  if (running.has(id)) return { ok: false, reason: "running" }
  const live = await liveSessions()
  if (live.some(s => s.id === id)) return { ok: true }
  if (!(await isTrusted(folder))) return { ok: false, reason: "untrusted" }
  if (live.length >= MAX_LIVE && !(await makeRoom())) return { ok: false, reason: "full" }
  const claude = await claudeBinary()
  const res = await tmux(["new-session", "-d", "-s", nameOf(id), "-c", folder, "-x", "220", "-y", "50", "--", claude, ...args])
  if (res.code !== 0) return { ok: false, reason: "failed", error: res.stderr.trim() || "tmux could not start the session" }
  console.log(`terminal: started ${id} in ${folder}`)
  return { ok: true }
}

// Wakes a session so the bridge mod delivers what waits for it, in the
// permission mode it had: one in plan mode must not start editing on its own.
export function wake(id: string, folder: string, mode?: string | null) {
  if (!isId(id)) return Promise.resolve<Started>({ ok: false, reason: "failed", error: "not a session id" })
  return start(id, folder, ["--resume", id, ...(mode && MODES.includes(mode) ? ["--permission-mode", mode] : [])])
}

// iTerm, when it is installed: it opens .command files as Terminal does.
export const hasITerm = () => ["/Applications/iTerm.app", join(HOME, "Applications/iTerm.app")].some(p => existsSync(p))

// The app that shows the sessions the board opens (Setup → "Without Claude
// desktop"): Terminal, or iTerm when chosen and installed.
export const terminalApp = () => (settings.terminalApp === "iTerm" && hasITerm() ? "iTerm" : "Terminal")

// ---------- Commands typed in ----------
//
// A slash command written on the board (/compact, /clear, /model…): the
// bridge mod can only hand the session a prompt, and Claude Code drops a
// command that comes that way without a word. So the board types it into the
// session, as the person would, waking it first if it sleeps.

export type Typed = { ok: true } | { ok: false; error: string }

export async function typeInSession(id: string, folder: string, line: string, mode?: string | null): Promise<Typed> {
  if (!isId(id)) return { ok: false, error: "not a session id" }
  if (!(await isLive(id))) {
    const started = await wake(id, folder, mode)
    if (!started.ok) {
      const why = { "no-tmux": "tmux is not installed (Setup → Without Claude desktop)", untrusted: "Claude Code has not been told to trust this folder: open the session once, accept, and type the command there", full: "Too many sessions are running: end one first", running: "A turn runs here, headless: send the command when it ends", failed: started.error ?? "tmux could not start the session" }
      return { ok: false, error: why[started.reason] }
    }
    // Ready once the bridge mod beats in it: Claude Code has drawn its input.
    for (const end = Date.now() + 20_000; !(await status(id)).isOpen; await Bun.sleep(400))
      if (Date.now() > end) return { ok: false, error: "The session did not start in time: open it and type the command there" }
    await Bun.sleep(500)
  }
  if (isBusy(await status(id))) return { ok: false, error: "It is working: send the command when the turn ends" }
  await tmux(["send-keys", "-t", nameOf(id), "-l", line])
  await Bun.sleep(300)
  await tmux(["send-keys", "-t", nameOf(id), "Enter"])
  return { ok: true }
}

// A window of terminalApp() running `command`: the one place the board brings
// something to the front, and only when asked to open a session.
async function openWindow(name: string, command: string) {
  if (process.env.AGENT_CENTER_DRY_RUN) return true
  await mkdir(SCRIPTS_DIR, { recursive: true })
  const path = join(SCRIPTS_DIR, `${name}.command`)
  await writeFile(path, `#!/bin/zsh -l\n${command}\n`)
  await chmod(path, 0o755)
  return (await exec(["open", "-a", terminalApp(), path])).code === 0
}

// Shows the session in a Terminal window: attached to its tmux session, which
// starts first if it is not running. A folder not trusted yet, or no tmux:
// Claude Code runs in the window itself, where its trust question can be
// answered.
export async function open(id: string, folder: string): Promise<{ ok: boolean; error?: string }> {
  if (!isId(id)) return { ok: false, error: "not a session id" }
  if (running.has(id)) return { ok: false, error: "A turn runs here, headless: open it when it ends" }
  const started = await start(id, folder, ["--resume", id])
  if (started.ok) return { ok: await openWindow(nameOf(id), `exec ${quote(tmuxPath()!)} -L ${SOCKET} attach -t ${quote(nameOf(id))}`) }
  if (started.reason === "failed") return { ok: false, error: started.error }
  return { ok: await openWindow(nameOf(id), `cd ${quote(folder)} && exec ${quote(await claudeBinary())} --resume ${quote(id)}`) }
}

// A new session in `folder`, open in a Terminal window, with `prompt` typed
// in its input but not sent.
export async function openNew(folder: string, prompt: string) {
  const id = crypto.randomUUID()
  const started = await start(id, folder, ["--session-id", id])
  if (!started.ok) return openWindow(nameOf(id), `cd ${quote(folder)} && exec ${quote(await claudeBinary())} --session-id ${quote(id)}`)
  if (prompt) {
    // Typed once Claude Code draws its input box.
    await Bun.sleep(2500)
    await tmux(["send-keys", "-t", nameOf(id), "-l", prompt])
  }
  return openWindow(nameOf(id), `exec ${quote(tmuxPath()!)} -L ${SOCKET} attach -t ${quote(nameOf(id))}`)
}

// ---------- Rename ----------
//
// The session's own name (what `/rename` sets: the Claude app, claude.ai/code
// and `claude --resume` show it), typed into the running session as the
// person would. False when it is not running here or a turn runs.

export async function renameLive(id: string, title: string) {
  if (!isId(id) || !(await isLive(id)) || isBusy(await status(id))) return false
  await tmux(["send-keys", "-t", nameOf(id), "-l", `/rename ${title}`])
  await Bun.sleep(300)
  await tmux(["send-keys", "-t", nameOf(id), "Enter"])
  for (const end = Date.now() + 6000; Date.now() < end; await Bun.sleep(300))
    if ((await tmux(["capture-pane", "-p", "-J", "-t", nameOf(id)])).stdout.includes(`Session renamed to: ${title.slice(0, 40)}`)) return true
  return false
}

// ---------- Remote Control ----------
//
// Claude Code's Remote Control (`/remote-control`): the session can be used
// from the Claude app on a phone or at claude.ai/code as well. A sleeping
// session starts with `--remote-control`; in a running one the board types
// the command, as the person would. Claude Code writes the session's link on
// screen ("/remote-control is active · … https://claude.ai/code/session_…"),
// which the board reads and keeps here while the tmux session lives.
//
// The screen's history is no proof of the state (it is redrawn, and an old
// "disconnected" stays on it), so the board asks Claude Code itself: with
// `/remote-control` typed and not sent, its hint reads "Disconnect Remote
// Control" when it is on. Sent while on, the command opens a menu
// (Disconnect / Show QR code / Continue).

const remote = new Map<string, string>() // session → its claude.ai/code link
const LINK = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/g
const MENU = "Disconnect this session"
const ON_HINT = "Disconnect Remote Control"
const COMMAND = "/remote-control"

const keys = (id: string, ...k: string[]) => tmux(["send-keys", "-t", nameOf(id), ...k])
const screenOf = async (id: string) => (await tmux(["capture-pane", "-p", "-J", "-t", nameOf(id)])).stdout

// Waits up to `ms` for `test` to hold on the session's screen; what it saw, or null.
async function waitScreen(id: string, test: (screen: string) => boolean, ms = 12_000) {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(300)) {
    const screen = await screenOf(id)
    if (test(screen)) return screen
  }
  return null
}

export const lastLink = (screen: string) => screen.match(LINK)?.at(-1) ?? null

// Types the command and waits for its hint: whether Remote Control is on, and
// the screen then (its link, if shown). The command stays typed, not sent.
async function typeCommand(id: string) {
  await keys(id, "-l", COMMAND)
  const screen = await waitScreen(id, s => s.includes(ON_HINT) || s.includes("Control this session from"), 5000)
  return { isOn: !!screen?.includes(ON_HINT), screen: screen ?? "" }
}
const eraseCommand = (id: string) => keys(id, ...Array<string>(COMMAND.length + 2).fill("BSpace"))

// Whether Remote Control is on in the running session (asked as above).
async function probe(id: string) {
  const { isOn } = await typeCommand(id)
  await eraseCommand(id)
  return isOn
}

// The session's link while Remote Control is on, else null.
export async function remoteOf(id: string) {
  if (remote.has(id) && !(await isLive(id))) remote.delete(id)
  return remote.get(id) ?? null
}

export type Remote = { ok: true; url: string | null } | { ok: false; error: string }

// Turns Remote Control on: starts the session with it, or types it in.
export async function remoteOn(id: string, folder: string, mode?: string | null, name?: string | null): Promise<Remote> {
  if (!isId(id)) return { ok: false, error: "not a session id" }
  if (await isLive(id)) {
    if (isBusy(await status(id))) return { ok: false, error: "It is working: turn Remote Control on when the turn ends" }
    const { isOn } = await typeCommand(id)
    await keys(id, "Enter")
    // On already: the menu shows the link, and Esc (Continue) closes it.
    const screen = await waitScreen(id, s => s.includes(MENU) || (!isOn && s.includes("is active")))
    if (screen?.includes(MENU)) await keys(id, "Escape")
    if (!screen) return { ok: false, error: "Remote Control did not answer: open the session to see why" }
    await Bun.sleep(500)
    if (!(await probe(id))) return { ok: false, error: "Remote Control did not turn on: open the session to see why" }
    const url = lastLink(screen)
    remote.set(id, url ?? "")
    return { ok: true, url }
  }
  const started = await start(id, folder, ["--resume", id, ...(mode && MODES.includes(mode) ? ["--permission-mode", mode] : []), name ? `--remote-control=${name}` : "--remote-control"])
  if (!started.ok) {
    const why = { "no-tmux": "tmux is not installed (Setup → Without Claude desktop)", untrusted: "Claude Code has not been told to trust this folder: open the session once and accept", full: "Too many sessions are running: end one first", running: "A turn runs here, headless: try again when it ends", failed: started.error ?? "tmux could not start the session" }
    return { ok: false, error: why[started.reason] }
  }
  const url = lastLink((await waitScreen(id, s => s.includes("is active") && lastLink(s) !== null, 20_000)) ?? "")
  remote.set(id, url ?? "")
  return { ok: true, url }
}

// Turns Remote Control off: the command again, then Disconnect in its menu.
export async function remoteOff(id: string): Promise<Remote> {
  if (!isId(id)) return { ok: false, error: "not a session id" }
  if (!(await isLive(id))) return remote.delete(id), { ok: true, url: null }
  if (isBusy(await status(id))) return { ok: false, error: "It is working: turn Remote Control off when the turn ends" }
  const { isOn } = await typeCommand(id)
  if (!isOn) return await eraseCommand(id), remote.delete(id), { ok: true, url: null }
  await keys(id, "Enter")
  if (!(await waitScreen(id, s => s.includes(MENU), 6000))) return { ok: false, error: "Remote Control did not answer: open the session to see why" }
  // The menu opens on Continue, two rows below Disconnect.
  await keys(id, "Up", "Up")
  await Bun.sleep(200)
  await keys(id, "Enter")
  await Bun.sleep(800)
  if (await probe(id)) return { ok: false, error: "Remote Control is still on: open the session to turn it off there" }
  remote.delete(id)
  return { ok: true, url: null }
}

// Ends the sessions nobody used for IDLE_MS (see above).
async function reap() {
  const now = Date.now()
  for (const s of await liveSessions()) {
    if (s.attached || remote.has(s.id) || now - s.activityAt < IDLE_MS) continue
    if (!(await isIdle(s.id))) continue
    await tmux(["kill-session", "-t", nameOf(s.id)])
    remote.delete(s.id)
    console.log(`terminal: ended ${s.id}, idle for ${Math.round((now - s.activityAt) / 60_000)} min`)
  }
}

export function startReaping() {
  setInterval(() => void reap().catch(() => {}), REAP_EVERY_MS)
}
