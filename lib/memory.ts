// What each session costs in memory: its `claude` process and everything it
// started (commands, dev servers, MCP servers), and what it started that
// outlived its process: a command launched with `( … &)` leaves the tree, and
// a session put to sleep leaves its commands running. Those are found by the
// session id in their command line (Claude Code's scratchpad path carries it).
// Memory is Activity Monitor's "Memory" column (compressed and swapped pages
// count), read with `top`. The board asks for it with every snapshot (each
// second while a page is open) and gets the last reading; a new one starts
// in the background when that is 20 s old.

import { HOME } from "./config"
import { exec } from "./proc"
import { killTree } from "./runner"

// How often it reads; and "forgotten": a command up this long, idle (no CPU)
// this long. The tests set them shorter (they would wait hours).
const EVERY_MS = Number(process.env.AGENT_CENTER_MEMORY_EVERY_MS ?? 20_000)
const FORGOTTEN_UP_MS = Number(process.env.AGENT_CENTER_FORGOTTEN_UP_MS ?? 2 * 3600_000)
const FORGOTTEN_IDLE_MS = Number(process.env.AGENT_CENTER_FORGOTTEN_IDLE_MS ?? 30 * 60_000)
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
const SHELLS = new Set(["zsh", "bash", "sh", "fish"])
const WRAPPERS = new Set(["safe-chain", "env", "nohup", "caffeinate", "time", "exec"])

export type MemoryItem = {
  pid: number
  kind: "session" | "command" | "mcp"
  label: string
  command: string // the first process's own command line, to match a background task
  cwd: string | null
  bytes: number
  since: number
  isDetached: boolean // left the session's process (the session may be asleep)
  idleSince: number | null // since when it (with its children) has used no CPU
  isForgotten: boolean // up for hours and idle for a while: likely left behind
}
export type SessionMemory = { total: number; items: MemoryItem[] }
export type Pressure = "normal" | "warning" | "critical"

type Row = { pid: number; ppid: number; since: number; cpu: number; command: string }

// CPU time used so far, per item (by its first pid), and since when it has
// not grown: a server nobody uses takes no CPU between two readings.
const cpuSeen = new Map<number, { cpu: number; idleSince: number | null }>()

// ps's TIME, "1:02:03.45" or "02:03.45" → seconds.
function cpuOf(time: string) {
  return time.split(":").reverse().reduce((sum, part, i) => sum + Number(part) * 60 ** i, 0) || 0
}

let latest: { at: number; bySession: Map<string, SessionMemory>; pressure: Pressure } = { at: 0, bySession: new Map(), pressure: "normal" }
let running: Promise<void> | null = null

// "1-02:03:04", "02:03:04", "03:04" → when it started.
function sinceOf(etime: string, now: number) {
  const [days, rest] = etime.includes("-") ? etime.split("-") : ["0", etime]
  const parts = rest!.split(":").map(Number).reverse()
  const secs = (parts[0] ?? 0) + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) * 3600 + Number(days) * 86400
  return now - secs * 1000
}

