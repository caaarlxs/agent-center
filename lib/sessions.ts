// The sessions as the hook records them (~/.claude/session-inbox/<id>.json,
// written only by hooks/session-inbox.py; read-only here), cached by mtime.

import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { SESSIONS_DIR } from "./config"
import { appHostOf, type DesktopIndex } from "./desktop"

export type SessionState = "working" | "asking" | "permission" | "done"

export type Session = {
  session_id: string
  host_session_id?: string | null
  cwd: string
  project: string
  title?: string | null
  state: SessionState
  ask?: string | null
  summary?: string | null
  last_prompt?: string | null
  // Work left running in the background when the last turn ended (the hook).
  background?: { id: string; type: string; description: string | null; command: string | null; agent_type?: string | null; since: number }[]
  background_at?: number // when the hook last wrote `background` (a turn's end)
  mode?: string // permission mode, as the hook last saw it
  effort?: string
  first_prompt?: string | null
  choices?: { label: string; message: string }[] | null
  ask_kind?: "next" | "dialog" | null // dialog: AskUserQuestion, or another component the app draws
  updated_at: number
}

const cache = new Map<string, { mtimeMs: number; session: Session | null }>()

export async function readSessions(): Promise<Session[]> {
  let names: string[] = []
  try {
    names = (await readdir(SESSIONS_DIR)).filter(name => name.endsWith(".json"))
  } catch {
    return []
  }
  const seen = new Set(names)
  for (const name of [...cache.keys()]) if (!seen.has(name)) cache.delete(name)
  await Promise.all(
    names.map(async name => {
      const path = join(SESSIONS_DIR, name)
      try {
        const { mtimeMs } = await stat(path)
        if (cache.get(name)?.mtimeMs === mtimeMs) return
        cache.set(name, { mtimeMs, session: JSON.parse(await readFile(path, "utf8")) as Session })
      } catch {
        cache.set(name, { mtimeMs: -1, session: null })
      }
    }),
  )
  return [...cache.values()].flatMap(hit => (hit.session ? [hit.session] : []))
}

// The desktop app's own id for a CLI session (null: never in the app) and its folder.
// Its desktop id in the account signed in now (lib/desktop.ts appHostOf).
export async function hostIdOf(id: string, desktop: DesktopIndex) {
  const session = (await readSessions()).find(s => s.session_id === id)
  return { hostId: appHostOf(id, session?.host_session_id ?? null, desktop), cwd: session?.cwd ?? null }
}

// A prompt or recap as one line: the engine's reminders out, and what the
// person pasted as a marker instead of the engine's tags.
export function cleanPrompt(text: string | null | undefined) {
  return text
    ? text
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
        .replace(/<pasted[_-]?content\b[^>]*\/>/gi, "[pasted text]")
        .replace(/<pasted[_-]?content\b[^>]*>[\s\S]*?(<\/pasted[_-]?content>|$)/gi, "[pasted text]")
        .replace(/<pasted[_-]?content\b[^>]*$/gi, "[pasted text]")
        .replace(/\s+/g, " ")
        .trim() || null
    : null
}
