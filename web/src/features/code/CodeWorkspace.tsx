// The "Code" workspace: the session's repository as in VS Code. The file tree
// (git's status marked) or the search of every file on the left; the open
// files as tabs; Monaco. ⌘S saves: if the file changed on disk since it opened
// (Claude edited it), you reload it, compare or keep yours; a file you did not
// touch follows the disk. ⌘P opens a file by name, ⌘⇧F searches. The margin
// marks what changed since the branch started. Open files and folders are
// remembered per session; unsaved text is not.
import Editor, { DiffEditor, type Monaco, type OnMount } from "@monaco-editor/react"
import { ChevronRight, Folder as FolderIcon, Search, X } from "lucide-react"
import type { editor } from "monaco-editor"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { FileIcon } from "@/components/common/FileIcon"
import { Button } from "@/components/ui/button"
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { ApiError, get, post } from "@/lib/api"
import { keep, load } from "@/lib/store"
import type { CodeTree, Mark, Match } from "@/lib/api-types"
import { monacoTheme, useMonaco } from "@/lib/monaco"
import { cn } from "@/lib/utils"
import { type Folder, changedFolders, parentsOf, rankFiles, treeOf } from "./tree"

const WATCH_MS = 3000
const TREE_MS = 10_000
const STATUS_TONE: Record<string, string> = { M: "text-amber-400", A: "text-emerald-400", U: "text-emerald-400", R: "text-sky-400" }
const MARK_CLASS = { add: "gm-add", mod: "gm-mod", del: "gm-del" }
const nameOf = (p: string) => p.split("/").pop() ?? p

type Doc = { model: editor.ITextModel; mtime: number; saved: number }
type Notice = { path: string; kind: "conflict" | "changed" }
type FileRead = { path: string; mtime: number; size: number; text?: string; binary?: boolean; tooBig?: boolean }

const api = (id: string, what: string, q: Record<string, string> = {}) => `/api/sessions/${encodeURIComponent(id)}/${what}?${new URLSearchParams(q)}`

function remembered(id: string): { open: string[]; active: string | null; dirs: string[] } {
  try {
    return load<{ open: string[]; active: string | null; dirs: string[] } | null>(`code.${id}`, null) ?? { open: [], active: null, dirs: [] }
  } catch {
    return { open: [], active: null, dirs: [] }
  }
}

function TreeRows({ node, depth, open, toggle, status, changed, active, onOpen }: {
  node: Folder; depth: number; open: Set<string>; toggle: (p: string) => void; status: Record<string, string>; changed: Set<string>; active: string | null; onOpen: (p: string) => void
}) {
  const dirs = [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b))
  return (
    <>
      {dirs.map(([name, dir]) => (
        <div key={dir.path}>
          <button onClick={() => toggle(dir.path)} className="flex h-6 w-full items-center gap-1 rounded px-1.5 text-left text-[12.5px] hover:bg-accent" style={{ paddingLeft: 6 + depth * 12 }}>
            <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open.has(dir.path) && "rotate-90")} />
            <FolderIcon className="size-3.5 shrink-0 fill-amber-400/25 text-amber-400/80" />
            <span className="truncate">{name}</span>
            {changed.has(dir.path) && <i className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-400/70" />}
          </button>
          {open.has(dir.path) && <TreeRows node={dir} depth={depth + 1} open={open} toggle={toggle} status={status} changed={changed} active={active} onOpen={onOpen} />}
        </div>
      ))}
      {node.files.map(path => (
        <button key={path} onClick={() => onOpen(path)} title={path} style={{ paddingLeft: 22 + depth * 12 }}
          className={cn("flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-left text-[12.5px] hover:bg-accent", path === active && "bg-accent")}>
          <FileIcon path={path} />
          <span className={cn("truncate", STATUS_TONE[status[path]])}>{nameOf(path)}</span>
          {status[path] && <span className={cn("ml-auto font-mono text-[10.5px] font-semibold", STATUS_TONE[status[path]])}>{status[path]}</span>}
        </button>
      ))}
    </>
  )
}