// top's "MEM": 1400M, 26K, 2.6G, 512B (a trailing + or - is a trend).
function bytesOf(text: string) {
  const m = text.match(/^([\d.]+)([BKMGT])/)
  if (!m) return 0
  return Number(m[1]) * { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[m[2] as "B"]
}

const base = (word: string) => word.split("/").pop() ?? word

// A process as a person reads it: "pnpm dev", "python keepawake.py --interval 60".
function readable(command: string) {
  const words = command.split(/\s+/).filter(Boolean)
  while (words.length > 1 && WRAPPERS.has(base(words[0]!))) words.shift()
  const first = base(words[0] ?? "")
  // node /…/node_modules/.bin/../next/dist/bin/next dev → next dev
  if ((first === "node" || first === "bun") && words[1]?.includes("/")) {
    const script = words[1].match(/node_modules\/(?:\.bin\/\.\.\/)?(@?[\w.-]+(?:\/[\w.-]+)?)/)?.[1]
    return [script ? base(script) : base(words[1]), ...words.slice(2)].join(" ").slice(0, 80)
  }
  return [first, ...words.slice(1).map(w => (w.startsWith("/") && w.length > 30 ? base(w) : w))].join(" ").slice(0, 80)
}

async function scan(sessionIds: Set<string>) {
  const now = Date.now()
  const [ps, top, level] = await Promise.all([
    exec(["/bin/ps", "-axww", "-o", "pid=,ppid=,etime=,time=,command="], { timeoutMs: 5000 }),
    exec(["/usr/bin/top", "-l", "1", "-stats", "pid,mem"], { timeoutMs: 8000 }),
    exec(["/usr/sbin/sysctl", "-n", "kern.memorystatus_vm_pressure_level"], { timeoutMs: 2000 }),
  ])
  const rows = new Map<number, Row>()
  for (const line of ps.stdout.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/)
    if (m) rows.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), since: sinceOf(m[3]!, now), cpu: cpuOf(m[4]!), command: m[5]! })
  }
  const mem = new Map<number, number>()
  for (const line of top.stdout.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\S+)\s*$/)
    if (m) mem.set(Number(m[1]), bytesOf(m[2]!))
  }
  const kids = new Map<number, number[]>()
  for (const r of rows.values()) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r.pid])
  const tree = (pid: number): number[] => [pid, ...(kids.get(pid) ?? []).flatMap(tree)]
  const claimed = new Set<number>()

  // A process and its children as one item, named after its first process
  // that is not a shell (Claude Code wraps each command in `zsh -c`).
  const item = (pid: number, kind: MemoryItem["kind"], isDetached: boolean): MemoryItem => {
    const pids = tree(pid).filter(p => !claimed.has(p))
    pids.forEach(p => claimed.add(p))
    const named = pids.map(p => rows.get(p)!).find(r => r && !SHELLS.has(base(r.command.split(/\s+/)[0] ?? ""))) ?? rows.get(pid)!
    const label = readable(named.command)
    const realKind = kind === "command" && /\bmcp\b|mcp-server|modelcontextprotocol/i.test(named.command) ? "mcp" : kind
    // Idle: its CPU time (with its children's) has not grown since last time.
    const cpu = pids.reduce((sum, p) => sum + (rows.get(p)?.cpu ?? 0), 0)
    const seen = cpuSeen.get(pid)
    const idleSince = seen && cpu - seen.cpu < 0.05 ? (seen.idleSince ?? now) : null
    cpuSeen.set(pid, { cpu, idleSince })
    const since = rows.get(pid)!.since
    return {
      pid, kind: realKind, label, command: rows.get(pid)!.command.slice(0, 3000), cwd: null,
      bytes: pids.reduce((sum, p) => sum + (mem.get(p) ?? 0), 0), since, isDetached, idleSince,
      isForgotten: realKind === "command" && now - since > FORGOTTEN_UP_MS && idleSince !== null && now - idleSince > FORGOTTEN_IDLE_MS,
    }
  }

  const bySession = new Map<string, SessionMemory>()
  const add = (id: string, it: MemoryItem) => {
    const s = bySession.get(id) ?? { total: 0, items: [] }
    s.items.push(it)
    s.total += it.bytes
    bySession.set(id, s)
  }
  // The session's own process, and what it started.
  for (const r of rows.values()) {
    if (base(r.command.split(" --")[0]!.trim()) !== "claude") continue
    const id = r.command.match(/--(?:resume|session-id)[= ]([0-9a-f-]{36})/)?.[1]
    // Only the board's own sessions: a board started for the tests must
    // never count (or stop) what the person's sessions run.
    if (!id || !sessionIds.has(id)) continue
    claimed.add(r.pid)
    add(id, { pid: r.pid, kind: "session", label: "Claude (the session)", command: "", cwd: null, bytes: mem.get(r.pid) ?? 0, since: r.since, isDetached: false, idleSince: null, isForgotten: false })
    for (const child of kids.get(r.pid) ?? []) add(id, item(child, "command", false))
  }
  // What outlived it: the topmost process naming a known session. The
  // desktop app's wrapper around a session (its parent) names it too.
  const sessionPids = new Set(claimed)
  for (const r of rows.values()) {
    if (claimed.has(r.pid) || (kids.get(r.pid) ?? []).some(k => sessionPids.has(k))) continue
    const id = [...r.command.matchAll(UUID)].map(m => m[0]).find(u => sessionIds.has(u))
    const parent = rows.get(r.ppid)
    if (!id || (parent && !claimed.has(parent.pid) && parent.command.includes(id))) continue
    add(id, item(r.pid, "command", true))
  }

  // Where each command runs (one lsof for all).
  const items = [...bySession.values()].flatMap(s => s.items).filter(i => i.kind !== "session")
  if (items.length) {
    const out = await exec(["/usr/sbin/lsof", "-a", "-d", "cwd", "-Fn", "-p", items.map(i => i.pid).join(",")], { timeoutMs: 4000 })
    const cwd = new Map<number, string>()
    let pid = 0
    for (const line of out.stdout.split("\n")) {
      if (line.startsWith("p")) pid = Number(line.slice(1))
      else if (line.startsWith("n")) cwd.set(pid, line.slice(1).replace(HOME, "~"))
    }
    for (const i of items) i.cwd = cwd.get(i.pid) ?? null
  }
  for (const s of bySession.values()) s.items.sort((a, b) => b.bytes - a.bytes)
  const pressure: Pressure = level.stdout.trim() === "4" ? "critical" : level.stdout.trim() === "2" ? "warning" : "normal"
  const live = new Set([...bySession.values()].flatMap(s => s.items.map(i => i.pid)))
  for (const pid of cpuSeen.keys()) if (!live.has(pid)) cpuSeen.delete(pid)
  latest = { at: now, bySession, pressure }
}

