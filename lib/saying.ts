// What a working session says it is doing, as Claude desktop shows it under
// the answer: the step of its task list in progress (its own -ing words),
// else the last command or subagent of this turn that said what it does,
// its first verb in -ing form ("Check complexity…" → "Checking complexity…").
// It holds while the session reads and edits in between. Read from the end
// of the transcript, for the cards of sessions at work.

import { stat } from "node:fs/promises"
import { isPersonPrompt, rowsAtEnd, transcriptPath } from "./transcript"

const TAIL = 256 * 1024
const DESCRIBED = new Set(["Bash", "Agent", "Task"])
const VERBS = new Set(("add apply ask build bump change check clean commit compare compute connect copy count create debug delete deploy design diff document download draft edit explore extract "
  + "export fetch find fix format generate grep import inspect install investigate kill launch lint list load look make merge migrate move "
  + "hook measure open parse patch ping plan prepare print pull push read rebase rebuild refactor reload remove rename render replace reset resolve restart restore rewrite "
  + "retry review revert run save scan search send set setup show sketch sort split start stop survey sync tag test try type update upgrade upload "
  + "use validate verify view wait watch wire wrap write").split(" "))
const DOUBLED = new Set(["run", "stop", "set", "get", "put", "plan", "ship", "cut", "drop", "map", "tag", "scan", "swap", "skip", "step", "zip", "grab", "trim", "log", "chat", "wrap", "tap", "hit", "sit"])

export function gerundOf(text: string): string {
  const m = text.match(/^([A-Za-z]+)(.*)$/s)
  const verb = m?.[1]?.toLowerCase() ?? ""
  if (!m || !VERBS.has(verb)) return text
  const ing = DOUBLED.has(verb) ? `${verb}${verb.at(-1)}ing` : /[^e]e$/.test(verb) ? `${verb.slice(0, -1)}ing` : `${verb}ing`
  return `${ing.charAt(0).toUpperCase()}${ing.slice(1)}${m[2]}`
}

const callsIn = (row: any): any[] => (row?.type === "assistant" && Array.isArray(row.message?.content) ? row.message.content.filter((b: any) => b?.type === "tool_use") : [])

export function sayingOf(rows: any[]): string | null {
  const from = rows.findLastIndex(r => isPersonPrompt(r))
  const turn = rows.slice(from + 1).filter(r => !r.isSidechain)
  let step: string | null = null
  let said: string | null = null
  for (const b of turn.flatMap(callsIn)) {
    if (b.name === "TodoWrite" && Array.isArray(b.input?.todos)) {
      const now = b.input.todos.find((t: any) => t?.status === "in_progress")
      step = now ? String(now.activeForm || now.content || "") || null : null
    } else if (DESCRIBED.has(b.name) && typeof b.input?.description === "string" && b.input.description.trim()) said = gerundOf(b.input.description.trim())
  }
  return step ?? said
}

const kept = new Map<string, { size: number; saying: string | null }>()

export async function sessionSaying(sessionId: string): Promise<string | null> {
  const path = await transcriptPath(sessionId)
  if (!path) return null
  const size = (await stat(path).catch(() => null))?.size
  if (!size) return null
  const had = kept.get(sessionId)
  if (had?.size === size) return had.saying
  const saying = sayingOf(await rowsAtEnd(path, size, TAIL).catch(() => []))
  kept.set(sessionId, { size, saying })
  return saying
}
