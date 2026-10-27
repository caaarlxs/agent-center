// A conversation's items as the transcript gives them (lib/transcript.ts),
// put together as the desktop app shows them. Pure: tested on its own.
import { applyPlanOp } from "@server/plan-op"
import type { Item } from "@/lib/api-types"

export type NextItem = Extract<Item, { kind: "next" }> & { picked?: string }
export type Shown = Exclude<Item, { kind: "next" | "planStep" }> | NextItem

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
// one task list per turn, the newest; tool runs split only by invisible steps
// are one run.
export function normalize(items: Item[]): Shown[] {
  const out: Shown[] = []
  let next: NextItem | null = null
  const close = (reply: Extract<Item, { kind: "user" }> | null) => {
    if (!next) return
    const pick = reply && next.actions.find(a => {
      const m = squash(a.message)
      return m && (squash(reply.text) === m || (/[:…]$/.test(m) && squash(reply.text).startsWith(m)))
    })
    out.push(pick ? { ...next, picked: pick.label } : next)
    next = null
  }
  let planAt = -1
  for (const item of items) {
    const last = out.at(-1)
    if (item.kind === "next") next = item
    else if (item.kind === "planStep") continue
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
