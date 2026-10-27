// The tree of changed files (code.js ChangedTree): compact folders that fold,
// each file with its type, comments, +/− and status letter.
import { ChevronRight, Folder, FolderOpen, Pencil } from "lucide-react"
import { useMemo, useState } from "react"
import { FileIcon } from "@/components/common/FileIcon"
import type { FileDiff } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { compactTree, type Folder as Node } from "@/features/code/tree"

const LETTER = { added: "A", deleted: "D", renamed: "R", modified: "M" } as const
const TONE = { added: "text-work", deleted: "text-bad", renamed: "text-review", modified: "text-ask" } as const
const row = "flex h-6 w-full items-center rounded-[5px] pr-1.5 text-left text-[12.5px] text-text hover:bg-hover"

function Rows({ node, depth, byPath, chosen, onPick, folded, onFold, notes }: {
  node: Node; depth: number; byPath: Map<string, FileDiff>; chosen: string | null; onPick: (f: FileDiff) => void
  folded: Set<string>; onFold: (path: string) => void; notes: Record<string, number> | null
}) {
  return (
    <>
      {[...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, dir]) => {
        const isOpen = !folded.has(dir.path)
        return (
          <div key={dir.path}>
            <button className={cn(row, "gap-[5px]")} style={{ paddingLeft: 8 + depth * 12 }} onClick={() => onFold(dir.path)} aria-expanded={isOpen}>
              <ChevronRight className={cn("size-3 shrink-0 text-text-muted transition-transform duration-[120ms] ease-(--ease-out)", isOpen && "rotate-90")} />
              {isOpen ? <FolderOpen className="size-3.5 shrink-0 fill-[#dcb67a]/25 text-[#dcb67a]" /> : <Folder className="size-3.5 shrink-0 fill-[#c99a3b]/25 text-[#c99a3b]" />}
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
            {isOpen && <Rows node={dir} depth={depth + 1} byPath={byPath} chosen={chosen} onPick={onPick} folded={folded} onFold={onFold} notes={notes} />}
          </div>
        )
      })}
      {node.files.map(path => {
        const f = byPath.get(path)!
        const n = notes?.[path] ?? 0
        return (
          <button key={path} className={cn(row, "gap-1.5", path === chosen && "bg-select hover:bg-select")} style={{ paddingLeft: 24 + depth * 12 }}
            onClick={() => onPick(f)} title={f.oldPath ? `${f.oldPath} → ${path}` : path}>
            <FileIcon path={path} />
            <span className={cn("min-w-0 flex-1 truncate", f.status === "modified" && "text-ask", f.status === "deleted" && "text-bad line-through")}>{path.split("/").pop()}</span>
            {n > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] text-ask" title={`${n} ${n === 1 ? "comment" : "comments"}`}><Pencil className="size-2.5" />{n}</span>}
            <span className="flex shrink-0 gap-1 font-mono text-[10.5px] font-medium">
              {f.additions > 0 && <b className="font-medium text-work">+{f.additions}</b>}{f.deletions > 0 && <b className="font-medium text-bad">−{f.deletions}</b>}
            </span>
            <span className={cn("w-3 shrink-0 text-center font-mono text-[10.5px] font-semibold", TONE[f.status])}>{LETTER[f.status]}</span>
          </button>
        )
      })}
    </>
  )
}

export function ChangedTree({ files, chosen, onPick, notes = null }: { files: FileDiff[]; chosen: string | null; onPick: (f: FileDiff) => void; notes?: Record<string, number> | null }) {
  const root = useMemo(() => compactTree(files.map(f => f.path)), [files])
  const byPath = useMemo(() => new Map(files.map(f => [f.path, f])), [files])
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const fold = (path: string) => setFolded(f => {
    const next = new Set(f)
    if (!next.delete(path)) next.add(path)
    return next
  })
  return (
    <aside aria-label="Changed files" className="flex min-h-0 flex-col border-r border-line bg-side">
      <header className="flex items-center gap-1.5 pt-2 pr-2 pb-1.5 pl-3 text-[11.5px] tracking-[0.04em] text-text-muted uppercase">
        <b className="truncate font-semibold">{files.length} {files.length === 1 ? "file" : "files"} changed</b>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-3">
        <Rows node={root} depth={0} byPath={byPath} chosen={chosen} onPick={onPick} folded={folded} onFold={fold} notes={notes} />
      </div>
    </aside>
  )
}
