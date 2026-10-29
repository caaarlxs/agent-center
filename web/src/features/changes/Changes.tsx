// The "Changes" workspace (changes.js): the session's diff against where its
// branch started (with what is not committed yet), read again every 5 s while
// the page shows. Line by line, file by file (a click on a line leaves a
// comment; the comments go to the session as one message, then the
// conversation shows; a draft survives closing the panel), with the tree of
// changed files beside it (it folds away); or side by side in Monaco's diff view.
import { DiffEditor } from "@monaco-editor/react"
import { ChevronRight, PanelLeft, Pencil } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { get } from "@/lib/api"
import { persistedStore } from "@/lib/store"
import type { Changes as ChangesData, FileDiff } from "@/lib/api-types"
import { type Tokens, ensureMonacoLang, useShikiTheme, useTokens } from "@/lib/code-theme"
import { useMonaco, useMonacoTheme } from "@/lib/monaco"
import { cn } from "@/lib/utils"
import { showTab } from "@/app/open-session"
import { sendMessage } from "@/features/conversation/send"
import { SideFlyout, useSideRoom } from "@/features/session/SideFlyout"
import { ChangedTree } from "./ChangedTree"
import { type LineComment, keyOf, reviewMessage } from "./review"
import { Anim } from "@/components/icons/animated"

const FOLLOW_MS = 5000
const MAX_LINES = 400 // a longer file opens folded
const changesView = persistedStore<"lines" | "side">("changesView", "lines")
const changesTree = persistedStore("changesTree", true)

function useChanges(id: string) {
  const [data, setData] = useState<ChangesData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const last = useRef("")
  const read = () =>
    get<ChangesData>(`/api/sessions/${encodeURIComponent(id)}/changes`).then(
      res => {
        setError(null)
        const text = JSON.stringify(res)
        if (text !== last.current) ((last.current = text), setData(res)) // unchanged: nothing redraws
      },
      (err: Error) => setError(err.message || "Could not read the changes"),
    )
  useEffect(() => {
    void read()
    const timer = setInterval(() => document.visibilityState === "visible" && read(), FOLLOW_MS)
    return () => clearInterval(timer)
  }, [id])
  return { data, error, read }
}

// A comment draft survives closing the panel, per session (ac.review.<id>).
function useComments(id: string) {
  const store = useMemo(() => persistedStore<Record<string, LineComment>>(`review.${id}`, {}), [id])
  return [store.use(), store.set] as const
}

function CommentEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => area.current?.focus(), [])
  const save = () => onSave(area.current?.value ?? "")
  return (
    <div className="mt-1 mr-2.5 mb-1.5 ml-24 flex flex-col gap-1.5 font-sans" onClick={e => e.stopPropagation()}>
      <textarea ref={area} rows={2} defaultValue={initial} placeholder="What needs to change here?"
        className="resize-y rounded-lg border border-brand bg-surface px-[9px] py-[7px] text-[13px]/[1.45] text-text shadow-[0_0_0_3px_var(--brand-soft)] outline-none"
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), save())
          if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), onCancel())
        }} />
      <div className="flex items-center gap-1.5">
        <span className="flex flex-1 items-center gap-1 text-[11.5px] text-text-muted"><Kbd>⌘</Kbd><Kbd>↵</Kbd> save · <Kbd>Esc</Kbd> cancel</span>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button><Button onClick={save}>Save</Button>
      </div>
    </div>
  )
}

const STATUS_WORD = { added: ["new", "text-work"], deleted: ["deleted", "text-bad"], renamed: ["renamed", "text-review"], modified: ["", ""] } as const

// One hunk of a file's diff, its lines coloured in the code theme (as one
// text, so a string or a comment that spans lines reads right), on the
// theme's own background; plain until the colours are there, or with them off.
function Hunk({ path, text, children }: { path: string; text: string; children: (tokens: Tokens | null) => React.ReactNode }) {
  const tokens = useTokens(text, path, useShikiTheme())
  return (
    <div className="overflow-x-auto [&+&]:border-t [&+&]:border-dashed [&+&]:border-line" style={tokens ? { background: tokens.bg, color: tokens.fg } : undefined}>
      {children(tokens)}
    </div>
  )
}

