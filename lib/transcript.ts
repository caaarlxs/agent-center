// A read-only view of one conversation: prompts, Claude's text, and each tool
// call as one line. Reads the tail of the transcript (they can be hundreds of
// MB), pages backwards with `before` and follows a live session with `after`
// (the `end` of the previous page), so an update reads only the new lines.

import { open, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { HOME, PROJECTS_DIR as PROJECTS } from "./config"

const WINDOW = 3 * 1024 * 1024
const MAX_FOLLOW = 16 * 1024 * 1024 // a follow-up read that fell this far behind starts over at the tail

export type PlanStep = { content: string; status: "pending" | "in_progress" | "completed" }
export type PlanOp = { advance?: boolean; done?: number[]; start?: number; finish?: boolean }

// The task list the app shows: a full list, then steps moving through it.
export function applyPlanOp(steps: PlanStep[], op: PlanOp): PlanStep[] {
  const next = steps.map(s => ({ ...s }))
  if (op.finish) for (const s of next) if (s.status === "in_progress") s.status = "completed"
  for (const n of op.done ?? []) if (next[n - 1]) next[n - 1]!.status = "completed"
  if (op.advance) {
    const i = next.findIndex(s => s.status === "in_progress")
    if (i >= 0) next[i]!.status = "completed"
    const j = next.findIndex(s => s.status === "pending")
    if (j >= 0) next[j]!.status = "in_progress"
  }
  if (op.start && next[op.start - 1]) {
    for (const s of next) if (s.status === "in_progress") s.status = "pending"
    next[op.start - 1]!.status = "in_progress"
  }
  return next
}

// Tool calls the desktop app keeps out of the conversation.
const HIDDEN_TOOLS = /^(ToolSearch|mcp__ccd_turn__|mcp__ccd_view__)/

// Tools that wait for the person in the desktop app: what each asks.
function dialogOf(name: string, input: any): { label: string; detail: string | null; isLong: boolean } | null {
  if (name === "ExitPlanMode") return { label: "Approve the plan", detail: input?.plan ?? null, isLong: true }
  if (name.endsWith("ccd_directory__propose_branch"))
    return { label: "Work on a separate branch?", detail: input?.suggested ? `Proposed new branch: ${input.suggested}` : null, isLong: false }
  if (name.endsWith("ccd_directory__change_directory")) return { label: "Approve the working folder", detail: input?.path ?? null, isLong: false }
  if (name.endsWith("ccd_directory__request_directory")) return { label: "Choose a folder", detail: null, isLong: false }
  if (name.endsWith("ccd_session__start_session") && input?.initiation === "offer")
    return { label: "Open a new session?", detail: input?.title ?? null, isLong: false }
  return null
}

// `key` is stable across reads (the row's uuid and block), for the UI to diff.
export type Item = { key: string } & (
  | { kind: "user"; text: string; at: string | null; isMidTurn?: boolean }
  | { kind: "assistant"; text: string; at: string | null }
  | { kind: "tools"; lines: string[] }
  | { kind: "next"; recap: string | null; ask: string | null; actions: { label: string; message: string }[] }
  | { kind: "chapter"; title: string }
  | { kind: "question"; text: string; options: { label: string; description?: string }[]; isMulti: boolean; answer: string | null }
  | { kind: "dialog"; label: string; detail: string | null; isLong: boolean; answer: string | null }
  | { kind: "plan"; steps: PlanStep[] }
  | { kind: "planStep"; op: PlanOp }
  // Files Claude showed you (SendUserFile) and pages it published (Artifact).
  | { kind: "files"; paths: string[]; caption: string | null }
  | { kind: "artifact"; path: string | null; url: string | null }
  // A task Claude suggests for a session of its own (spawn_task), and Claude
  // taking one back (dismiss_task). `folder`: where it runs (null: the
  // session's own repository).
  | { kind: "suggestion"; taskId: string | null; title: string; tldr: string | null; prompt: string; folder: string | null }
  | { kind: "suggestionGone"; taskId: string }
)

const pathCache = new Map<string, string>()

export async function transcriptPath(id: string): Promise<string | null> {
  if (!/^[\w-]+$/.test(id)) return null
  const hit = pathCache.get(id)
  // A transcript can be deleted (the session deleted in the app): look again.
  if (hit && (await stat(hit).then(() => true, () => false))) return hit
  pathCache.delete(id)
  for (const dir of await readdir(PROJECTS).catch(() => [])) {
    const path = join(PROJECTS, dir, `${id}.jsonl`)
    if (await stat(path).then(() => true, () => false)) {
      pathCache.set(id, path)
      return path
    }
  }
  return null
}

const oneLine = (s: unknown, max = 140) => {
  const text = String(s).replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function toolLine(name: string, input: Record<string, unknown> = {}) {
  const short = name.startsWith("mcp__") ? name.split("__").slice(2).join("__") || name : name
  const arg = input.file_path ?? input.notebook_path ?? input.command ?? input.pattern ?? input.url ?? input.query ??
    input.description ?? input.skill ?? input.prompt
  const shown = typeof arg === "string" ? arg.replace(HOME, "~") : null
  return shown ? `${short}: ${oneLine(shown)}` : short
}

// Notes the client adds to the person's prompt (e.g. "This conversation is
// now continuing in the Claude desktop app", on the first prompt after an
// import) are not what they typed.
export const withoutReminders = (text: string) =>
  text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim()

// Prompts the engine injects start with a tag; a slash command keeps its name.
function promptText(raw: string): string | null {
  const text = withoutReminders(raw)
  if (!text) return null
  if (!text.startsWith("<")) return text
  const command = text.match(/<command-name>([^<]+)<\/command-name>/)?.[1]
  if (!command) return null
  const args = text.match(/<command-args>([^<]*)<\/command-args>/)?.[1]?.trim()
  return args ? `${command} ${args}` : command
}

// A prompt the person typed while Claude was working is folded into the
// running turn and stored as a `queued_command` attachment, not a user row.
// A prompt the person typed: not a tool result, nor what the engine injects
// (reminders, command wrappers start with "<").
export function isPersonPrompt(row: any) {
  if (row.type !== "user" || row.isMeta) return false
  const c = row.message?.content
  if (typeof c === "string") return !c.startsWith("<")
  return Array.isArray(c) && c.some((b: any) => b?.type === "text" && !String(b.text).startsWith("<")) &&
    !c.some((b: any) => b?.type === "tool_result")
}

export function queuedPrompt(row: any): string | null {
  const a = row?.type === "attachment" ? row.attachment : null
  if (a?.type !== "queued_command" || (a.commandMode && a.commandMode !== "prompt")) return null
  if (a.origin?.kind && a.origin.kind !== "human" && a.origin.kind !== "plugin") return null
  const prompt = typeof a.prompt === "string"
    ? a.prompt
    : Array.isArray(a.prompt) ? a.prompt.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : ""
  return prompt.trim() || null
}

// "User has answered your questions: "Q"="A". ..." → the answer to Q.
function answerTo(result: string | undefined, question: string) {
  if (!result) return null
  const at = result.indexOf(`"${question}"="`)
  if (at < 0) return null
  const from = at + question.length + 4
  const end = result.indexOf('"', from)
  return end > from ? result.slice(from, end) : null
}

function toItems(rows: any[]): Item[] {
  const items: Item[] = []
  // What each tool call got back, for the answers to AskUserQuestion.
  const results = new Map<string, string>()
  for (const row of rows)
    if (row.type === "user" && Array.isArray(row.message?.content))
      for (const b of row.message.content)
        if (b?.type === "tool_result")
          results.set(
            b.tool_use_id,
            typeof b.content === "string"
              ? b.content
              : Array.isArray(b.content) ? b.content.map((c: any) => c?.text ?? "").join("\n") : "",
          )
  const pushTool = (key: string, line: string) => {
    const last = items.at(-1)
    if (last?.kind === "tools") last.lines.push(line)
    else items.push({ key, kind: "tools", lines: [line] })
  }
  for (const row of rows) {
    const content = row.message?.content
    const at = row.timestamp ?? null
    const uuid = String(row.uuid ?? row.timestamp ?? items.length)
    const queued = queuedPrompt(row)
    if (queued) {
      const text = promptText(queued)
      if (text) items.push({ key: uuid, kind: "user", text, at: row.attachment?.timestamp ?? at, isMidTurn: true })
      continue
    }
    if (row.type === "user" && !row.isMeta) {
      const blocks = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : []
      if (blocks.some((b: any) => b?.type === "tool_result")) continue
      const raw = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n").trim()
      const text = raw && promptText(raw)
      if (text) items.push({ key: uuid, kind: "user", text, at })
    } else if (row.type === "assistant" && Array.isArray(content)) {
      content.forEach((block: any, i: number) => {
        const key = `${uuid}:${i}`
        if (block?.type === "text" && block.text?.trim()) items.push({ key, kind: "assistant", text: block.text, at })
        else if (block?.type === "tool_use") {
          const name = String(block.name ?? "")
          if (name.endsWith("ccd_turn__wrap_up"))
            items.push({
              key,
              kind: "next",
              recap: block.input?.recap ?? null,
              ask: block.input?.ask ?? null,
              actions: (block.input?.actions ?? [])
                .filter((a: any) => a?.label && !a.action)
                .map((a: any) => ({ label: String(a.label), message: String(a.message ?? a.label) })),
            })
          else if (name.endsWith("ccd_session__mark_chapter")) items.push({ key, kind: "chapter", title: String(block.input?.title ?? "") })
          else if (name === "AskUserQuestion")
            (block.input?.questions ?? []).forEach((q: any, j: number) =>
              items.push({
                key: `${key}:${j}`,
                kind: "question",
                text: String(q.question ?? ""),
                options: (q.options ?? []).map((o: any) => ({ label: String(o.label ?? ""), description: o.description })),
                isMulti: !!q.multiSelect,
                answer: answerTo(results.get(block.id), String(q.question ?? "")),
              }),
            )
          else if (name.endsWith("ccd_turn__update_plan")) {
            const input = block.input ?? {}
            if (Array.isArray(input.items))
              items.push({ key, kind: "plan", steps: input.items.map((i: any) => ({ content: String(i.content ?? ""), status: i.status ?? "pending" })) })
            else items.push({ key, kind: "planStep", op: { advance: !!input.advance, done: input.done, start: input.start } })
          } else if (name === "SendUserFile" && Array.isArray(block.input?.files))
            items.push({ key, kind: "files", paths: block.input.files.map(String), caption: block.input.caption ?? null })
          else if (name === "Artifact" && (!block.input?.action || block.input.action === "publish") && !block.input?.asset) {
            const url = results.get(block.id)?.match(/https:\/\/claude\.ai\/[\w/.-]+/)?.[0] ?? null
            items.push({ key, kind: "artifact", path: block.input?.file_path ?? null, url })
          } else if (name.endsWith("ccd_session__spawn_task") && block.input?.prompt) {
            // The task id comes back in the result: "Noted (position 1, task_id: task_…)";
            // a live read can get the call before its result (null until reopened).
            const taskId = results.get(block.id)?.match(/task_id: (task_[\w-]+)/)?.[1] ?? null
            items.push({
              key, kind: "suggestion", taskId, title: String(block.input.title ?? "Suggested task"),
              tldr: block.input.tldr ? String(block.input.tldr) : null, prompt: String(block.input.prompt),
              folder: typeof block.input.cwd === "string" && block.input.cwd ? block.input.cwd : null,
            })
          } else if (name.endsWith("ccd_session__dismiss_task")) {
            if (block.input?.task_id) items.push({ key, kind: "suggestionGone", taskId: String(block.input.task_id) })
          } else if (dialogOf(name, block.input)) {
            const result = results.get(block.id)
            const answer = result === undefined ? null : (result.split("\n").find(l => l.trim()) ?? "Answered").slice(0, 300)
            items.push({ key, kind: "dialog", ...dialogOf(name, block.input)!, answer })
          } else if (!HIDDEN_TOOLS.test(name)) pushTool(key, toolLine(name, block.input))
          // The wrap-up box checks off the task list.
          if (name.endsWith("ccd_turn__wrap_up")) items.push({ key: `${key}:finish`, kind: "planStep", op: { finish: true } })
        }
      })
    }
  }
  return items
}

// Steps after a list in the same page update that list; a step whose list is
// in an earlier page stays for the reader to apply to the list it holds.
function foldPlans(items: Item[]): Item[] {
  const out: Item[] = []
  let plan: Extract<Item, { kind: "plan" }> | null = null
  for (const item of items) {
    if (item.kind === "plan") {
      plan = { ...item }
      out.push(plan)
    } else if (item.kind === "planStep") {
      if (plan) plan.steps = applyPlanOp(plan.steps, item.op)
      else out.push(item)
    } else out.push(item)
  }
  return out
}

export async function readMessages(id: string, { before, after }: { before?: number; after?: number } = {}) {
  const isOffset = (n: number | undefined) => n === undefined || (Number.isSafeInteger(n) && n >= 0)
  if (!isOffset(before) || !isOffset(after)) return null
  const path = await transcriptPath(id)
  if (!path) return null
  const { size } = await stat(path)
  if (after !== undefined && size - after > MAX_FOLLOW) after = undefined
  const end = Math.min(before ?? size, size)
  let start = after !== undefined ? Math.min(after, end) : Math.max(0, end - WINDOW)
  const handle = await open(path, "r")
  let text = ""
  try {
    const buf = Buffer.alloc(end - start)
    await handle.read(buf, 0, buf.length, start)
    text = buf.toString("utf8")
  } finally {
    await handle.close()
  }
  // Start on a whole line (`after` always is one), and stop before a line
  // still being written: the next read picks it up.
  if (after === undefined && start > 0) {
    const cut = text.indexOf("\n") + 1
    start += Buffer.byteLength(text.slice(0, cut))
    text = text.slice(cut)
  }
  const whole = text.lastIndexOf("\n") + 1
  const stop = start + Buffer.byteLength(text.slice(0, whole))
  const rows = []
  for (const line of text.slice(0, whole).split("\n")) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"') && !line.includes('"queued_command"')) continue
    try {
      rows.push(JSON.parse(line))
    } catch {}
  }
  return { items: foldPlans(toItems(rows)), start, end: stop, hasMore: after === undefined && start > 0 }
}

const TAIL = 64 * 1024
const tailCache = new Map<string, { size: number; isInterrupted: boolean }>()

// Whether the conversation's last word is the person stopping Claude (Esc):
// the hooks then never hear a Stop, and the session would look busy forever.
export async function isInterrupted(id: string): Promise<boolean> {
  const path = await transcriptPath(id)
  if (!path) return false
  const { size } = await stat(path)
  const hit = tailCache.get(path)
  if (hit?.size === size) return hit.isInterrupted
  const handle = await open(path, "r")
  let text = ""
  try {
    const from = Math.max(0, size - TAIL)
    const buf = Buffer.alloc(size - from)
    await handle.read(buf, 0, buf.length, from)
    text = buf.toString("utf8")
  } finally {
    await handle.close()
  }
  let isStopped = false
  for (const line of text.split("\n").reverse()) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
    let row: any
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.isMeta) continue
    // Also inside a tool result: "[Request interrupted by user for tool use]".
    isStopped = row.type === "user" && JSON.stringify(row.message?.content ?? "").includes("[Request interrupted by user")
    break
  }
  tailCache.set(path, { size, isInterrupted: isStopped })
  return isStopped
}
