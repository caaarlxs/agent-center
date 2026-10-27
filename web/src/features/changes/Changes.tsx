// The "Changes" workspace: the session's diff against where its branch
// started (with what is not committed yet), read again every 5 seconds. The
// changed files on the left; on the right, line by line (a click on a line
// leaves a comment; the comments go to the session as one message) or side by
// side in Monaco's diff view.
import { DiffEditor } from "@monaco-editor/react"
import { MessageSquarePlus, Send } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { FileIcon } from "@/components/common/FileIcon"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { get } from "@/lib/api"
import { keep, load } from "@/lib/store"
import type { Changes as ChangesData, FileDiff } from "@/lib/api-types"
import { monacoTheme, useMonaco } from "@/lib/monaco"
import { cn } from "@/lib/utils"
import { sendMessage } from "@/features/conversation/send"
import { type LineComment, keyOf, reviewMessage } from "./review"

const FOLLOW_MS = 5000
const STATUS = { added: ["A", "text-emerald-400"], deleted: ["D", "text-rose-400"], renamed: ["R", "text-sky-400"], modified: ["M", "text-amber-400"] } as const

function useChanges(id: string) {
  const [data, setData] = useState<ChangesData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const last = useRef("")
  useEffect(() => {
    let alive = true
    const read = () =>
      get<ChangesData>(`/api/sessions/${encodeURIComponent(id)}/changes`).then(
        res => {
          const text = JSON.stringify(res)
          if (alive && text !== last.current) ((last.current = text), setData(res), setError(null))
        },
        (err: Error) => alive && setError(err.message),
      )
    read()
    const timer = setInterval(() => document.visibilityState === "visible" && read(), FOLLOW_MS)
    return () => ((alive = false), clearInterval(timer))
  }, [id])
  return { data, error }
}

// A comment draft survives closing the panel, per session.
function useComments(id: string) {
  const key = `review.${id}`
  const [comments, setComments] = useState<Record<string, LineComment>>(() => {
    try {
      return load(key, {})
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      keep(key, comments)
    } catch {}
  }, [key, comments])
  return [comments, setComments] as const
}

function FileList({ files, chosen, onPick, notes }: { files: FileDiff[]; chosen: string | null; onPick: (f: FileDiff) => void; notes: Record<string, number> }) {
  return (
    <aside className="flex min-h-0 flex-col border-r bg-sidebar/40">
      <header className="px-3 py-2 text-xs font-medium text-muted-foreground">{files.length} {files.length === 1 ? "file" : "files"} changed</header>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {files.map(f => {
          const [letter, tone] = STATUS[f.status]
          const dir = f.path.split("/").slice(0, -1).join("/")
          return (
            <button key={f.path} onClick={() => onPick(f)} title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent", chosen === f.path && "bg-accent")}>
              <FileIcon path={f.path} />
              <span className="min-w-0 flex-1 truncate">
                <span className={cn(f.status === "deleted" && "line-through")}>{f.path.split("/").pop()}</span>
                {dir && <span className="ml-1.5 text-[11px] text-muted-foreground">{dir}</span>}
              </span>
              {notes[f.path] > 0 && <span className="text-[11px] text-amber-400"><MessageSquarePlus className="inline size-3" />{notes[f.path]}</span>}
              <span className="font-mono text-[10.5px] text-emerald-400">{f.additions > 0 && `+${f.additions}`}</span>
              <span className="font-mono text-[10.5px] text-rose-400">{f.deletions > 0 && `−${f.deletions}`}</span>
              <span className={cn("w-3 text-center font-mono text-[10.5px] font-semibold", tone)}>{letter}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function CommentBox({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial)
  return (
    <div className="space-y-2 border-y bg-card p-2 font-sans" onClick={e => e.stopPropagation()}>
      <Textarea autoFocus rows={2} value={text} placeholder="What needs to change here?" onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), onSave(text))
          if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), onCancel())
        }} />
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button><Button size="sm" onClick={() => onSave(text)}>Save</Button></div>
    </div>
  )
}

