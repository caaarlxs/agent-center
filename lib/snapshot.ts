// The board as the page shows it: every session grouped into one card (one
// desktop session runs several CLI sessions over its life), with its column,
// what it waits for, its PRs, usage, tasks and the bridge mod's state.

import { stat } from "node:fs/promises"
import { HOME } from "./config"
import { backgroundOf } from "./background"
import { board, itemOf, keepAcrossAccounts, type BoardItem } from "./board"
import { doingOf, status as bridgeStatus, type Limits, type Permission } from "./bridge"
import { canRunCommands } from "./commands"
import { freshness } from "./freshness"
import { memoryNow, memoryOf } from "./memory"
import { readDesktop, type DesktopIndex } from "./desktop"
import { lookup as prLookup, type Pr } from "./github"
import { running } from "./launch"
import { readTasks } from "./organizer"
import { progressOf } from "./plan"
import { prUrlsIn } from "./prs"
import { repoInfo } from "./repo"
import { writtenSince } from "./session-files"
import { isOrganizerOn } from "./setup"
import { summary as runSummary } from "./runner"
import { cleanPrompt, readSessions, type Session } from "./sessions"
import { refreshLinks, sessionOf } from "./task-links"
import { isInterrupted, transcriptPath } from "./transcript"
import { folderSize } from "./uploads"
import { usageOf } from "./usage"
import { version } from "./version"
import { wakeState } from "./wake"

const QUIET_MS = 10 * 60_000 // "working" with an untouched transcript for this long: stopped
const MAX_AGE_MS = 30 * 24 * 3600_000
const DONE_SHOWN = 30
const NO_PR_BRANCHES = new Set(["main", "master", "develop", "HEAD"])

export type Column = "asking" | "review" | "working" | "pending" | "parked" | "done" | "archived"

// One desktop session runs several CLI sessions over its life: the app gives
// the process a new id when it restarts it. They are one card, led by the id
// the app runs now; its manual state lives under the desktop id.
export type Group = {
  key: string // board key: the desktop id, else the CLI id
  id: string // the CLI id the card, reader and bridge use
  ids: string[] // every CLI id of the group
  lead: Session // the newest hook record
  root: string
  branch: string | null
}
let groups = new Map<string, Group>() // any CLI id → its group, as of the last snapshot

export const groupOf = (id: string) => groups.get(id)
export const knownSessionIds = () => new Set(groups.keys())

function groupSessions(sessions: Session[], desktop: DesktopIndex) {
  const byKey = new Map<string, Session[]>()
  for (const s of sessions) {
    const key = s.host_session_id ?? desktop.byCli.get(s.session_id)?.hostId ?? s.session_id
    byKey.set(key, [...(byKey.get(key) ?? []), s])
  }
  return [...byKey].map(([key, list]) => {
    list.sort((a, b) => b.updated_at - a.updated_at)
    const app = desktop.byHost.get(key)
    const ids = [...new Set([...(app?.cliId ? [app.cliId] : []), ...list.map(s => s.session_id)])]
    return { key, app, lead: list[0]!, id: app?.cliId ?? list[0]!.session_id, ids }
  })
}

function columnOf(session: Session, item: BoardItem, isArchived: boolean, isWorking: boolean, now: number): Column {
  if (item.archived_at && item.archived_at >= session.updated_at) return "archived"
  if (isArchived) return "done"
  if (item.done_at && item.done_at >= session.updated_at) return "done"
  if (item.parked_at && item.parked_at >= session.updated_at && (!item.parked_until || item.parked_until > now)) return "parked"
  if (session.state === "asking" || session.state === "permission") return "asking"
  if (session.state === "working" && isWorking) return "working"
  // Seen since its last change: in the queue, no longer news.
  return (item.seen_at ?? board.seenEpoch ?? 0) >= session.updated_at ? "pending" : "review"
}

// What runs in the background now: read live from the transcript (a launch
// shows at once), checked against the hook's list from the last turn's end:
// what started before that end and is not on the list has ended (or died with
// a restart). The hook's own entries count too. Monitors only watch: not shown.
async function liveBackground(id: string, s: Session) {
  const fromHook = (s.background ?? []).filter(t => t.type !== "monitor")
  const listed = new Set(fromHook.map(t => t.id))
  const live = (await backgroundOf(id).catch(() => [])).filter(
    t => t.type !== "monitor" && (listed.has(t.id) || t.since > (s.background_at ?? 0)),
  )
  const seen = new Set(live.map(t => t.id))
  return [...live, ...fromHook.filter(t => !seen.has(t.id))]
}

