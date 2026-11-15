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
// nothing waiting, no window attached and no output for IDLE_MS. Their
// transcript stays; the next message starts them again.

import { mkdir, readFile, writeFile, chmod } from "node:fs/promises"
import { join } from "node:path"
import { isBusy, status } from "./bridge"
import { HOME, MODES, STATE_DIR } from "./config"
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
  const idle = (await liveSessions()).filter(s => !s.attached).sort((a, b) => a.activityAt - b.activityAt)
  for (const s of idle) {
    if (!(await isIdle(s.id))) continue
    await tmux(["kill-session", "-t", nameOf(s.id)])
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

// A Terminal window (the person's default app for .command files) running
// `command`: the one place the board brings something to the front, and only
// when asked to open a session.
async function openWindow(name: string, command: string) {
  if (process.env.AGENT_CENTER_DRY_RUN) return true
  await mkdir(SCRIPTS_DIR, { recursive: true })
  const path = join(SCRIPTS_DIR, `${name}.command`)
  await writeFile(path, `#!/bin/zsh -l\n${command}\n`)
  await chmod(path, 0o755)
  return (await exec(["open", path])).code === 0
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

// Ends the sessions nobody used for IDLE_MS (see above).
async function reap() {
  const now = Date.now()
  for (const s of await liveSessions()) {
    if (s.attached || now - s.activityAt < IDLE_MS) continue
    if (!(await isIdle(s.id))) continue
    await tmux(["kill-session", "-t", nameOf(s.id)])
    console.log(`terminal: ended ${s.id}, idle for ${Math.round((now - s.activityAt) / 60_000)} min`)
  }
}

export function startReaping() {
  setInterval(() => void reap().catch(() => {}), REAP_EVERY_MS)
}
