// When a ticket of yours and its sessions' pull requests disagree: a PR open
// while the ticket is still before review, or merged while the ticket is
// still in review or before. The hint names the PR and the board column the
// ticket would move to (review, or the one after it).
import type { Card, TicketRow } from "@/lib/api-types"
import type { Column } from "./Tickets"

type Pr = Card["prs"][number]
export type SyncHint = { pr: Pr; isMerged: boolean; column: Column }

const REVIEW = /review|revis/i

export function syncHint(ticket: TicketRow, sessions: Card[], columns: Column[]): SyncHint | null {
  if (!ticket.isMine || ticket.tone === "done") return null
  const at = columns.findIndex(c => c.statusIds.includes(ticket.statusId))
  const review = columns.findIndex(c => REVIEW.test(c.name))
  if (at < 0 || review < 0) return null
  const merged = sessions.flatMap(s => s.mergedPrs ?? [])[0]
  const after = columns[review + 1]
  if (merged && after && at <= review) return { pr: merged, isMerged: true, column: after }
  const open = sessions.flatMap(s => s.prs ?? []).find(p => !p.isDraft)
  if (open && at < review) return { pr: open, isMerged: false, column: columns[review]! }
  return null
}
