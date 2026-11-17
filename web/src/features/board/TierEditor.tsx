// Edit tiers: the person's own rows for the tier list. Each change is saved at
// once, whole (POST /api/tiers; lib/board.ts setTiers keeps them): a row's
// name (click it), its colour, its place (up, down), a new row, a row removed
// (twice to confirm when it holds cards, which go to the last row), and the
// default rows back. Paused stays last and is not edited.
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { post } from "@/lib/api"
import { toast } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { useConfirm } from "@/features/jira/confirm"
import { DEFAULT_ROWS, MAX_ROWS, ROW_COLORS, type Row, addRow, heirOf, moveRow, recolorRow, removeRow, renameRow } from "./tiers"

export async function saveRows(rows: Row[]) {
  try {
    await post("/api/tiers", { tiers: rows })
  } catch (err) {
    toast.error((err as Error).message || "Could not save the tiers")
  }
}

const iconBtn = "inline-grid size-6 place-items-center rounded-md text-text-muted hover:bg-press hover:text-text disabled:opacity-30 disabled:hover:bg-transparent [&_svg]:size-3.5"

// Above the rows: Edit tiers, and while editing, a new row, the default ones back, and Done.
export function TiersBar({ rows, isEditing, onEditing }: { rows: Row[]; isEditing: boolean; onEditing: (on: boolean) => void }) {
  const isDefault = JSON.stringify(rows) === JSON.stringify(DEFAULT_ROWS)
  if (!isEditing) return (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" className="h-7 text-text-muted" onClick={() => onEditing(true)}>Edit tiers</Button>
    </div>
  )
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="ghost" size="sm" className="h-7" disabled={rows.length >= MAX_ROWS} title={rows.length >= MAX_ROWS ? `${MAX_ROWS} tiers at most` : undefined}
        onClick={() => void saveRows(addRow(rows))}><Plus />Add tier</Button>
      <Button variant="ghost" size="sm" className="h-7" disabled={isDefault} onClick={() => void saveRows(DEFAULT_ROWS)}><RotateCcw />Reset</Button>
      <Button size="sm" className="h-7" onClick={() => onEditing(false)}>Done</Button>
    </div>
  )
}

// A row's head while editing: its name to type, its colour, up, down and remove.
export function TierHeadEdit({ row, rows, count }: { row: Row; rows: Row[]; count: number }) {
  const [name, setName] = useState(row.label)
  const [isAsking, confirm] = useConfirm()
  const i = rows.findIndex(r => r.key === row.key)
  const heir = heirOf(rows, row.key)
  const rename = () => name.trim() !== row.label && void saveRows(renameRow(rows, row.key, name))
  const remove = () => {
    const go = () => void saveRows(removeRow(rows, row.key))
    if (count) confirm(go)
    else go()
  }
  return (
    <div className="flex w-full flex-col items-stretch gap-1.5">
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`Colour of ${row.label}`} className="size-4 flex-none rounded-full ring-1 ring-black/10" style={{ background: row.color }} />
          <DropdownMenuContent className="grid grid-cols-5 gap-1 p-1.5">
            {ROW_COLORS.map(c => (
              <DropdownMenuItem key={c} aria-label={c} onSelect={() => void saveRows(recolorRow(rows, row.key, c))}
                className={cn("size-6 justify-center rounded-full p-0", c === row.color && "ring-2 ring-text")} style={{ background: c }} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <input value={name} onChange={e => setName(e.target.value)} onBlur={rename} onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={40} aria-label="Tier name"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 text-sm font-bold outline-none focus:border-brand" />
      </div>
      <div className="flex items-center justify-center gap-0.5">
        <button type="button" className={iconBtn} disabled={i === 0} aria-label="Up" onClick={() => void saveRows(moveRow(rows, row.key, -1))}><ChevronUp /></button>
        <button type="button" className={iconBtn} disabled={i === rows.length - 1} aria-label="Down" onClick={() => void saveRows(moveRow(rows, row.key, 1))}><ChevronDown /></button>
        <button type="button" className={cn(iconBtn, isAsking && "bg-bad text-white hover:bg-bad hover:text-white")} disabled={rows.length === 1}
          aria-label={`Remove ${row.label}`} onClick={remove}
          title={count && heir ? (isAsking ? `Click again: its ${count} ${count === 1 ? "card goes" : "cards go"} to ${heir.label}` : `Its ${count === 1 ? "card goes" : "cards go"} to ${heir.label}`) : undefined}>
          <Trash2 />
        </button>
      </div>
    </div>
  )
}