// The PRs a group of CLI sessions touches: its branch's own and every one its
// conversations mention, newest mention first.
export async function prRefs(ids: string[], root: string, branch: string | null) {
  const refs: { key: string; ref: string; cwd: string }[] = []
  if (branch && !NO_PR_BRANCHES.has(branch)) refs.push({ key: `${root}#${branch}`, ref: branch, cwd: root })
  for (const id of ids) for (const url of await prUrlsIn(id, 20).catch(() => [])) refs.push({ key: url, ref: url, cwd: HOME })
  return refs
}

// A card shows open PRs only: a merged or closed one is done with.
function openPrs(refs: { key: string; ref: string; cwd: string }[]): Pr[] {
  const unique = new Map<string, Pr>()
  for (const r of refs) {
    const pr = prLookup(r.key, r.ref, r.cwd)
    if (pr?.state === "OPEN" && !unique.has(pr.url)) unique.set(pr.url, pr)
  }
  return [...unique.values()].slice(0, 4)
}

// The plan's limits are the account's: the freshest reading of any session.
// Some sessions (Opus ones, it seems) read only a weekly window, with another
// value: a reading with the 5-hour window wins while it is under 30 minutes
// old, so the two bars never jump between sources.
function accountLimits(readings: (Limits | null)[]) {
  const all = readings.filter((r): r is Limits => !!r?.windows?.length).sort((a, b) => b.at - a.at)
  const full = all.find(r => r.windows.some(w => w.kind === "five_hour"))
  return full && Date.now() - full.at < 30 * 60_000 ? full : (all[0] ?? null)
}

// What a tool approval asks, in one line: the tool and what it would do.
function permissionText(p: Permission) {
  const what = p.input.command ?? p.input.file_path ?? p.input.url ?? p.input.description ?? ""
  return `Allow ${p.tool}${what ? `: ${String(what).replace(/\s+/g, " ").slice(0, 200)}` : ""}`
}

async function transcriptMtime(sessionId: string) {
  const path = await transcriptPath(sessionId)
  return path ? ((await stat(path).catch(() => null))?.mtimeMs ?? null) : null
}

