// A conversation's items as the transcript gives them (lib/transcript.ts),
// put together as the desktop app shows them. Pure: tested on its own.
import { applyPlanOp } from "@server/plan-op"
import type { Item } from "@/lib/api-types"

export type NextItem = Extract<Item, { kind: "next" }> & { picked?: string }
// A suggested task Claude took back (dismiss_task) says so: `isGone`.
export type SuggestionItem = Extract<Item, { kind: "suggestion" }> & { isGone?: boolean }
// The files a turn changed, as the app's "N files changed" box: one row per
// file, its edits added up, in the order first changed.
export type EditsItem = { key: string; kind: "edits"; files: { path: string; added: number; removed: number }[] }
export type Shown = Exclude<Item, { kind: "next" | "planStep" | "suggestion" | "suggestionGone" | "edit" }> | NextItem | SuggestionItem | EditsItem

// Items read later join the list: a task list's step moves the list it
// belongs to, and tool runs that follow each other are one run.
export function append(items: Item[], more: Item[]): Item[] {
  let out = items
  for (const item of more) {
    const last = out.at(-1)
    if (item.kind === "planStep") {
      const at = out.findLastIndex(i => i.kind === "plan")
      if (at >= 0) out = out.map((i, k) => (k === at && i.kind === "plan" ? { ...i, steps: applyPlanOp(i.steps, item.op) } : i))
    } else if (last?.kind === "tools" && item.kind === "tools") out = [...out.slice(0, -1), { ...last, lines: [...last.lines, ...item.lines] }]
    else out = [...out, item]
  }
  return out
}

const squash = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim()

// As the app shows a turn: one "next step" box (the last one sent) at the end
// of the turn, with the button the person picked when their next message is
// that button's text (a template counts when the message starts with it);
// one task list per turn, the newest; the files the turn changed in one box
// at its end, before the "next step" box; tool runs split only by invisible
// steps are one run; a suggested task Claude took back says so.
export function normalize(items: Item[]): Shown[] {
  const out: Shown[] = []
  let next: NextItem | null = null
  let edits: EditsItem | null = null
  const close = (reply: Extract<Item, { kind: "user" }> | null) => {
    if (edits) out.push(edits)
    edits = null
    if (!next) return
    const pick = reply && next.actions.find(a => {
      const m = squash(a.message)
      return m && (squash(reply.text) === m || (/[:…]$/.test(m) && squash(reply.text).startsWith(m)))
    })
    out.push(pick ? { ...next, picked: pick.label } : next)
    next = null
  }
  let planAt = -1
  const gone = new Set(items.flatMap(i => (i.kind === "suggestionGone" ? [i.taskId] : [])))
  for (const item of items) {
    const last = out.at(-1)
    if (item.kind === "suggestionGone" || item.kind === "planStep") continue
    if (item.kind === "edit") {
      edits ??= { key: `${item.key}:edits`, kind: "edits", files: [] }
      const file = edits.files.find(f => f.path === item.path)
      if (file) {
        file.added += item.added
        file.removed += item.removed
      } else edits.files.push({ path: item.path, added: item.added, removed: item.removed })
      continue
    }
    if (item.kind === "suggestion" && item.taskId && gone.has(item.taskId)) out.push({ ...item, isGone: true })
    else if (item.kind === "next") next = item
    else if (item.kind === "user" && !item.isMidTurn) (close(item), out.push(item), (planAt = -1))
    else if (item.kind === "plan") {
      if (planAt >= 0) out.splice(planAt, 1)
      planAt = out.length
      out.push(item)
    } else if (item.kind === "tools" && last?.kind === "tools") out[out.length - 1] = { ...last, lines: [...last.lines, ...item.lines] }
    else out.push(item)
  }
  close(null)
  return out
}
