// Why a message or an answer would not reach a session, and a report of the
// whole setup to send to whoever helps: the board writes what a session gets
// into files the bridge mod reads from inside it (lib/bridge.ts), so all of it
// hangs on that mod running there, at a version that knows the request.

import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { status as bridgeStatus } from "./bridge"
import { APP_DIR, HOME, LOGS_DIR } from "./config"
import { readJson } from "./files"
import { freshness } from "./freshness"
import { APP_CLI } from "./launch"
import { latestState } from "./live"
import { exec, run } from "./proc"
import { PLUGIN, setupStatus } from "./setup"
import { groupOf } from "./snapshot"
import { transcriptPath } from "./transcript"

// How recent a session's activity must be to say its mod is missing (older:
// it may only be asleep), and how far its mod's last beat may trail it.
const RECENT_MS = 60 * 60_000
const BEAT_SLACK_MS = 30_000
const ERROR_LINES = 30

export type Blocker = "no-mod" | "old-mod" | null

// The mod's own protocol version, as its source says (bridge/hooks/register.ts).
export const MOD_PROTOCOL = Number(
  (await readFile(join(APP_DIR, "bridge", "hooks", "register.ts"), "utf8").catch(() => "")).match(/const VERSION = (\d+)/)?.[1] ?? 0,
)

// "no-mod": the session worked lately (its hook says so) but its mod gave no
// sign since: it runs without it (a Claude desktop too old for mods, or a
// session opened before the mod was installed). "old-mod": it runs an older
// one, which may not know what the board asks.
export function blockerOf(mod: { lastSeen: number | null; version: number }, activeAt: number | null, protocol: number, now: number): Blocker {
  if (activeAt !== null && now - activeAt < RECENT_MS && (mod.lastSeen === null || mod.lastSeen < activeAt - BEAT_SLACK_MS)) return "no-mod"
  if (mod.lastSeen !== null && mod.version < protocol) return "old-mod"
  return null
}

// The Claude Code version a session last ran with, from its transcript.
export async function cliVersionOf(id: string) {
  const path = await transcriptPath(id)
  if (!path) return null
  const size = (await stat(path)).size
  const file = Bun.file(path).slice(Math.max(0, size - 64 * 1024), size)
  return [...(await file.text()).matchAll(/"version":"(\d+\.\d+\.\d+)"/g)].at(-1)?.[1] ?? null
}

export async function blockerFor(id: string) {
  const group = groupOf(id)
  const [mod, cliVersion] = await Promise.all([bridgeStatus(id), cliVersionOf(group?.id ?? id)])
  return { blocker: blockerOf(mod, group?.lead.updated_at ?? null, MOD_PROTOCOL, Date.now()), cliVersion }
}

// ---------- the report ----------

const ago = (span: number, ms = Math.max(0, span)) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : ms < 5_400_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`)
const plain = (text: string) => text.replaceAll(HOME, "~")

async function enabledPlugin() {
  try {
    const value = (await readJson(join(HOME, ".claude", "settings.json"))).enabledPlugins?.[PLUGIN]
    return value === undefined ? "not listed" : String(value)
  } catch {
    return "unknown"
  }
}

// The log's last errors, each kind once with how many times (session ids and
// hosts left out, so the same failure reads as one line).
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
async function recentErrors() {
  const text = await readFile(join(LOGS_DIR, "server.log"), "utf8").catch(() => "")
  const counts = new Map<string, number>()
  for (const line of text.split("\n").filter(l => /error|could not|fail|refused/i.test(l)).slice(-500)) {
    const kind = plain(line).replace(UUID, "<id>").replace(/https?:\/\/localhost:\d+/g, "").trim()
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...counts].slice(-ERROR_LINES).map(([kind, n]) => (n > 1 ? `${kind} (×${n})` : kind))
}

// One session: its id, column, Claude Code, its mod's last beat, what waits
// for it and the problem, if any.
async function sessionLine(card: { id: string; column: string }, now: number) {
  const [mod, { blocker, cliVersion }] = await Promise.all([bridgeStatus(card.id), blockerFor(card.id)])
  const beat = mod.lastSeen === null ? "never ran" : `v${mod.version}, ${ago(now - mod.lastSeen)} ago`
  const waiting = [mod.pending && `${mod.pending} queued`, mod.stuck.length && `${mod.stuck.length} stuck`, mod.failed.length && `${mod.failed.length} refused`]
  return `  ${card.id.slice(0, 8)} · ${card.column} · ${cliVersion ?? "?"} · ${beat} · ${waiting.filter(Boolean).join(", ") || "-"} · ${blocker ?? "-"}`
}

// Everything that decides whether the board reaches the sessions, as text to
// paste in a message: no conversation, title or message text in it.
export async function report() {
  const now = Date.now()
  const [commit, macos, desktop, versions, setup, fresh, enabled, errors, state] = await Promise.all([
    run(["git", "-C", APP_DIR, "rev-parse", "--short", "HEAD"], APP_DIR),
    run(["/usr/bin/sw_vers", "-productVersion"], APP_DIR),
    run(["/usr/bin/defaults", "read", "/Applications/Claude.app/Contents/Info", "CFBundleShortVersionString"], APP_DIR),
    readdir(APP_CLI).catch(() => [] as string[]),
    setupStatus(),
    freshness({ fresh: true }),
    enabledPlugin(),
    recentErrors(),
    latestState(),
  ])
  const dirty = (await exec(["git", "-C", APP_DIR, "status", "--porcelain"], { timeoutMs: 5000 })).stdout.trim() ? " (with local changes)" : ""
  const lines = [
    "Agent Center report",
    `Board: ${commit ?? "?"}${dirty} · stale: ${[fresh.server && "server", fresh.hook && "hook", fresh.bridge && "mod"].filter(Boolean).join(", ") || "nothing"}`,
    `macOS ${macos ?? "?"} · Claude desktop ${desktop ?? "?"} · its Claude Code: ${versions.sort().join(", ") || "none found"}`,
    `Bridge mod: protocol ${MOD_PROTOCOL} · enabled: ${enabled}`,
    `Setup: ${setup.steps.map(s => `${s.id} ${s.state}${s.detail ? ` (${s.detail})` : ""}`).join(" · ")}`,
    "",
    "Sessions (id · column · Claude Code · mod · waiting · problem):",
  ]
  const cards = (state?.cards ?? []).filter(c => c.column !== "done").slice(0, 25)
  lines.push(...(await Promise.all(cards.map(c => sessionLine(c, now)))))
  lines.push("", `Last errors in the server's log (${errors.length}):`, ...errors.map(l => `  ${l}`))
  return lines.join("\n")
}