async function cardOf(
  { key, app, lead, id, ids }: ReturnType<typeof groupSessions>[number],
  desktop: DesktopIndex,
  tasks: Awaited<ReturnType<typeof readTasks>>,
  next: Map<string, Group>,
  now: number,
) {
  // A desktop session whose record is gone was deleted in the app.
  if (lead.host_session_id && desktop.ok && !app) return null
  // Imported into another account, it has a new desktop id: what the board
  // kept for it under the old one comes along.
  keepAcrossAccounts(key, ids.flatMap(one => [...(desktop.hostsByCli.get(one) ?? [])]))
  const item = itemOf(key, ids)
  const repo = await repoInfo(lead.cwd)
  const group = { key, id, ids, lead, root: repo.root, branch: repo.branch }
  for (const one of ids) next.set(one, group)

  // Working means a sign of life: the bridge mod beats in the process, or
  // the transcript moved in the last minutes. Either alone is not enough:
  // the mod's heartbeat pauses while a long tool runs, and a long tool
  // writes nothing. A turn stopped with Esc never sends Stop: it is over.
  const bridge = await bridgeStatus(id)
  const mtimes = await Promise.all(ids.map(transcriptMtime))
  // The last message: the newest of the transcripts, the hook's last event
  // and what the desktop app last recorded.
  const lastActivity = Math.max(lead.updated_at, app?.lastActivityAt ?? 0, ...mtimes.map(m => m ?? 0))
  // A tool approval answered in the client leaves no hook trace until the
  // turn ends; the transcript moving on after the ask means it was answered.
  // A turn that ended with only monitors or shell commands left is done:
  // a monitor only watches, and a command (a dev server, a watcher) may run
  // for hours; the card shows it as running, not the session as working. A
  // subagent left running is work: it reports back and the turn goes on.
  // Only when the turn's end is the hook's last word and the mod sees no
  // turn running: a new prompt keeps the list of the turn before.
  const hasTurnEnded = (lead.background_at ?? lead.updated_at) >= lead.updated_at - 1000 && bridge.busy !== true
  const shells = (lead.background ?? []).filter(t => t.type === "shell")
  const work = (lead.background ?? []).filter(t => t.type !== "monitor" && t.type !== "shell")
  const s: Session =
    lead.state === "permission" && lastActivity > lead.updated_at + 2000
      ? { ...lead, state: "working", ask: null, ask_kind: null }
      : lead.state === "working" && lead.background?.length && !work.length && hasTurnEnded
        ? { ...lead, state: "done", background: shells }
        : lead
  // The mod (v2) says outright whether a turn runs: idle while the hook
  // still says working means the turn was stopped (Esc, or "Stop" here).
  // The beat must come after the hook's last word: a prompt just sent
  // reaches the hook a moment before the mod sees its turn start.
  // The mod's last word counts even once the process has closed.
  const isIdle = bridge.busy === false && (bridge.lastSeen ?? 0) > s.updated_at + 3000 && !s.background?.length
  const wasStopped = s.state === "working" && (isIdle || (await isInterrupted(id).catch(() => false)))
  const isWorking = !wasStopped && (bridge.isOpen || now - lastActivity < QUIET_MS)
  const isArchived = !!app?.isArchived
  const column = columnOf(s, item, isArchived, isWorking, now)
  // A question the board can answer (bridge mod v5) is a question, not a
  // permission: the client raises it as one, and the hook records that.
  const question = column === "asking" ? bridge.question : null
  const permission = column === "asking" && !question ? bridge.permission : null
  return {
    id,
    hostId: s.host_session_id ?? app?.hostId ?? null,
    cwd: s.cwd,
    repo: repo.name,
    repoRoot: repo.root,
    isWorktree: s.cwd !== repo.root && !s.cwd.startsWith(`${repo.root}/`),
    branch: repo.branch,
    prs: openPrs(await prRefs(ids, repo.root, repo.branch)),
    title: item.title || (cleanPrompt(app?.title || s.title || s.first_prompt) ?? s.project),
    hasOwnTitle: !!item.title,
    state: question ? "asking" : permission ? "permission" : s.state,
    isStale: s.state === "working" && (column === "review" || column === "pending") && !wasStopped,
    isInterrupted: wasStopped && (column === "review" || column === "pending"),
    isArchived,
    ask: question ? question.questions.map(q => q.question).join(" · ") : permission ? permissionText(permission) : cleanPrompt(s.ask),
    // What Claude said it did in its last turn (the wrap-up recap or the
    // first line of its answer).
    recap: cleanPrompt(s.summary) ?? null,
    // What the person asked last (the canvas's hover preview).
    lastPrompt: cleanPrompt(s.last_prompt) ?? null,
    mode: s.mode ?? null,
    effort: s.effort ?? null,
    // Only while the session lives: a closed process took its background work with it.
    background: column === "working" || column === "asking" || (bridge.isOpen && s.background?.length) ? await liveBackground(id, s) : [],
    choices: column === "asking" ? (s.choices ?? []) : [],
    askKind: column === "asking" ? (question ? "dialog" : permission ? "permission" : (s.ask_kind ?? null)) : null,
    // New: Claude finished something since the person last looked.
    isUnread: (s.state === "asking" || s.state === "permission" || s.state === "done") && s.updated_at > (item.seen_at ?? board.seenEpoch ?? 0),
    isLaunching: running.has(id),
    usage: await usageOf(id, ids).catch(() => null),
    // The current turn's task list, while Claude works through it.
    progress: column === "working" ? await progressOf(id).catch(() => null) : null,
    // What that turn does now (the card's orb).
    doing: column === "working" ? await doingOf(id) : null,
    // Since when the session waits for the person (the moment it asked).
    waitingSince: column === "asking" ? s.updated_at : null,
    updatedAt: Math.max(s.updated_at, app?.lastActivityAt ?? 0),
    lastActivity,
    column,
    pinned: (item.pinned ?? !!app?.isStarred) && column !== "done",
    isStarredInApp: !!app?.isStarred,
    parkedUntil: column === "parked" ? (item.parked_until ?? null) : null,
    taskCount: tasks.filter(t => ids.includes(sessionOf(t) ?? "")).length,
    pos: item.pos ?? null,
    color: item.color ?? null,
    tier: item.tier ?? "other",
    tierRank: item.tier_rank ?? null,
    run: await runSummary(id),
    bridge: { ...bridge, wake: wakeState(id) },
  }
}

