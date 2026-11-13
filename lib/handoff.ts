// Start fresh: a conversation that grew too long goes on in a new session.
// Not the whole conversation: a handoff note Sonnet writes from the latest
// summary /compact made, every request you made, the latest messages with
// Claude's steps (each tool call in one line, and the errors, not the tools'
// output), its task list, and the repository as it is now; the old session is
// not woken (its cache is not written again). The new session starts in the
// same folder, with the same model, with the note and where the full
// conversation is, should it need a detail.

import { stat } from "node:fs/promises"
import { DATA_DIR } from "./config"
import { claudeBinary, launch } from "./launch"
import { claudeEnv, exec, run } from "./proc"

type Said = { who: "you" | "claude" | "step"; text: string }
type Task = { subject: string; status: string }
const EDITS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"])
const TASK_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet"])
const NOT_YOURS = /^\s*<(system-reminder|command-|local-command|task-notification)/
const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max)

// A row of the conversation itself: not injected, not a summary, not a subagent's.
function rowOf(line: string): any | null {
  if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) return null
  try {
    const d = JSON.parse(line)
    return d.isMeta || d.isCompactSummary || d.isSidechain ? null : d
  } catch {
    return null
  }
}

const textOf = (content: unknown) =>
  (typeof content === "string" ? content : Array.isArray(content) ? content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : "").trim()

// A tool call in one line: what it was for (its description) or what it acted on.
function stepOf(b: any): Said[] {
  if (TASK_TOOLS.has(b.name)) return []
  const i = b.input ?? {}
  const what = [i.description, i.command, i.file_path, i.pattern, i.url, i.query, i.prompt].find(v => typeof v === "string" && v.trim())
  return [{ who: "step", text: `→ ${b.name}${what ? `: ${oneLine(what, 160)}` : ""}` }]
}

// What one row says (your words, Claude's, its steps and their errors), and the file it changed if it did.
function readRow(d: any): { said: Said[]; files: string[] } {
  const content = d.message?.content
  if (d.type === "user") {
    const errors = Array.isArray(content) ? content.filter((b: any) => b?.type === "tool_result" && b.is_error) : []
    if (errors.length) return { said: errors.map((b: any) => ({ who: "step", text: `✗ ${oneLine(textOf(b.content) || "failed", 300)}` })), files: [] }
    const text = textOf(content)
    return { said: text && !NOT_YOURS.test(text) ? [{ who: "you", text }] : [], files: [] }
  }
  const blocks: any[] = Array.isArray(content) ? content : []
  return {
    said: blocks.flatMap((b): Said[] => (b?.type === "text" && b.text?.trim() ? [{ who: "claude", text: b.text.trim() }] : b?.type === "tool_use" ? stepOf(b) : [])),
    files: blocks.filter(b => b?.type === "tool_use" && EDITS.has(b.name) && typeof b.input?.file_path === "string").map(b => b.input.file_path),
  }
}

// The latest messages that fit in `maxChars`, oldest first; the newest one, cut if alone it is too long.
function latestThatFit(all: Said[], maxChars: number): Said[] {
  const said: Said[] = []
  let left = maxChars
  for (let i = all.length - 1; i >= 0 && left > 0; i--) {
    const s = all[i]!
    if (s.text.length > left && said.length) break
    said.unshift(s.text.length > left ? { ...s, text: s.text.slice(-left) } : s)
    left -= s.text.length
  }
  return said
}

/** What a transcript's lines say, for a handoff: the messages and steps (the latest that fit in `maxChars`) and the files changed. */
export function excerptOf(lines: string[], maxChars: number) {
  const read = lines.map(rowOf).filter(Boolean).map(readRow)
  return { said: latestThatFit(read.flatMap(r => r.said), maxChars), files: [...new Set(read.flatMap(r => r.files))] }
}

/** What the whole conversation holds that its end does not: the latest /compact summary, every request you made, the task list. */
export type History = { summary: string | null; yours: string[]; tasks: Map<string, Task>; created: number }
export const newHistory = (): History => ({ summary: null, yours: [], tasks: new Map(), created: 0 })

function applyTask(h: History, b: any) {
  const i = b.input ?? {}
  const id = String(i.taskId)
  if (b.name === "TodoWrite" && Array.isArray(i.todos)) {
    h.tasks = new Map(i.todos.map((t: any, n: number) => [String(n), { subject: String(t?.content ?? ""), status: String(t?.status ?? "pending") }]))
  } else if (b.name === "TaskCreate") {
    // Claude Code numbers a session's tasks 1, 2, 3… as they are created.
    h.tasks.set(String(++h.created), { subject: String(i.subject ?? ""), status: "pending" })
  } else if (b.name === "TaskUpdate" && i.status === "deleted") {
    h.tasks.delete(id)
  } else if (b.name === "TaskUpdate" && h.tasks.has(id)) {
    const task = h.tasks.get(id)!
    h.tasks.set(id, { subject: String(i.subject ?? task.subject), status: String(i.status ?? task.status) })
  }
}

/** Adds one transcript line to `h`. Cheap on what it skips: most lines are not parsed. */
export function addLine(h: History, line: string) {
  if (line.includes('"isCompactSummary":true')) {
    try {
      h.summary = textOf(JSON.parse(line).message?.content) || h.summary
    } catch {}
  } else if (line.includes('"type":"user"') && !line.includes('"tool_result"')) {
    const d = rowOf(line)
    if (d) h.yours.push(...readRow(d).said.filter(s => s.who === "you").map(s => s.text))
  } else if (/"name":"(TodoWrite|TaskCreate|TaskUpdate)"/.test(line)) {
    for (const b of rowOf(line)?.message?.content ?? []) if (b?.type === "tool_use") applyTask(h, b)
  }
}