function SearchPanel({ id, onOpen }: { id: string; onOpen: (path: string, line: number) => void }) {
  const [query, setQuery] = useState("")
  const [isCase, setCase] = useState(false)
  const [isRegex, setRegex] = useState(false)
  const [res, setRes] = useState<{ matches: Match[]; truncated: boolean; error?: string } | null>(null)
  useEffect(() => {
    if (!query.trim()) return setRes(null)
    const timer = setTimeout(() => {
      get<{ matches: Match[]; truncated: boolean }>(api(id, "codesearch", { q: query, ...(isCase ? { case: "1" } : {}), ...(isRegex ? { regex: "1" } : {}) }))
        .then(setRes, (err: Error) => setRes({ matches: [], truncated: false, error: err.message }))
    }, 250)
    return () => clearTimeout(timer)
  }, [id, query, isCase, isRegex])
  const byFile = useMemo(() => {
    const out = new Map<string, Match[]>()
    for (const m of res?.matches ?? []) out.set(m.path, [...(out.get(m.path) ?? []), m])
    return [...out]
  }, [res])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 px-2 pb-2">
        <Input autoFocus value={query} placeholder="Search in every file" onChange={e => setQuery(e.target.value)} className="h-7 text-xs" />
        <Button size="icon-sm" variant={isCase ? "secondary" : "ghost"} title="Match case" onClick={() => setCase(c => !c)} className="font-mono text-[11px]">Aa</Button>
        <Button size="icon-sm" variant={isRegex ? "secondary" : "ghost"} title="Regular expression" onClick={() => setRegex(r => !r)} className="font-mono text-[11px]">.*</Button>
      </div>
      {res && <p className="px-3 pb-1.5 text-[11px] text-muted-foreground">{res.error ?? (res.matches.length ? `${res.matches.length}${res.truncated ? "+" : ""} results in ${byFile.length} files` : "No results.")}</p>}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-3">
        {byFile.map(([path, list]) => (
          <div key={path} className="mb-1">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[12px]" title={path}><FileIcon path={path} /><span className="truncate font-medium">{nameOf(path)}</span><span className="ml-auto rounded bg-muted px-1.5 text-[10.5px] text-muted-foreground">{list.length}</span></div>
            {list.map(m => (
              <button key={m.line} onClick={() => onOpen(m.path, m.line)} className="block w-full truncate rounded py-0.5 pr-2 pl-7 text-left font-mono text-[11.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
                {m.text.trim()}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CodeWorkspace({ id }: { id: string }) {
  const monacoState = useMonaco()
  const saved = useMemo(() => remembered(id), [id])
  const [tree, setTree] = useState<CodeTree | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [openDirs, setOpenDirs] = useState(() => new Set(saved.dirs))
  const [tabs, setTabs] = useState<{ path: string; dirty: boolean }[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [compare, setCompare] = useState<{ original: string; modified: string } | null>(null)
  const [side, setSide] = useState<"files" | "search">("files")
  const [isQuick, setQuick] = useState(false)
  const ed = useRef<editor.IStandaloneCodeEditor | null>(null)
  const mon = useRef<Monaco | null>(null)
  const docs = useRef(new Map<string, Doc>())
  const marks = useRef<editor.IEditorDecorationsCollection | null>(null)
  const now = useRef({ active, tabs })
  now.current = { active, tabs }

  // The tree; a repository's status is read again every 10 seconds.
  useEffect(() => {
    let alive = true
    const read = () => get<CodeTree>(api(id, "codetree")).then(t => alive && (setTree(t), setTreeError(null)), (err: Error) => alive && setTreeError(err.message))
    read()
    const timer = setInterval(() => tree?.isGit !== false && document.visibilityState === "visible" && read(), TREE_MS)
    return () => ((alive = false), clearInterval(timer))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (monacoState.ready) keep(`code.${id}`, { open: tabs.map(t => t.path), active, dirs: [...openDirs] })
  }, [id, tabs, active, openDirs, monacoState.ready])

  const isDirty = (path: string) => {
    const d = docs.current.get(path)
    return !!d && d.model.getAlternativeVersionId() !== d.saved
  }
  const markDirty = (path: string) => setTabs(ts => ts.map(t => (t.path === path ? { ...t, dirty: isDirty(path) } : t)))

  const showMarks = useCallback(async (path: string) => {
    const res = await get<{ marks: Mark[] }>(api(id, "codemarks", { path })).catch(() => null)
    const m = mon.current
    if (!res || !m || now.current.active !== path || !marks.current) return
    marks.current.set(res.marks.map(k => ({
      range: new m.Range(k.from, 1, k.to, 1),
      options: { isWholeLine: true, linesDecorationsClassName: MARK_CLASS[k.kind], overviewRuler: { color: k.kind === "add" ? "#2ea043" : k.kind === "mod" ? "#2f81f7" : "#f85149", position: m.editor.OverviewRulerLane.Left } },
    })))
  }, [id])

  const open = useCallback(async (path: string, line?: number, focus = true) => {
    const m = mon.current
    const e = ed.current
    if (!m || !e) return
    setQuick(false)
    if (!docs.current.has(path)) {
      const res = await get<FileRead>(api(id, "codefile", { path })).catch((err: Error) => (focus && toast.error(err.message), null))
      if (!res) return
      if (res.binary || res.tooBig || res.text === undefined) return void (focus && toast(res.binary ? "A binary file: it does not open as text" : "Too big to open here"))
      const uri = m.Uri.parse(`file:///${id}/${path}`)
      m.editor.getModel(uri)?.dispose()
      const model = m.editor.createModel(res.text, undefined, uri)
      docs.current.set(path, { model, mtime: res.mtime, saved: model.getAlternativeVersionId() })
      model.onDidChangeContent(() => markDirty(path))
      setTabs(ts => (ts.some(t => t.path === path) ? ts : [...ts, { path, dirty: false }]))
    }
    setOpenDirs(d => new Set([...d, ...parentsOf(path)]))
    const model = docs.current.get(path)!.model
    e.setModel(model)
    if (line && line <= model.getLineCount()) (e.revealLineInCenter(line), e.setSelection(new m.Range(line, 1, line, model.getLineMaxColumn(line))))
    if (focus) e.focus()
    now.current.active = path
    setActive(path)
    setCompare(null)
    setNotice(n => (n?.path === path ? n : null))
    marks.current?.clear()
    void showMarks(path)
  }, [id, showMarks])

  const close = (path: string) => {
    if (isDirty(path) && !confirm(`${nameOf(path)} has changes you did not save. Close it anyway?`)) return
    const rest = now.current.tabs.filter(t => t.path !== path)
    setTabs(rest)
    if (now.current.active === path) {
      const next = rest.at(-1)?.path ?? null
      ed.current?.setModel(next ? docs.current.get(next)!.model : null)
      now.current.active = next
      setActive(next)
      if (next) void showMarks(next)
    }
    docs.current.get(path)?.model.dispose()
    docs.current.delete(path)
  }

  const reload = async (path: string) => {
    const d = docs.current.get(path)
    const res = await get<FileRead>(api(id, "codefile", { path })).catch(() => null)
    if (!d || !res || res.text === undefined) return
    const view = ed.current?.saveViewState()
    d.model.setValue(res.text)
    d.mtime = res.mtime
    d.saved = d.model.getAlternativeVersionId()
    if (now.current.active === path && view) ed.current?.restoreViewState(view)
    markDirty(path)
    setNotice(null)
    setCompare(null)
    void showMarks(path)
  }

  const save = async (force = false) => {
    const path = now.current.active
    const d = path && docs.current.get(path)
    if (!path || !d) return
    const version = d.model.getAlternativeVersionId()
    try {
      const res = await post<{ ok: boolean; mtime: number }>(`/api/sessions/${encodeURIComponent(id)}/codesave`, { path, text: d.model.getValue(), mtime: d.mtime, force })
      d.mtime = res.mtime
      d.saved = version
      markDirty(path)
      setNotice(null)
      setCompare(null)
      void showMarks(path)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setNotice({ path, kind: "conflict" })
      else toast.error((err as Error).message)
    }
  }
  const saveNow = useRef(save)
  saveNow.current = save

  const showCompare = async (path: string) => {
    const res = await get<FileRead>(api(id, "codefile", { path })).catch(() => null)
    if (res?.text !== undefined) setCompare({ original: res.text, modified: docs.current.get(path)!.model.getValue() })
  }

  // The open file on disk: followed when you have not changed it, else told.
  useEffect(() => {
    if (!active) return
    const timer = setInterval(async () => {
      const d = docs.current.get(active)
      const res = d && (await get<FileRead>(api(id, "codefile", { path: active, time: "1" })).catch(() => null))
      if (!d || !res || res.mtime === d.mtime) return
      if (!isDirty(active)) await reload(active)
      else setNotice(n => n ?? { path: active, kind: "changed" })
    }, WATCH_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id])

  const onMount: OnMount = (e, m) => {
    ed.current = e
    mon.current = m
    marks.current = e.createDecorationsCollection()
    e.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => void saveNow.current())
    e.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyP, () => setQuick(true))
    e.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyF, () => setSide("search"))
    void (async () => {
      for (const path of saved.open) await open(path, undefined, false)
      if (saved.active) await open(saved.active, undefined, false)
    })()
  }
  useEffect(() => () => docs.current.forEach(d => d.model.dispose()), [])
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => [...docs.current.keys()].some(isDirty) && e.preventDefault()
    window.addEventListener("beforeunload", onLeave)
    return () => window.removeEventListener("beforeunload", onLeave)
  }, [])

  const root = useMemo(() => (tree ? treeOf(tree.files) : null), [tree?.files])
  const changed = useMemo(() => changedFolders(tree?.status ?? {}), [tree?.status])
  const toggle = (p: string) => setOpenDirs(d => (d.has(p) ? new Set([...d].filter(x => x !== p)) : new Set([...d, p])))

  if (treeError) return <p className="p-6 text-sm text-muted-foreground">{treeError}</p>
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,22%)_minmax(0,1fr)]"
      onKeyDown={e => {
        if (!(e.metaKey || e.ctrlKey)) return
        if (e.key === "p") (e.preventDefault(), setQuick(true))
        else if (e.key === "s") (e.preventDefault(), void save())
        else if (e.key.toLowerCase() === "f" && e.shiftKey) (e.preventDefault(), setSide("search"))
      }}>
      <aside className="flex min-h-0 flex-col border-r bg-sidebar/40">
        <header className="flex items-center gap-1 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="truncate" title={tree?.root}>{side === "search" ? "Search" : (tree?.name ?? "…")}</span>
          <span className="ml-auto flex">
            <Button size="icon-xs" variant={side === "files" ? "secondary" : "ghost"} onClick={() => setSide("files")} title="Files"><FolderIcon /></Button>
            <Button size="icon-xs" variant={side === "search" ? "secondary" : "ghost"} onClick={() => setSide("search")} title="Search in every file (⌘⇧F)"><Search /></Button>
          </span>
        </header>
        {side === "search" ? <SearchPanel id={id} onOpen={(p, l) => void open(p, l)} /> : (
          <div className="min-h-0 flex-1 overflow-auto px-1 pb-3">
            {root ? <TreeRows node={root} depth={0} open={openDirs} toggle={toggle} status={tree!.status} changed={changed} active={active} onOpen={p => void open(p)} /> : <p className="p-3 text-xs text-muted-foreground">Reading the folder…</p>}
          </div>
        )}
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        {tabs.length > 0 && (
          <nav className="flex shrink-0 overflow-x-auto border-b bg-sidebar/40">
            {tabs.map(t => (
              <div key={t.path} title={t.path} className={cn("group flex h-8 shrink-0 items-center gap-1.5 border-r pr-1 pl-3 text-[12.5px] text-muted-foreground", t.path === active && "bg-background text-foreground shadow-[inset_0_-2px_0_var(--color-orange-500)]")}>
                <button onClick={() => void open(t.path)} className="flex items-center gap-1.5"><FileIcon path={t.path} />{nameOf(t.path)}</button>
                <button onClick={() => close(t.path)} className="grid size-5 place-items-center rounded hover:bg-accent" aria-label="Close">
                  {t.dirty ? <i className="size-2 rounded-full bg-foreground group-hover:hidden" /> : null}
                  <X className={cn("size-3", t.dirty && "hidden group-hover:block")} />
                </button>
              </div>
            ))}
          </nav>
        )}
        {notice && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-amber-400/10 px-3 py-2 text-[12.5px]">
            <span className="flex-1">{nameOf(notice.path)} {notice.kind === "conflict" ? "changed on disk after you opened it (Claude may have edited it). Saving now would undo that change." : "changed on disk, and you have changes of your own."}</span>
            <Button size="sm" variant="outline" onClick={() => void reload(notice.path)}>Reload theirs</Button>
            <Button size="sm" variant="outline" onClick={() => (compare ? setCompare(null) : void showCompare(notice.path))}>{compare ? "Close compare" : "Compare"}</Button>
            <Button size="sm" onClick={() => void save(true)}>Keep mine</Button>
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          {!monacoState.ready && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{monacoState.error ?? `Getting the editor ready… ${Math.round((monacoState.progress ?? 0) * 100)}%`}</p>}
          {monacoState.ready && (
            <>
              <div className={cn("absolute inset-0", compare && "invisible")}>
                <Editor theme={monacoTheme()} onMount={onMount} options={{ fontSize: 13, minimap: { enabled: true }, automaticLayout: true, scrollBeyondLastLine: false }} />
              </div>
              {compare && <div className="absolute inset-0"><DiffEditor theme={monacoTheme()} original={compare.original} modified={compare.modified} options={{ readOnly: true, fontSize: 13, automaticLayout: true }} /></div>}
              {!active && !compare && <p className="pointer-events-none absolute inset-0 grid place-items-center bg-background text-sm text-muted-foreground">Open a file from the tree, or press ⌘P.</p>}
            </>
          )}
        </div>
      </section>
      <CommandDialog open={isQuick} onOpenChange={setQuick} title="Go to file" description="Open a file by its name">
        <Command>
          <CommandInput placeholder="Go to file…" />
          <CommandList>
            <CommandEmpty>No file matches.</CommandEmpty>
            <QuickList files={tree?.files ?? []} onPick={p => void open(p)} />
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  )
}

// cmdk filters by itself; it gets the files in our ranking's order.
function QuickList({ files, onPick }: { files: string[]; onPick: (p: string) => void }) {
  return (
    <>
      {rankFiles(files, "", 2000).map(p => (
        <CommandItem key={p} value={p} onSelect={() => onPick(p)}>
          <FileIcon path={p} /><span>{nameOf(p)}</span><span className="truncate text-xs text-muted-foreground">{p.split("/").slice(0, -1).join("/")}</span>
        </CommandItem>
      ))}
    </>
  )
}
