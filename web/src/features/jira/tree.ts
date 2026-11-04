// A session's tickets as a tree (the header of its Tickets tab): each under
// what it sits in, up to its epic; what it sits in shows even when it is not
// linked, so the relation reads at a glance. Epics first, then stories,
// tasks, bugs and sub-tasks; by number within a kind.
import type { TicketRef, TicketRow } from "@/lib/api-types"

export type TreeNode = { ticket: TicketRef; isLinked: boolean; children: TreeNode[] }

const RANK: Record<TicketRef["kind"], number> = { epic: 0, story: 1, task: 2, bug: 3, subtask: 4 }
const numberOf = (key: string) => Number(key.split("-").pop()) || 0
const order = (a: TreeNode, b: TreeNode) => RANK[a.ticket.kind] - RANK[b.ticket.kind] || numberOf(a.ticket.key) - numberOf(b.ticket.key)

export function treeOf(rows: TicketRow[]): TreeNode[] {
  const nodes = new Map<string, TreeNode & { above: string | null }>()
  const place = (ticket: TicketRef, above: string | null, isLinked: boolean) => {
    const had = nodes.get(ticket.key)
    if (had) return void ((had.isLinked ||= isLinked), (had.above ??= above))
    nodes.set(ticket.key, { ticket, isLinked, children: [], above })
  }
  for (const r of rows) {
    const epic = r.epic && r.epic.key !== r.key ? r.epic : null
    const parent = r.parent && r.parent.key !== epic?.key ? r.parent : null
    if (epic) place(epic, null, false)
    if (parent) place(parent, epic?.key ?? null, false)
    place(r, parent?.key ?? epic?.key ?? null, true)
  }
  const roots: TreeNode[] = []
  for (const n of nodes.values()) (n.above && nodes.has(n.above) ? nodes.get(n.above)!.children : roots).push(n)
  const sort = (list: TreeNode[]): TreeNode[] => list.sort(order).map(n => ({ ticket: n.ticket, isLinked: n.isLinked, children: sort(n.children) }))
  return sort(roots)
}
