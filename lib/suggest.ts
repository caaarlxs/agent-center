// The message you would likely write next (grey in the reply box, Tab takes
// it): Sonnet reads the last turns of the session (your message and Claude's
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
const MAX_CHARS = 600
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

// The person's next message, never Claude's words: when Claude asks for
// what only the person knows (a name, a fact, a choice it does not offer),
// there is none.
export const promptFor = (exchanges: Exchange[]) => `Below is the end of a conversation between a PERSON and CLAUDE, an AI coding assistant. Guess the next message the PERSON types.

Rules:
- Write as the PERSON, never as Claude: the person reads Claude's answer and replies to it. Never explain, propose or summarize, and never ask the person anything.
- Same language, tone and way of writing as the person's earlier messages. As long as the reply needs: often one short sentence, a few sentences when the reply needs them (several of the options Claude offers, in an order). Never more than a short paragraph, and never a request, condition or detail that is not already in the conversation.
- Only a reply that needs nothing beyond the conversation: a yes or no to a yes-or-no question ("Sí, súbelo"), one of the options Claude offers ("Haz la opción 2"), or the obvious next step Claude names.
- If Claude asks for something only the person knows (which repo, a name, a date, a fact, an opinion), or offers nothing to reply to, answer exactly NONE.
- Answer with the message alone, no quotes.

Examples:
CLAUDE: "...Tests pass. ¿Hago push a main?" -> Sí, haz el push
CLAUDE: "...I can fix A or B. Which one first?" -> Fix A first
CLAUDE: "...Propongo 1) caché, 2) reintentos y 3) logs. ¿Cuáles hago?" -> Haz la 1 y la 3. La 2 déjala para más adelante, primero quiero ver cómo queda lo demás
CLAUDE: "...¿Qué repo usarías para la prueba?" -> NONE
CLAUDE: "...Done: the page now loads in 1 s." -> NONE

The conversation:

${exchanges.map(e => `<person>\n${e.you}\n</person>\n<claude>\n${e.claude}\n</claude>`).join("\n\n")}

The PERSON's next message (or NONE):`

async function write(exchanges: Exchange[]): Promise<string | null> {
  const { code, stdout } = await exec(
    [
      await claudeBinary(), "-p", "--output-format", "json", "--model", "sonnet",
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