function FileBlock({ file, comments, editing, setEditing, save, remove }: {
  file: FileDiff; comments: Record<string, LineComment>; editing: string | null; setEditing: (key: string | null) => void
  save: (c: LineComment) => void; remove: (key: string) => void
}) {
  const total = file.hunks.reduce((n, h) => n + h.lines.length, 0)
  const [isOpen, setOpen] = useState(!file.collapsed && total <= MAX_LINES)
  const count = Object.values(comments).filter(c => c.path === file.path).length
  const [word, tone] = STATUS_WORD[file.status]
  return (
    <section id={`df-${file.path}`} className="rounded-[10px] border border-line bg-surface">
      <header onClick={() => setOpen(!isOpen)}
        className="sticky -top-2.5 z-[1] flex cursor-pointer items-center gap-2 rounded-t-[10px] border-b border-line bg-raised px-2.5 py-[7px] text-[12.5px]">
        <ChevronRight className={cn("size-3 shrink-0 text-faint transition-transform duration-150 ease-(--ease-out)", isOpen && "rotate-90")} />
        {word && <span className={cn("text-[10.5px] font-bold tracking-[0.04em] uppercase", tone)}>{word}</span>}
        <span className="min-w-0 flex-1 truncate text-left font-mono text-xs [direction:rtl]" title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>{file.path}</span>
        {count > 0 && <span className="rounded-md bg-ask-soft px-1.5 py-px text-[11px] font-medium text-ask">{count} {count === 1 ? "comment" : "comments"}</span>}
        <span className="text-xs whitespace-nowrap"><b className="font-[650] text-work">+{file.additions}</b> <b className="font-[650] text-bad">−{file.deletions}</b></span>
      </header>
      {isOpen && (file.binary ? <p className="m-0 px-3 py-2.5 text-xs text-text-muted">Binary file.</p>
        : file.collapsed ? <p className="m-0 px-3 py-2.5 text-xs text-text-muted">Generated or dependency file: not shown.</p>
        : file.hunks.map((h, i) => (
          <Hunk key={i} path={file.path} text={h.lines.map(l => l.text).join("\n")}>{tokens => (<>
            {h.header && <div className="bg-hover px-2.5 py-[3px] font-mono text-[11.5px] text-faint">{h.header}</div>}
            {h.lines.map((l, j) => {
              const side = l.kind === "del" ? "old" : "new"
              const no = (side === "old" ? l.old : l.new) ?? 0
              const key = keyOf({ path: file.path, side, no })
              const comment = comments[key]
              return (
                <div key={j}>
                  <div onClick={() => setEditing(key)} title="Click to comment on this line"
                    className={cn("grid min-w-full cursor-pointer grid-cols-[40px_40px_16px_max-content] font-mono text-xs/[1.55] hover:shadow-[inset_3px_0_0_var(--brand)]",
                      l.kind === "add" && "bg-[color-mix(in_srgb,var(--work)_11%,transparent)]", l.kind === "del" && "bg-[color-mix(in_srgb,var(--bad)_11%,transparent)]",
                      comment && "shadow-[inset_3px_0_0_var(--ask)]")}>
                    <span className="pr-2 text-right text-faint select-none">{l.old ?? ""}</span>
                    <span className="pr-2 text-right text-faint select-none">{l.new ?? ""}</span>
                    <span className={cn("text-faint select-none", l.kind === "add" && "text-work", l.kind === "del" && "text-bad")}>{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                    <span className="pr-4 whitespace-pre">{tokens?.lines[j]?.length ? tokens.lines[j].map((t, k) => <span key={k} style={{ color: t.color, fontStyle: t.fontStyle === 1 ? "italic" : undefined }}>{t.content}</span>) : l.text || " "}</span>
                  </div>
                  {editing === key ? (
                    <CommentEditor initial={comment?.text ?? ""} onCancel={() => setEditing(null)}
                      onSave={text => (text.trim() ? save({ path: file.path, side, no, code: l.text, text }) : comment ? remove(key) : setEditing(null))} />
                  ) : comment && (
                    <div onClick={() => setEditing(key)} title="Click to edit it"
                      className="mt-1 mr-2.5 mb-1.5 ml-24 flex cursor-pointer items-start gap-[7px] rounded-lg border border-[color-mix(in_srgb,var(--ask)_35%,transparent)] bg-ask-soft py-[7px] pr-2 pl-2.5 text-[12.5px] whitespace-pre-wrap">
                      <Pencil className="mt-0.5 size-3 shrink-0" /><span className="flex-1">{comment.text}</span>
                      <button className="inline-grid size-5 place-items-center rounded-md text-text-muted hover:bg-press hover:text-text" title="Remove the comment"
                        onClick={e => (e.stopPropagation(), remove(key))}><Anim.X size={12} /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </>)}</Hunk>
        )))}
    </section>
  )
}

// Monaco's diff view of the chosen file: where the branch started on the
// left, as it is now on the right; the tree of changed files beside it.
function SideBySide({ id, files }: { id: string; files: FileDiff[] }) {
  const hasSideRoom = useSideRoom()
  const monaco = useMonaco()
  const { theme, isPlain } = useMonacoTheme()
  const shown = files.filter(f => !f.binary && !f.collapsed)
  const [chosen, setChosen] = useState<FileDiff | null>(shown[0] ?? null)
  const [versions, setVersions] = useState<{ original: string; modified: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Its grammar, the first time a file of that language shows.
  useEffect(() => void (chosen && !isPlain && ensureMonacoLang(chosen.path)), [chosen, isPlain])
  useEffect(() => {
    if (!chosen) return
    const q = new URLSearchParams({ path: chosen.path, ...(chosen.oldPath ? { old: chosen.oldPath } : {}), ...(chosen.source ? { session: "1" } : {}) })
    get<{ original: string; modified: string }>(`/api/sessions/${encodeURIComponent(id)}/codeversions?${q}`).then(v => (setVersions(v), setError(null)), (err: Error) => setError(err.message || "Could not read it"))
  }, [id, chosen?.path, files])
  const wait = !monaco.ready ? (monaco.error ? `The editor could not load: ${monaco.error}` : monaco.progress != null ? `Downloading the editor (VS Code's Monaco, once)… ${Math.round(monaco.progress * 100)}%` : "Loading the editor…")
    : error ?? (!chosen ? "No text file changed." : null)
  return (
    <div className={cn("min-h-0 flex-1", hasSideRoom ? "flex" : "grid grid-cols-[minmax(210px,28%)_minmax(0,1fr)]")}>
      {/* The tree opens beside the panel, which keeps its width; inside it where there is no room. */}
      {hasSideRoom ? (
        <SideFlyout label="Changed files"><ChangedTree files={shown} chosen={chosen?.path ?? null} onPick={setChosen} /></SideFlyout>
      ) : (
        <ChangedTree files={shown} chosen={chosen?.path ?? null} onPick={setChosen} />
      )}
      <section className="flex min-h-0 min-w-0 flex-col">
        {chosen && <div className="shrink-0 truncate border-b border-line px-3 py-1.5 font-mono text-xs text-text-muted" title={chosen.path}>{chosen.oldPath ? `${chosen.oldPath} → ` : ""}{chosen.path}</div>}
        {wait ? <p className="grid flex-1 place-items-center text-text-muted">{wait}</p> : versions && chosen && (
          <div className="min-h-0 flex-1">
            <DiffEditor original={versions.original} modified={versions.modified} originalModelPath={`base/${isPlain ? "plain/" : ""}${chosen.oldPath ?? chosen.path}`} modifiedModelPath={`now/${isPlain ? "plain/" : ""}${chosen.path}`}
              language={isPlain ? "plaintext" : undefined}
              theme={theme} options={{ readOnly: true, fontSize: 13, automaticLayout: true, useInlineViewWhenSpaceIsLimited: true, renderSideBySide: true }} />
          </div>
        )}
      </section>
    </div>
  )
}

const seg = (isOn: boolean) => cn("h-6 rounded-md px-2.5 text-xs text-text-muted", isOn && "bg-surface text-text shadow-card")

export function Changes({ id }: { id: string }) {
  const hasSideRoom = useSideRoom()
  const { data, error, read } = useChanges(id)
  const view = changesView.use()
  const hasTree = changesTree.use()
  const [comments, setComments] = useComments(id)
  const [editing, setEditing] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [isSending, setSending] = useState(false)
  const notes = useMemo(() => Object.values(comments).reduce<Record<string, number>>((n, c) => ((n[c.path] = (n[c.path] ?? 0) + 1), n), {}), [comments])
  if (error && !data) return <p className="grid flex-1 place-items-center p-8 text-text-muted">{error}</p>
  if (!data) return <p className="grid flex-1 place-items-center p-8"><span className="spinner" /></p>
  const goTo = (f: FileDiff) => (setPicked(f.path), document.getElementById(`df-${f.path}`)?.scrollIntoView({ block: "start", behavior: "smooth" }))
  const save = (c: LineComment) => (setComments({ ...comments, [keyOf(c)]: c }), setEditing(null))
  const remove = (key: string) => {
    const { [key]: _, ...rest } = comments
    setComments(rest)
    setEditing(null)
  }
  const add = data.files.reduce((s, f) => s + f.additions, 0)
  const del = data.files.reduce((s, f) => s + f.deletions, 0)
  const list = Object.values(comments)
  const send = async () => {
    setSending(true)
    try {
      await sendMessage(id, reviewMessage(list, data.branch))
      setComments({})
      showTab("chat")
    } catch (err) {
      toast((err as Error).message || "Could not send")
    }
    setSending(false)
  }
  const n = data.files.length
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-[12.5px]">
        <span><b>{n}</b> {n === 1 ? "file" : "files"} · <b className="font-[650] text-work">+{add}</b> <b className="font-[650] text-bad">−{del}</b></span>
        <span className="min-w-0 flex-1 truncate text-xs text-text-muted" title={data.root}>{!data.base ? "What this session edited (no git repository)" : `${data.branch ? `${data.branch} against ${data.base}` : `against ${data.base}`}, with uncommitted changes${data.files.some(f => f.source) ? ", and what the session edited outside it" : ""}`}</span>
        {view === "lines" && (
          <button className={cn("inline-grid size-7 place-items-center rounded-[7px] text-text-muted hover:bg-press hover:text-text active:scale-[0.92]", hasTree && "text-brand hover:text-brand")}
            onClick={() => changesTree.set(!hasTree)} title={hasTree ? "Hide the tree" : "Show the tree of changed files"}><PanelLeft className="size-3.5" /></button>
        )}
        <span role="group" aria-label="View" className="inline-flex rounded-md bg-press p-0.5">
          <button className={seg(view === "lines")} onClick={() => changesView.set("lines")} title="Line by line, with comments for the session">Lines</button>
          <button className={seg(view === "side")} onClick={() => changesView.set("side")} title="Side by side, in VS Code's diff view">Side by side</button>
        </span>
        <Button variant="ghost" onClick={() => void read()}>Refresh</Button>
      </div>
      {view === "side" && n > 0 && <SideBySide key={data.files.map(f => f.path).join("|")} id={id} files={data.files} />}
      {data.truncated && <p className="m-0 px-3 py-2.5 text-xs text-text-muted">The diff is very large: only the start is shown.</p>}
      {n === 0 && <p className="grid flex-1 place-items-center p-8 text-text-muted">No changes against {data.base ?? "where the session started"}.</p>}
      {view === "lines" && n > 0 && (
        <div className={cn("flex min-h-0 flex-1", hasTree && !hasSideRoom && "grid grid-cols-[minmax(200px,30%)_minmax(0,1fr)]")}>
          {hasTree && (hasSideRoom
            ? <SideFlyout label="Changed files"><ChangedTree files={data.files} chosen={picked} onPick={goTo} notes={notes} /></SideFlyout>
            : <ChangedTree files={data.files} chosen={picked} onPick={goTo} notes={notes} />)}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto px-3 pt-2.5 pb-4">
            {data.files.map(f => <FileBlock key={f.path} file={f} comments={comments} editing={editing} setEditing={setEditing} save={save} remove={remove} />)}
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-4 py-2.5">
          <span className="flex-1 text-[13px] font-semibold">{list.length} {list.length === 1 ? "comment" : "comments"}</span>
          <Button variant="ghost" onClick={() => setComments({})}>Discard</Button>
          <Button disabled={isSending} onClick={send}><Anim.Send size={13} />Send to the session</Button>
        </div>
      )}
    </div>
  )
}
