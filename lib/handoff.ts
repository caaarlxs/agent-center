// Start fresh: a conversation that grew too long goes on in a new session.
// Not the whole conversation: a handoff note Sonnet writes from what you and
// Claude said (the tools' output left out, the latest that fits), your first
// request and the files it changed; the old session is not woken (its cache
// is not written again). The new session starts in the same folder, with the
// same model, with the note and where the full conversation is, should it
// need a detail.

import { stat } from "node:fs/promises"
import { DATA_DIR } from "./config"
import { claudeBinary, launch } from "./launch"
import { claudeEnv, exec } from "./proc"

type Said = { who: "you" | "claude"; text: string }
const EDITS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"])
const NOT_YOURS = /^\s*<(system-reminder|command-|local-command|task-notification)/

/** What a transcript's lines say, for a handoff: the messages (the latest that fit in `maxChars`) and the files changed. */
export function excerptOf(lines: string[], maxChars: number) {
  const all: Said[] = []
  const files: string[] = []
  for (const line of lines) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
    let d: any
    try {
      d = JSON.parse(line)
    } catch {
      continue
    }
    if (d.isMeta || d.isCompactSummary || d.isSidechain) continue
    const content = d.message?.content
    if (d.type === "user") {
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : ""
      if (text.trim() && !NOT_YOURS.test(text)) all.push({ who: "you", text: text.trim() })
    } else if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === "text" && b.text?.trim()) all.push({ who: "claude", text: b.text.trim() })
        if (b?.type === "tool_use" && EDITS.has(b.name) && typeof b.input?.file_path === "string" && !files.includes(b.input.file_path)) files.push(b.input.file_path)
      }
    }
  }
  const said: Said[] = []
  let left = maxChars
  for (let i = all.length - 1; i >= 0 && left > 0; i--) {
    const s = all[i]!
    if (s.text.length > left && said.length) break
    said.unshift(s.text.length > left ? { ...s, text: s.text.slice(-left) } : s)
    left -= s.text.length
  }
  return { said, files }
}

/** The new session's first message. */
export const freshPrompt = ({ title, note, transcript }: { title: string; note: string; transcript: string }) =>
  `This picks up the work of the session “${title}”, which grew too long to go on. Here is the handoff note written from it:

${note}

The full conversation is in ${transcript}, should you need a detail from it: search it for that, never read it whole. Start by telling me in two or three lines where things stand and what you would do next, then wait for me.`

const NOTE_PROMPT = `Below is a long working session between a person and Claude Code, as text only (the tools' output is left out): its first request, then its latest messages, and the files it changed. Write the handoff note a new Claude Code session needs to carry on this work without the old conversation, with these sections:

## Goal
## Done so far
## Decisions and constraints (what was agreed, the person's preferences, what to avoid)
## Where it stopped (the last thing being done, what is pending or broken)
## Next steps
## Files

Be concrete: name files, functions, commands, ids, branches and PRs. Write in the language the person writes in. At most 500 words. Answer with the note only.`

const TIMEOUT_MS = 180_000
const HEAD_BYTES = 256 * 1024
const TAIL_BYTES = 6 * 1024 * 1024 // the latest messages are at the end; a transcript can be hundreds of MB
const EXCERPT_CHARS = 40_000

async function linesOf(path: string) {
  const file = Bun.file(path)
  const head = (await file.slice(0, HEAD_BYTES).text()).split("\n").slice(0, -1)
  const tail = (await file.slice(Math.max(0, file.size - TAIL_BYTES)).text()).split("\n").slice(file.size > TAIL_BYTES ? 1 : 0)
  return { head, tail }
}

/** The handoff note for a conversation (its transcripts, oldest first), written by Sonnet. */
export async function handoffNote(paths: string[]): Promise<string> {
  const last = paths.at(-1)!
  const { head } = await linesOf(paths[0]!)
  const { tail } = await linesOf(last)
  const first = excerptOf(head, 4000).said.find(s => s.who === "you")
  const { said, files } = excerptOf(tail, EXCERPT_CHARS)
  const input = [
    NOTE_PROMPT,
    `\n# First request\n${first?.text.slice(0, 4000) ?? "(not found)"}`,
    `\n# Latest messages\n${said.map(s => `**${s.who === "you" ? "Person" : "Claude"}:** ${s.text}`).join("\n\n")}`,
    `\n# Files changed\n${files.slice(-60).join("\n") || "(none seen)"}`,
  ].join("\n")
  const { code, stdout, stderr } = await exec(
    [await claudeBinary(), "-p", "--output-format", "json", "--model", "sonnet", "--tools", "", "--no-session-persistence", "--settings", JSON.stringify({ disableAllHooks: true })],
    { cwd: DATA_DIR, env: claudeEnv(), input, timeoutMs: TIMEOUT_MS }, // the board's folder: no project's CLAUDE.md
  )
  let res: any = null
  try {
    res = JSON.parse(stdout)
  } catch {}
  if (code !== 0 || !res || res.is_error || typeof res.result !== "string" || !res.result.trim())
    throw new Error(res?.result || stderr.trim().split("\n").pop() || `Claude ended with code ${code}`)
  return res.result.trim()
}

/** A new session in `folder` that picks up the work: the note written, then launched with the old one's model and mode; its id. */
export async function startFresh(o: { title: string; folder: string; paths: string[]; model: string | null; mode: string; onDone: (id: string) => void }) {
  // Oldest first: the first request is in the first, the latest messages in the last.
  const dated = await Promise.all(o.paths.map(async p => ({ p, at: (await stat(p).catch(() => null))?.mtimeMs ?? 0 })))
  const paths = dated.sort((a, b) => a.at - b.at).map(d => d.p)
  const note = await handoffNote(paths)
  const extra = o.model && /^claude-[\w.-]+$/.test(o.model) ? ["--model", o.model] : []
  return launch(o.folder, freshPrompt({ title: o.title, note, transcript: paths.at(-1)! }), o.onDone, extra, o.mode)
}
