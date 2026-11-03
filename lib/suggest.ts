// The message you would likely write next (grey in the reply box, Tab takes
// it): Haiku reads the last turns of the session (your message and Claude's
// last words in each) and writes it in your language and tone, or nothing
// when no reply is obvious. Headless, no tools, no hooks, nothing saved;
// once per turn (kept by the turn's last row), only when asked.

import { DATA_DIR } from "./config"
import { claudeBinary } from "./launch"
import { claudeEnv, exec } from "./proc"
import { tailRows, turnsOf } from "./trace"
import { withoutReminders } from "./transcript"

export type Exchange = { you: string; claude: string }

const TURNS = 3
const YOU_CHARS = 1500
const CLAUDE_CHARS = 3000
const MAX_CHARS = 200
const TIMEOUT_MS = 60_000

const textIn = (row: any): string => {
  const c = row.message?.content
  if (typeof c === "string") return c
  return Array.isArray(c) ? c.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : ""
}
const clip = (text: string, chars: number) => (text.length > chars ? `…${text.slice(-chars)}` : text)

// The last turns, each your message and the last text Claude wrote in it;
// the key is the turn's last row (a new row, a new suggestion).
export function exchangesOf(rows: any[]): { key: string; exchanges: Exchange[] } | null {
  const turns = turnsOf(rows).slice(-TURNS)
  const last = turns.at(-1)?.at(-1)
  if (!last) return null
  const exchanges = turns.map(turn => ({
    you: clip(withoutReminders(textIn(turn[0])).trim(), YOU_CHARS),
    claude: clip(turn.filter(r => r.type === "assistant").map(textIn).filter(t => t.trim()).at(-1)?.trim() ?? "", CLAUDE_CHARS),
  }))
  return { key: String(last.uuid ?? last.timestamp ?? ""), exchanges }
}

// Claude's answer as the message alone: no quotes; none for NONE or a ramble.
export function answerOf(text: string): string | null {
  const message = text.trim().replace(/^["“”'«]+|["“”'»]+$/g, "").trim()
  if (!message || message === "NONE" || message.length > MAX_CHARS) return null
  return message
}

const promptFor = (exchanges: Exchange[]) => `You predict the next message a person will type to Claude Code, an AI coding assistant, in their conversation. Below are its last turns: what the person wrote, then what Claude answered.

Write the one message the person most likely sends next, as they would write it: their language, their tone, short (15 words at most). It follows from Claude's last answer: it answers Claude's question, picks the option Claude offers, approves what Claude proposes, or asks for the obvious next step. Do not invent facts that are not in the conversation.

If no reply is obvious, answer exactly NONE. Answer with the message only, no quotes and nothing else.

${exchanges.map(e => `<person>\n${e.you}\n</person>\n<claude>\n${e.claude}\n</claude>`).join("\n\n")}`

async function write(exchanges: Exchange[]): Promise<string | null> {
  const { code, stdout } = await exec(
    [
      await claudeBinary(), "-p", "--output-format", "json", "--model", "haiku",
      "--tools", "", "--no-session-persistence", "--settings", JSON.stringify({ disableAllHooks: true }),
    ],
    { cwd: DATA_DIR, env: claudeEnv(), input: promptFor(exchanges), timeoutMs: TIMEOUT_MS },
  )
  try {
    const result = JSON.parse(stdout)
    return code === 0 && !result.is_error && typeof result.result === "string" ? answerOf(result.result) : null
  } catch {
    return null
  }
}

const kept = new Map<string, { key: string; text: Promise<string | null> }>()

// The suggestion for a session's last turn: written once, then kept.
export async function suggestionOf(id: string): Promise<string | null> {
  const found = exchangesOf(await tailRows(id))
  if (!found || !found.exchanges.at(-1)?.claude) return null
  const had = kept.get(id)
  if (had?.key === found.key) return had.text
  const text = write(found.exchanges).catch(() => null)
  kept.set(id, { key: found.key, text })
  return text
}
