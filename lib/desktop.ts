// Read-only view of the Claude desktop app's own session records: title,
// archived and starred state, and the CLI session id each one runs.
// Never written here: those files belong to the app.

import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { DESKTOP_DIR } from "./config"
import { readJson } from "./files"

const ROOT = join(DESKTOP_DIR, "claude-code-sessions")

export type DesktopSession = {
  hostId: string
  cliId: string | null
  title: string | null
  cwd: string | null
  isArchived: boolean
  isStarred: boolean
  lastActivityAt: number | null
  permissionMode: string | null
  model: string | null
  effort: string | null
  // Suggested tasks (spawn_task) this session made that the app resolved:
  // task id → "started_notified" | "dismissed".
  suggestions: Record<string, string>
  // The suggested task this session was started from, if any.
  spawnedFrom: { hostId: string; taskId: string } | null
}

export type DesktopIndex = {
  ok: boolean
  byCli: Map<string, DesktopSession>
  byHost: Map<string, DesktopSession>
}

const cache = new Map<string, { mtimeMs: number; session: DesktopSession | null }>()

async function dirs(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => join(path, d.name))
  } catch {
    return []
  }
}

export async function readDesktop(): Promise<DesktopIndex> {
  const byCli = new Map<string, DesktopSession>()
  const byHost = new Map<string, DesktopSession>()
  const accounts = await dirs(ROOT)
  if (accounts.length === 0) return { ok: false, byCli, byHost }

  // The app keeps a copy of a session per account and organization folder it
  // was seen in; an old copy can still name a CLI session that is long gone.
  // The copy with the newest activity wins, and every CLI id any copy names
  // leads to it.
  const copies: { session: DesktopSession; mtimeMs: number }[] = []
  const seen = new Set<string>()
  for (const org of (await Promise.all(accounts.map(dirs))).flat()) {
    const archived = new Set<string>()
    try {
      for (const id of (await readJson(join(org, "archived-sessions.idx"))).archived ?? []) archived.add(id)
    } catch {}

    let names: string[] = []
    try {
      names = (await readdir(org)).filter(n => n.startsWith("local_") && n.endsWith(".json"))
    } catch {
      continue
    }
    await Promise.all(
      names.map(async name => {
        const path = join(org, name)
        seen.add(path)
        try {
          const { mtimeMs } = await stat(path)
          if (cache.get(path)?.mtimeMs !== mtimeMs) {
            const raw = await readJson(path)
            cache.set(path, {
              mtimeMs,
              session: {
                hostId: raw.sessionId,
                cliId: raw.cliSessionId ?? null,
                title: raw.title ?? null,
                cwd: raw.cwd ?? null,
                isArchived: !!raw.isArchived,
                isStarred: !!raw.isStarred,
                lastActivityAt: raw.lastActivityAt ?? null,
                permissionMode: raw.permissionMode ?? null,
                model: typeof raw.model === "string" ? raw.model : null,
                effort: typeof raw.effort === "string" ? raw.effort : null,
                suggestions: raw.resolvedBackgroundTaskSuggestions ?? {},
                spawnedFrom: raw.spawnedFrom?.taskId ? { hostId: String(raw.spawnedFrom.sessionId ?? ""), taskId: String(raw.spawnedFrom.taskId) } : null,
              },
            })
          }
        } catch {
          cache.set(path, { mtimeMs: -1, session: null })
        }
        const cached = cache.get(path)
        if (!cached?.session) return
        const session = archived.has(cached.session.hostId) ? { ...cached.session, isArchived: true } : cached.session
        copies.push({ session, mtimeMs: cached.mtimeMs })
      }),
    )
  }
  const newest = new Map<string, { session: DesktopSession; mtimeMs: number }>()
  const byActivity = (a: (typeof copies)[number], b: (typeof copies)[number]) =>
    (a.session.lastActivityAt ?? 0) - (b.session.lastActivityAt ?? 0) || a.mtimeMs - b.mtimeMs
  for (const c of copies) {
    const best = newest.get(c.session.hostId)
    if (!best || byActivity(c, best) > 0) newest.set(c.session.hostId, c)
  }
  for (const { session } of newest.values()) byHost.set(session.hostId, session)
  for (const { session } of copies) if (session.cliId) byCli.set(session.cliId, byHost.get(session.hostId)!)
  for (const path of [...cache.keys()]) if (!seen.has(path)) cache.delete(path)
  return { ok: true, byCli, byHost }
}

// Archived in the app: it starts no session there until it is unarchived
// (the app has no link for that), so a message for it would only wait.
export async function isArchivedInApp(ids: string[]) {
  const desktop = await readDesktop()
  return ids.some(id => desktop.byCli.get(id)?.isArchived)
}

export type SuggestionState = { state: "started" | "dismissed"; session: string | null }

// What became of the tasks a session (its CLI `ids`) suggested: started (and
// the session that runs it, started in the app or from the board) or
// dismissed, in either place. `ours`: the board's own record.
export async function suggestionStates(ids: string[], ours: Record<string, { from: string; session?: string; dismissed_at?: number }>) {
  const desktop = await readDesktop()
  const parents = ids.map(id => desktop.byCli.get(id)).filter(Boolean) as DesktopSession[]
  const hosts = new Set(parents.map(p => p.hostId))
  const out: Record<string, SuggestionState> = {}
  for (const p of parents)
    for (const [taskId, how] of Object.entries(p.suggestions))
      out[taskId] = { state: how === "dismissed" ? "dismissed" : "started", session: null }
  for (const s of desktop.byHost.values())
    if (s.spawnedFrom && hosts.has(s.spawnedFrom.hostId)) out[s.spawnedFrom.taskId] = { state: "started", session: s.cliId }
  for (const [taskId, o] of Object.entries(ours))
    if (ids.includes(o.from) && out[taskId]?.state !== "started")
      if (o.session) out[taskId] = { state: "started", session: o.session }
      else if (o.dismissed_at) out[taskId] = { state: "dismissed", session: null }
  return out
}