// For a card: its sessions' memory together (a desktop session can run
// several CLI sessions over time).
export function memoryOf(ids: string[]): SessionMemory | null {
  const parts = ids.map(id => latest.bySession.get(id)).filter((s): s is SessionMemory => !!s)
  if (!parts.length) return null
  const items = parts.flatMap(s => s.items).sort((a, b) => b.bytes - a.bytes)
  return { total: items.reduce((sum, i) => sum + i.bytes, 0), items }
}

// The last reading; a new one starts in the background when it is old.
export function memoryNow(sessionIds: Set<string>) {
  if (Date.now() - latest.at > EVERY_MS && !running) running = scan(sessionIds).catch(() => {}).finally(() => (running = null))
  return latest
}

// Read again now and wait for it (after a Stop).
export async function rescan(sessionIds: Set<string>) {
  await (running ?? Promise.resolve())
  running = scan(sessionIds).catch(() => {}).finally(() => (running = null))
  await running
}

// Stop one thing a session started, and only that: never the session itself.
export async function stopProcess(sessionIds: string[], pid: number) {
  const found = sessionIds.map(id => latest.bySession.get(id)).flatMap(s => s?.items ?? []).find(i => i.pid === pid)
  if (!found || found.kind === "session") return false
  // The reading may be 20 s old: the process must still be the same one,
  // not another that got its number since.
  const now = await exec(["/bin/ps", "-ww", "-o", "command=", "-p", String(pid)], { timeoutMs: 3000 })
  if (now.stdout.trim().slice(0, 3000) !== found.command.trim()) return false
  await killTree(pid)
  return true
}

// Put a session to sleep: its own `claude` process gets SIGINT, as Claude
// desktop does when it pauses an idle one (its log reads "query iterator
// completed", not an error), and its link wakes it again. A fresh reading
// first: the process must still be that session's. Answers whether one went.
export async function sleepSession(sessionIds: string[], known: Set<string>) {
  await rescan(known)
  let slept = false
  for (const i of sessionIds.flatMap(id => latest.bySession.get(id)?.items ?? [])) {
    if (i.kind !== "session") continue
    try {
      process.kill(i.pid, "SIGINT")
      slept = true
    } catch {} // ended meanwhile
  }
  return slept
}

// Every command left running and forgotten (see isForgotten), stopped at
// once; each is checked again before it goes. Answers how many went.
export async function stopForgotten() {
  let stopped = 0
  for (const [id, s] of latest.bySession)
    for (const i of s.items) if (i.isForgotten && (await stopProcess([id], i.pid))) stopped++
  return stopped
}