// Every line of the transcripts, read as a stream: one can be hundreds of MB.
async function historyOf(paths: string[]) {
  const h = newHistory()
  const decoder = new TextDecoder()
  for (const path of paths) {
    let rest = ""
    for await (const chunk of Bun.file(path).stream()) {
      const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n")
      rest = lines.pop()!
      for (const line of lines) addLine(h, line)
    }
    addLine(h, rest)
  }
  return h
}

// Your requests: the first one always, then the latest that fit, each one cut.
function yoursThatFit(yours: string[], maxChars: number) {
  const cut = yours.map(t => (t.length > 1500 ? `${t.slice(0, 1500)}…` : t))
  if (cut.length <= 1) return cut
  const latest = latestThatFit(cut.slice(1).map(text => ({ who: "you" as const, text })), maxChars - cut[0]!.length)
  return [cut[0]!, ...latest.map(s => s.text)]
}

/** The repository in `folder` as it is now: branch, what is not committed, the latest commits and the branch's PR. Null when not a repository. */
export async function repoState(folder: string): Promise<string | null> {
  const status = await run(["git", "status", "-sb"], folder, { timeoutMs: 10_000 })
  if (status === null) return null
  const [log, pr] = await Promise.all([
    run(["git", "log", "--oneline", "-8"], folder, { timeoutMs: 10_000 }),
    run(["gh", "pr", "view", "--json", "number,title,state,url", "--jq", '"#\\(.number) \\(.title) (\\(.state)) \\(.url)"'], folder, { timeoutMs: 15_000 }),
  ])
  const lines = status.split("\n")
  const open = lines.slice(1)
  return [
    `Branch: ${lines[0]!.replace(/^## /, "")}`,
    `Not committed:\n${open.slice(0, 40).join("\n") || "(nothing)"}${open.length > 40 ? `\n… and ${open.length - 40} more` : ""}`,
    `Latest commits:\n${log || "(none)"}`,
    `Pull request of this branch: ${pr || "(none)"}`,
  ].join("\n\n")
}

const NOTE_PROMPT = `Below is a long working session between a person and Claude Code. It has: the summary of its earlier part (if it was compacted), every request the person made, the latest messages with Claude's steps ("→ Tool: what" is a tool call, "✗" an error it gave; the tools' output is left out), Claude's task list, the files it changed, and the repository as it is now. Trust the repository's state over what the conversation says about commits, pushes and PRs. Write the handoff note a new Claude Code session needs to carry on this work without the old conversation, with these sections:

## Goal
## Done so far
## Decisions and constraints (what was agreed, the person's preferences, what to avoid)
## Where it stopped (the last thing being done, what is pending or broken)
## Last exact step (the command, change or question in progress, as precisely as the messages allow)
## Next steps
## Files

Be concrete: name files, functions, commands, ids, branches and PRs. Write in the language the person writes in. At most 800 words. Answer with the note only.`

export type NoteParts = { history: History; said: Said[]; files: string[]; repo: string | null }

/** What Sonnet reads to write the note. */
export function noteInput({ history, said, files, repo }: NoteParts) {
  const tasks = [...history.tasks.values()].map(t => `- [${t.status}] ${t.subject}`)
  const who = { you: "Person", claude: "Claude" } as const
  return [
    NOTE_PROMPT,
    `\n# Summary of the earlier part\n${history.summary?.slice(0, 20_000) ?? "(not compacted)"}`,
    `\n# The person's requests, oldest first\n${yoursThatFit(history.yours, 12_000).map(t => `- ${t}`).join("\n") || "(not found)"}`,
    `\n# Latest messages and steps\n${said.map(s => (s.who === "step" ? s.text : `**${who[s.who]}:** ${s.text}`)).join("\n\n")}`,
    `\n# Task list\n${tasks.join("\n") || "(none)"}`,
    `\n# Files changed\n${files.slice(-60).join("\n") || "(none seen)"}`,
    `\n# The repository now\n${repo ?? "(not a git repository)"}`,
  ].join("\n")
}

/** The new session's first message. */
export const freshPrompt = ({ title, note, transcript }: { title: string; note: string; transcript: string }) =>
  `This picks up the work of the session “${title}”, which grew too long to go on. Here is the handoff note written from it:

${note}

The full conversation is in ${transcript}, should you need a detail from it: search it for that, never read it whole. Start by telling me in two or three lines where things stand and what you would do next, then wait for me.`

const TIMEOUT_MS = 180_000
const TAIL_BYTES = 6 * 1024 * 1024 // the latest messages are at the end; a transcript can be hundreds of MB
const EXCERPT_CHARS = 60_000

async function tailOf(path: string) {
  const file = Bun.file(path)
  return (await file.slice(Math.max(0, file.size - TAIL_BYTES)).text()).split("\n").slice(file.size > TAIL_BYTES ? 1 : 0)
}

/** The handoff note for a conversation (its transcripts, oldest first) in `folder`, written by Sonnet. */
export async function handoffNote(paths: string[], folder: string): Promise<string> {
  const [history, tail, repo] = await Promise.all([historyOf(paths), tailOf(paths.at(-1)!), repoState(folder)])
  const input = noteInput({ history, ...excerptOf(tail, EXCERPT_CHARS), repo })
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
  const note = await handoffNote(paths, o.folder)
  const extra = o.model && /^claude-[\w.-]+$/.test(o.model) ? ["--model", o.model] : []
  return launch(o.folder, freshPrompt({ title: o.title, note, transcript: paths.at(-1)! }), o.onDone, extra, o.mode)
}