function Lines({ files, comments, setComments }: { files: FileDiff[]; comments: Record<string, LineComment>; setComments: (f: (c: Record<string, LineComment>) => Record<string, LineComment>) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const save = (c: LineComment) => {
    const key = keyOf(c)
    setComments(cs => {
      const { [key]: _, ...rest } = cs
      return c.text.trim() ? { ...rest, [key]: c } : rest
    })
    setEditing(null)
  }
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
      {files.map(f => (
        <section key={f.path} id={`diff-${f.path}`} className="overflow-hidden rounded-lg border">
          <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs"><FileIcon path={f.path} /><span className="truncate font-medium">{f.path}</span></header>
          {f.binary ? <p className="p-3 text-xs text-muted-foreground">Binary file.</p> : f.collapsed ? <p className="p-3 text-xs text-muted-foreground">Generated or dependency file: not shown.</p> : (
            <div className="overflow-x-auto font-mono text-[12px] leading-[1.55]">
              {f.hunks.map((h, i) => (
                <div key={i}>
                  {h.header && <div className="bg-sky-400/5 px-3 text-[11px] text-sky-300/70">{h.header}</div>}
                  {h.lines.map((l, j) => {
                    const side = l.kind === "del" ? "old" : "new"
                    const no = (side === "old" ? l.old : l.new) ?? 0
                    const key = keyOf({ path: f.path, side, no })
                    const comment = comments[key]
                    return (
                      <div key={j}>
                        <div onClick={() => setEditing(key)} title="Click to comment on this line"
                          className={cn("grid cursor-pointer grid-cols-[40px_40px_16px_max-content] hover:brightness-125",
                            l.kind === "add" && "bg-emerald-500/10", l.kind === "del" && "bg-rose-500/10", comment && "outline outline-1 outline-amber-400/50")}>
                          <span className="pr-2 text-right text-muted-foreground/50 select-none">{l.old ?? ""}</span>
                          <span className="pr-2 text-right text-muted-foreground/50 select-none">{l.new ?? ""}</span>
                          <span className={cn("select-none", l.kind === "add" ? "text-emerald-400" : l.kind === "del" ? "text-rose-400" : "")}>{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                          <span className="whitespace-pre pr-4">{l.text || " "}</span>
                        </div>
                        {editing === key ? <CommentBox initial={comment?.text ?? ""} onCancel={() => setEditing(null)} onSave={text => save({ path: f.path, side, no, code: l.text, text })} />
                          : comment && <button onClick={() => setEditing(key)} className="block w-full border-y bg-amber-400/5 px-3 py-1.5 text-left font-sans text-xs text-amber-200">{comment.text}</button>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function SideBySide({ id, file }: { id: string; file: FileDiff | null }) {
  const monaco = useMonaco()
  const [versions, setVersions] = useState<{ original: string; modified: string } | null>(null)
  useEffect(() => {
    if (!file) return
    const q = new URLSearchParams({ path: file.path, ...(file.oldPath ? { old: file.oldPath } : {}) })
    get<{ original: string; modified: string }>(`/api/sessions/${encodeURIComponent(id)}/codeversions?${q}`).then(setVersions, (err: Error) => toast.error(err.message))
  }, [id, file])
  if (!monaco.ready) return <p className="grid flex-1 place-items-center text-sm text-muted-foreground">{monaco.error ?? `Getting the editor ready… ${Math.round((monaco.progress ?? 0) * 100)}%`}</p>
  if (!file || !versions) return <p className="grid flex-1 place-items-center text-sm text-muted-foreground">Pick a file.</p>
  return (
    <div className="min-h-0 flex-1">
      <DiffEditor original={versions.original} modified={versions.modified} originalModelPath={`base/${file.oldPath ?? file.path}`} modifiedModelPath={`now/${file.path}`}
        theme={monacoTheme()} options={{ readOnly: true, fontSize: 13, automaticLayout: true, useInlineViewWhenSpaceIsLimited: true, renderSideBySide: true }} />
    </div>
  )
}

export function Changes({ id }: { id: string }) {
  const { data, error } = useChanges(id)
  const [view, setView] = useState<"lines" | "side">(() => (load<string>("changesView", "lines") === "side" ? "side" : "lines"))
  const [chosen, setChosen] = useState<FileDiff | null>(null)
  const [comments, setComments] = useComments(id)
  const notes = useMemo(() => Object.values(comments).reduce<Record<string, number>>((n, c) => ((n[c.path] = (n[c.path] ?? 0) + 1), n), {}), [comments])
  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Reading the changes…</p>
  const pick = (f: FileDiff) => (setChosen(f), view === "lines" && document.getElementById(`diff-${f.path}`)?.scrollIntoView({ block: "start", behavior: "smooth" }))
  const add = data.files.reduce((s, f) => s + f.additions, 0)
  const del = data.files.reduce((s, f) => s + f.deletions, 0)
  const list = Object.values(comments)
  const send = () => sendMessage(id, reviewMessage(list, data.branch), "Comments sent").then(() => setComments(() => ({})), (err: Error) => toast.error(err.message))
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
        <span><b className="text-foreground">{data.files.length}</b> files · <b className="text-emerald-400">+{add}</b> <b className="text-rose-400">−{del}</b></span>
        <span className="truncate">{data.branch ? `${data.branch} against ${data.base}` : `against ${data.base}`}, with uncommitted changes</span>
        <ToggleGroup type="single" size="sm" variant="outline" value={view} className="ml-auto"
          onValueChange={v => v && (setView(v as "lines" | "side"), keep("changesView", v))}>
          <ToggleGroupItem value="lines">Lines</ToggleGroupItem>
          <ToggleGroupItem value="side">Side by side</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {data.files.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No changes against {data.base}.</p> : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,28%)_minmax(0,1fr)]">
          <FileList files={data.files} chosen={chosen?.path ?? null} onPick={pick} notes={notes} />
          <div className="flex min-h-0 flex-col">
            {view === "lines" ? <Lines files={data.files} comments={comments} setComments={setComments} /> : <SideBySide id={id} file={chosen ?? data.files.find(f => !f.binary && !f.collapsed) ?? null} />}
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="flex items-center gap-2 border-t px-4 py-2">
          <span className="flex-1 text-sm font-medium">{list.length} {list.length === 1 ? "comment" : "comments"}</span>
          <Button size="sm" variant="ghost" onClick={() => setComments(() => ({}))}>Discard</Button>
          <Button size="sm" onClick={send}><Send />Send to the session</Button>
        </div>
      )}
    </div>
  )
}
