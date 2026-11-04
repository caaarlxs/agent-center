// The header of a session's Tickets tab: its tickets as a tree, each under
// what it sits in up to its epic (tree.ts), each with its kind in words, so
// epic, stories, tasks and sub-tasks read at a glance. What a linked ticket sits in shows too, quieter,
// though it is not linked. A click picks the ticket the detail below shows;
// × unlinks one; the field at the foot links another.
import { X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { get } from "@/lib/api"
import type { Card, TicketRow } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { WHY } from "./jira"
import { KindMark, KindName, TONE, kindLabel } from "./kinds"
import { type TreeNode, treeOf } from "./tree"

// The linked tickets with what they sit in, asked when the set changes; until
// then, the same tickets with nothing above them.
function useRows(card: Card): TicketRow[] {
  const tickets = card.tickets ?? []
  const keys = tickets.map(t => t.key).sort().join(",")
  const [rows, setRows] = useState<{ keys: string; rows: TicketRow[] } | null>(null)
  useEffect(() => {
    if (!keys) return
    let alive = true
    get<{ rows: TicketRow[] }>(`/api/jira/rows?keys=${encodeURIComponent(keys)}`).then(r => alive && setRows({ keys, rows: r.rows }), () => {})
    return () => void (alive = false)
  }, [keys])
  if (rows?.keys === keys) return rows.rows
  return tickets.map(t => ({ ...t, type: null, statusId: "", priority: null, sprint: null, updated: 0, parent: null, epic: null, isMine: false }))
}

function Branch({ node, depth, card, shown, onPick, onUnlink }: { node: TreeNode; depth: number; card: Card; shown: string | null; onPick: (key: string) => void; onUnlink: (key: string) => void }) {
  const t = node.ticket
  const why = node.isLinked ? card.tickets?.find(x => x.key === t.key)?.why : undefined
  const isEpic = t.kind === "epic"
  return (
    <li className="min-w-0">
      <div className={cn("group flex min-w-0 items-center gap-2 rounded-[8px] px-2", isEpic ? "py-2" : "py-1.5", t.key === shown ? "bg-select" : "hover:bg-hover", !node.isLinked && "opacity-75")}>
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onPick(t.key)} title={`${kindLabel(t.kind)} ${t.key} · ${t.summary}\n${why ? `Linked: ${WHY[why]}` : "Not linked: a linked ticket sits in it"}`}>
          <KindMark kind={t.kind} type={t.type} size={isEpic ? 18 : 15} />
          <KindName kind={t.kind} />
          <span className="shrink-0 font-mono text-xs font-semibold text-text-muted">{t.key}</span>
          <span className={cn("min-w-0 flex-1 truncate", isEpic ? "text-[13.5px] font-semibold" : "text-[13px]", !node.isLinked && "text-text-muted", t.tone === "done" && "line-through decoration-faint")}>{t.summary}</span>
          <span className={cn("shrink-0 rounded px-1.5 text-[11px] font-semibold", TONE[t.tone])}>{t.status}</span>
        </button>
        {node.isLinked ? (
          <button className="grid size-5 shrink-0 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-press hover:text-text focus-visible:opacity-100" title={`Unlink ${t.key}`} onClick={() => onUnlink(t.key)}>
            <X size={13} />
          </button>
        ) : <span className="size-5 shrink-0" />}
      </div>
      {node.children.length > 0 && (
        <ul className="m-0 list-none border-l border-line p-0 pl-2.5" style={{ marginLeft: depth === 0 && isEpic ? 17 : 15 }}>
          {node.children.map(c => <Branch key={c.ticket.key} node={c} depth={depth + 1} card={card} shown={shown} onPick={onPick} onUnlink={onUnlink} />)}
        </ul>
      )}
    </li>
  )
}

export function TicketTree({ card, shown, onPick, onUnlink, footer }: { card: Card; shown: string | null; onPick: (key: string) => void; onUnlink: (key: string) => void; footer: React.ReactNode }) {
  const rows = useRows(card)
  const tree = useMemo(() => treeOf(rows), [rows])
  return (
    <section className="flex flex-col gap-2 rounded-[12px] border border-line bg-side p-3" aria-label="Linked tickets">
      <b className="px-1 text-[11px] font-semibold tracking-[0.05em] text-faint uppercase">Linked tickets · {card.tickets?.length ?? 0}</b>
      {tree.length ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {tree.map(n => <Branch key={n.ticket.key} node={n} depth={0} card={card} shown={shown} onPick={onPick} onUnlink={onUnlink} />)}
        </ul>
      ) : <p className="m-0 px-1 text-[13px] text-text-muted">No ticket linked yet.</p>}
      <div className="border-t border-line px-1 pt-2.5">{footer}</div>
    </section>
  )
}