export type Card = NonNullable<Awaited<ReturnType<typeof cardOf>>>

// Two open sessions that may step on each other: both edited the same files
// in the last 6 hours, or both work right now in the same folder.
const OVERLAP_MS = 6 * 3600_000
export type Overlap = { id: string; title: string; files: string[]; isSameFolder: boolean }
async function withOverlaps<C extends { id: string; title: string; cwd: string; column: string }>(cards: C[], groupsNow: Map<string, Group>, now: number) {
  const written = new Map(
    await Promise.all(
      cards.map(async c => [c.id, await writtenSince(groupsNow.get(c.id)?.ids ?? [c.id], now - OVERLAP_MS).catch(() => new Map<string, Set<string>>())] as const),
    ),
  )
  // Both wrote the file, each with an edit of its own: a conversation the app
  // imported again as another session carries the same edits, and is no
  // overlap (a fork is, once it edits on its own).
  const ownEdit = (mine: Set<string>, theirs: Set<string>) => mine.size === 0 || [...mine].some(id => !theirs.has(id))
  return cards.map(c => {
    const overlaps: Overlap[] = []
    const mine = written.get(c.id)!
    for (const other of cards) {
      if (other.id === c.id) continue
      const theirs = written.get(other.id)!
      const files = [...mine.keys()].filter(f => theirs.has(f) && ownEdit(mine.get(f)!, theirs.get(f)!) && ownEdit(theirs.get(f)!, mine.get(f)!))
      const isSameFolder = c.column === "working" && other.column === "working" && c.cwd === other.cwd
      if (files.length || isSameFolder) overlaps.push({ id: other.id, title: other.title, files, isSameFolder })
    }
    return { ...c, overlaps }
  })
}

export async function snapshot() {
  const now = Date.now()
  const organizer = await isOrganizerOn()
  if (organizer) void refreshLinks() // links show up once the first scan ends
  const [all, desktop, tasks] = await Promise.all([readSessions(), readDesktop(), readTasks()])
  const sessions = all.filter(s => now - s.updated_at < MAX_AGE_MS)
  const next = new Map<string, Group>()
  const built = (await Promise.all(groupSessions(sessions, desktop).map(g => cardOf(g, desktop, tasks, next, now)))).filter(
    (c): c is Card => c !== null,
  )
  groups = next
  // What each session's processes take in memory (lib/memory.ts), read in
  // the background: a card gets the last reading.
  const memory = memoryNow(new Set(next.keys()))
  const cards = built
    .filter(c => c.column !== "archived")
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .map(c => ({ ...c, memory: memoryOf(next.get(c.id)?.ids ?? [c.id]) }))
  const done = cards.filter(c => c.column === "done").slice(0, DONE_SHOWN)
  const visible = [...(await withOverlaps(cards.filter(c => c.column !== "done"), next, now)), ...done.map(c => ({ ...c, overlaps: [] as Overlap[] }))]

  const repos = new Map<string, { root: string; name: string; count: number }>()
  for (const c of visible) {
    const r = repos.get(c.repoRoot) ?? { root: c.repoRoot, name: c.repo, count: 0 }
    if (c.column !== "done") r.count++
    repos.set(c.repoRoot, r)
  }
  return {
    cards: visible,
    repos: [...repos.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    zones: board.zones ?? [],
    notes: board.notes ?? [],
    limits: accountLimits(built.map(c => c.bridge.limits)),
    uploadsBytes: await folderSize(),
    canRunCommands: canRunCommands(),
    memory: { total: visible.reduce((sum, c) => sum + (c.memory?.total ?? 0), 0), pressure: memory.pressure },
    features: { organizer },
    update: await freshness(),
    version,
  }
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>
