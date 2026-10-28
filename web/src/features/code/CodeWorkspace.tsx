// The "Code" workspace: the session's repository as in VS Code. The file tree
// (git's status marked) or the search of every file on the left; the open
// files as tabs; Monaco. ⌘S saves: if the file changed on disk since it opened
// (Claude edited it), you reload it, compare or keep yours; a file you did not
// touch follows the disk. ⌘P opens a file by name, ⌘⇧F searches. The margin
// marks what changed since the branch started. Open files and folders are
// remembered per session; unsaved text is not.
import Editor, { DiffEditor, type Monaco, type OnMount } from "@monaco-editor/react"
import { ChevronRight, Folder as FolderGlyph, Search, X } from "lucide-react"
import type { editor } from "monaco-editor"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { FileIcon, FolderIcon } from "@/components/common/FileIcon"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { ApiError, get, post } from "@/lib/api"
import { keep, load } from "@/lib/store"
import type { CodeTree, Mark, Match } from "@/lib/api-types"
import { ensureMonacoLang } from "@/lib/code-theme"
import { useMonaco, useMonacoTheme } from "@/lib/monaco"
import { cn } from "@/lib/utils"
import { SideFlyout, useSideRoom } from "@/features/session/SideFlyout"
import { type Folder, changedFolders, parentsOf, rankFiles, spanOf, treeOf } from "./tree"

const WATCH_MS = 3000
const TREE_MS = 10_000
const STATUS_TONE: Record<string, string> = { M: "text-ask", A: "text-work", U: "text-work", R: "text-review" }
const STATUS_TITLE: Record<string, string> = { M: "Modified", A: "Added", U: "New, not in git yet", R: "Renamed" }
const dirOf = (p: string) => p.split("/").slice(0, -1).join("/")
const sideBtn = "inline-grid size-6 place-items-center rounded-md text-text-muted hover:bg-press hover:text-text [&_svg]:size-[13px]"
const row = "flex h-6 w-full items-center rounded-[5px] pr-1.5 text-left text-[12.5px] text-text hover:bg-hover"
const MARK_CLASS = { add: "gm-add", mod: "gm-mod", del: "gm-del" }
const nameOf = (p: string) => p.split("/").pop() ?? p

type Doc = { model: editor.ITextModel; mtime: number; saved: number; lang: string } // lang: Monaco's, by its name
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
          <button onClick={() => toggle(dir.path)} className={cn(row, "gap-[5px]")} style={{ paddingLeft: 8 + depth * 12 }} aria-expanded={open.has(dir.path)}>
            <ChevronRight className={cn("size-3 shrink-0 text-text-muted transition-transform duration-[120ms] ease-(--ease-out)", open.has(dir.path) && "rotate-90")} />
            <FolderIcon path={name} isOpen={open.has(dir.path)} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {changed.has(dir.path) && <i className="size-1.5 shrink-0 rounded-full bg-ask opacity-70" title="Has changes" />}
          </button>
          {open.has(dir.path) && <TreeRows node={dir} depth={depth + 1} open={open} toggle={toggle} status={status} changed={changed} active={active} onOpen={onOpen} />}
        </div>
      ))}
      {node.files.map(path => (
        <button key={path} onClick={() => onOpen(path)} title={path} style={{ paddingLeft: 24 + depth * 12 }}
          className={cn(row, "gap-1.5", path === active && "bg-select hover:bg-select")}>
          <FileIcon path={path} />
          <span className={cn("min-w-0 flex-1 truncate", STATUS_TONE[status[path]])}>{nameOf(path)}</span>
          {status[path] && <span className={cn("shrink-0 font-mono text-[10.5px] font-semibold", STATUS_TONE[status[path]])} title={STATUS_TITLE[status[path]] ?? status[path]}>{status[path]}</span>}
        </button>
      ))}
    </>
  )
}

// ⌘⇧F: every file's lines that hold the query, by file (each folds), the
// match marked; a click opens the file with the match selected. It stays
// mounted, so the query is still there when you come back.
function SearchPanel({ id, field, onOpen }: { id: string; field: React.RefObject<HTMLInputElement | null>; onOpen: (path: string, line: number, span: [number, number] | null) => void }) {
  const [query, setQuery] = useState("")
  const [isCase, setCase] = useState(false)
  const [isRegex, setRegex] = useState(false)
  const [res, setRes] = useState<{ matches: Match[]; truncated: boolean; error?: string } | null>(null)
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!query.trim()) return setRes(null)
    let alive = true
    const timer = setTimeout(() => {
      get<{ matches: Match[]; truncated: boolean }>(api(id, "codesearch", { q: query, ...(isCase ? { case: "1" } : {}), ...(isRegex ? { regex: "1" } : {}) }))
        .then(r => alive && setRes(r), (err: Error) => alive && setRes({ matches: [], truncated: false, error: err.message }))
    }, 250)
    return () => ((alive = false), clearTimeout(timer))
  }, [id, query, isCase, isRegex])
  const byFile = useMemo(() => {
    const out = new Map<string, Match[]>()
    for (const m of res?.matches ?? []) out.set(m.path, [...(out.get(m.path) ?? []), m])
    return [...out]
  }, [res])
  const fold = (path: string) => setFolded(f => {
    const next = new Set(f)
    if (!next.delete(path)) next.add(path)
    return next
  })
  const opt = (isOn: boolean) => cn("h-7 w-[26px] shrink-0 rounded-md font-mono text-[11px] font-semibold text-text-muted hover:bg-hover", isOn && "bg-brand-soft text-brand hover:bg-brand-soft")
  const n = res?.matches.length ?? 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 px-2 pb-1.5">
        <input ref={field} value={query} placeholder="Search in every file" spellCheck={false} onChange={e => setQuery(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[12.5px] focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] focus:outline-none" />
        <button className={opt(isCase)} title="Match case" onClick={() => setCase(c => !c)}>Aa</button>
        <button className={opt(isRegex)} title="Regular expression" onClick={() => setRegex(r => !r)}>.*</button>
      </div>
      {res?.error && <p className="p-3 text-text-muted">{res.error}</p>}
      {res && !res.error && <p className="m-0 px-3 pb-1.5 text-[11.5px] text-text-muted">{n === 0 ? "No results." : `${n}${res.truncated ? "+" : ""} ${n === 1 ? "result" : "results"} in ${byFile.length} ${byFile.length === 1 ? "file" : "files"}`}</p>}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-3">
        {byFile.map(([path, list]) => (
          <div key={path}>
            <button className={cn(row, "gap-[5px] pl-2")} onClick={() => fold(path)} title={path}>
              <ChevronRight className={cn("size-3 shrink-0 text-text-muted transition-transform duration-[120ms] ease-(--ease-out)", !folded.has(path) && "rotate-90")} />
              <FileIcon path={path} /><span className="max-w-[60%] shrink-0 truncate">{nameOf(path)}</span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">{dirOf(path)}</span>
              <span className="ml-auto shrink-0 rounded-lg bg-press px-1.5 text-[10.5px] text-text-muted">{list.length}</span>
            </button>
            {!folded.has(path) && list.map(m => {
              const span = spanOf(m.text, query, { isCase, isRegex })
              const from = span ? Math.max(0, span[0] - 12) : 0
              return (
                <button key={m.line} className={cn(row, "h-[22px] pl-[34px] font-mono text-xs text-text-muted")} onClick={() => onOpen(m.path, m.line, span)} title={`Line ${m.line}`}>
                  <span className="min-w-0 flex-1 truncate whitespace-pre">
                    {from > 0 ? "…" : ""}
                    {span ? <>{m.text.slice(from, span[0])}<mark className="rounded-[2px] bg-ask-soft text-text shadow-[0_0_0_1px_color-mix(in_srgb,var(--ask)_40%,transparent)]">{m.text.slice(span[0], span[1])}</mark>{m.text.slice(span[1])}</> : m.text.trimStart()}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ⌘P: a field under the tabs; the files whose path holds the letters in
// order, the name first; ↑↓ ↵, Esc or a click elsewhere closes it.
function QuickOpen({ files, onPick, onClose }: { files: string[]; onPick: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const list = useMemo(() => rankFiles(files, query), [files, query])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setIndex(i => Math.min(i + 1, list.length - 1)))
    else if (e.key === "ArrowUp") (e.preventDefault(), setIndex(i => Math.max(i - 1, 0)))
    else if (e.key === "Enter") (e.preventDefault(), list[index] && onPick(list[index]))
    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), onClose())
  }
  return (
    <div onKeyDown={onKey} className="absolute top-10 left-1/2 z-20 w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-[10px] border border-line bg-raised p-2 shadow-pop">
      <input autoFocus value={query} placeholder="Go to file…" spellCheck={false} onChange={e => (setQuery(e.target.value), setIndex(0))} onBlur={() => setTimeout(onClose, 150)}
        className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-[7px] text-[13.5px] focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] focus:outline-none" />
      <div className="mt-1.5 max-h-80 overflow-auto">
        {list.map((path, i) => (
          <button key={path} onPointerDown={e => (e.preventDefault(), onPick(path))}
            className={cn("flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text", i === index && "bg-select")}>
            <FileIcon path={path} /><span className="max-w-1/2 shrink-0 truncate">{nameOf(path)}</span><span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">{dirOf(path)}</span>
          </button>
        ))}
        {!list.length && <p className="m-2 text-[12.5px] text-text-muted">No file matches.</p>}
      </div>
    </div>
  )
}

// isShown: the Code tab shows (it stays mounted while another does), so its
// tree opens beside the panel only then.
export function CodeWorkspace({ id, isShown = true }: { id: string; isShown?: boolean }) {
  const hasSideRoom = useSideRoom()
  const monacoState = useMonaco()
  const { theme, isPlain } = useMonacoTheme()
  const plain = useRef(isPlain)
  plain.current = isPlain
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

  const open = useCallback(async (path: string, line?: number, focus = true, span: [number, number] | null = null) => {
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
      const lang = model.getLanguageId()
      void ensureMonacoLang(path) // its grammar, the first time a file of it opens
      if (plain.current) m.editor.setModelLanguage(model, "plaintext")
      docs.current.set(path, { model, mtime: res.mtime, saved: model.getAlternativeVersionId(), lang })
      model.onDidChangeContent(() => markDirty(path))
      setTabs(ts => (ts.some(t => t.path === path) ? ts : [...ts, { path, dirty: false }]))
    }
    setOpenDirs(d => new Set([...d, ...parentsOf(path)]))
    const model = docs.current.get(path)!.model
    e.setModel(model)
    // A search hit: the match itself selected, else the whole line.
    if (line && line <= model.getLineCount())
      (e.revealLineInCenter(line), e.setSelection(span ? new m.Range(line, span[0] + 1, line, span[1] + 1) : new m.Range(line, 1, line, model.getLineMaxColumn(line))))
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

  // Colours off: every open file as plain text; on: each in its language again.
  useEffect(() => {
    const m = mon.current
    if (m) for (const doc of docs.current.values()) m.editor.setModelLanguage(doc.model, isPlain ? "plaintext" : doc.lang)
  }, [isPlain])

  const onMount: OnMount = (e, m) => {
    ed.current = e
    mon.current = m
    marks.current = e.createDecorationsCollection()
    e.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => void saveNow.current())
    e.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyP, () => setQuick(true))
    e.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyF, () => showSearch())
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
  // ⌘⇧F: the search, its field selected.
  const searchField = useRef<HTMLInputElement>(null)
  const showSearch = () => (setSide("search"), requestAnimationFrame(() => searchField.current?.select()))
  const toggle = (p: string) => setOpenDirs(d => (d.has(p) ? new Set([...d].filter(x => x !== p)) : new Set([...d, p])))

  const sidePanel = (
    <>
        <header className="flex items-center justify-between gap-1.5 pt-2 pr-2 pb-1.5 pl-3 text-[11.5px] tracking-[0.04em] text-text-muted uppercase">
          <b className="truncate font-semibold" title={tree?.root}>{side === "search" ? "Search" : (tree?.name ?? "…")}</b>
          <span className="flex gap-0.5">
            <button className={cn(sideBtn, side === "files" && "bg-press text-text")} onClick={() => setSide("files")} title="Files"><FolderGlyph /></button>
            <button className={cn(sideBtn, side === "search" && "bg-press text-text")} onClick={showSearch} title="Search in every file (⌘⇧F)"><Search /></button>
          </span>
        </header>
        <div className={cn("flex min-h-0 flex-1 flex-col", side !== "search" && "hidden")}><SearchPanel id={id} field={searchField} onOpen={(p, l, span) => void open(p, l, true, span)} /></div>
        <div className={cn("min-h-0 flex-1 overflow-auto px-1 pb-3", side !== "files" && "hidden")}>
          {root ? <TreeRows node={root} depth={0} open={openDirs} toggle={toggle} status={tree!.status} changed={changed} active={active} onOpen={p => void open(p)} /> : <p className="p-3 text-text-muted">Reading the folder…</p>}
          {tree?.truncated && <p className="p-3 text-text-muted">Only the first {tree.files.length} files show.</p>}
        </div>
    </>
  )
  if (treeError) return <p className="p-6 text-sm text-muted-foreground">{treeError}</p>
  return (
    <div className={cn("relative grid min-h-0 flex-1", hasSideRoom ? "grid-cols-1" : "grid-cols-[minmax(210px,28%)_minmax(0,1fr)]")}
      onKeyDown={e => {
        if (!(e.metaKey || e.ctrlKey)) return
        if (e.key === "p") (e.preventDefault(), setQuick(true))
        else if (e.key === "s") (e.preventDefault(), void save())
        else if (e.key.toLowerCase() === "f" && e.shiftKey) (e.preventDefault(), showSearch())
      }}>
      {/* The tree opens beside the panel, which keeps its width; inside it where there is no room. */}
      {hasSideRoom ? isShown && <SideFlyout label="Files">{sidePanel}</SideFlyout> : <aside className="flex min-h-0 flex-col border-r border-line bg-side" aria-label="Files">{sidePanel}</aside>}
      <section className="relative flex min-h-0 min-w-0 flex-col">
      {isQuick && <QuickOpen files={tree?.files ?? []} onPick={p => void open(p)} onClose={() => setQuick(false)} />}
        {tabs.length > 0 && (
          <nav className="flex shrink-0 overflow-x-auto border-b border-line bg-side [scrollbar-width:none]">
            {tabs.map(t => {
              const st = tree?.status[t.path]
              return (
                <div key={t.path} title={t.path} className={cn("flex h-8 shrink-0 items-center gap-1.5 border-r border-line pr-2 pl-3 text-[12.5px] whitespace-nowrap text-text-muted", t.path === active && "bg-surface text-text shadow-[inset_0_-2px_0_var(--brand)]")}>
                  <button onClick={() => void open(t.path)} className="flex items-center gap-1.5"><FileIcon path={t.path} />{nameOf(t.path)}</button>
                  {st && <span className={cn("font-mono text-[10.5px] font-semibold", STATUS_TONE[st])}>{st}</span>}
                  <button onClick={() => close(t.path)} className="group/close grid size-[18px] place-items-center rounded hover:bg-press" title={t.dirty ? "Not saved (⌘S saves)" : "Close"} aria-label="Close">
                    {t.dirty && <i className="size-2 rounded-full bg-text group-hover/close:hidden" />}
                    <X className={cn("size-3", t.dirty && "hidden group-hover/close:block")} />
                  </button>
                </div>
              )
            })}
          </nav>
        )}
        {notice && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-ask-soft px-3 py-2 text-[12.5px]">
            <span className="flex-[1_1_260px]">{nameOf(notice.path)} {notice.kind === "conflict" ? "changed on disk after you opened it (Claude may have edited it). Saving now would undo that change." : "changed on disk, and you have changes of your own."}</span>
            <Button variant="outline" onClick={() => void reload(notice.path)}>Reload theirs</Button>
            <Button variant="outline" onClick={() => (compare ? setCompare(null) : void showCompare(notice.path))}>{compare ? "Close compare" : "Compare"}</Button>
            <Button onClick={() => void save(true)}>Keep mine</Button>
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          {!monacoState.ready && (
            <p className="absolute inset-0 z-[1] grid place-items-center bg-surface p-6 text-center text-[13px] text-text-muted">
              {monacoState.error ? `The editor could not load: ${monacoState.error}` : monacoState.progress != null ? `Downloading the editor (VS Code's Monaco, once)… ${Math.round(monacoState.progress * 100)}%` : "Loading the editor…"}
            </p>
          )}
          {monacoState.ready && (
            <>
              <div className={cn("absolute inset-0", compare && "invisible")}>
                <Editor theme={theme} onMount={onMount} options={{ fontSize: 13, minimap: { enabled: true }, automaticLayout: true, scrollBeyondLastLine: false }} />
              </div>
              {compare && <div className="absolute inset-0"><DiffEditor theme={theme} language={isPlain ? "plaintext" : active ? docs.current.get(active)?.lang : undefined} original={compare.original} modified={compare.modified} options={{ readOnly: true, fontSize: 13, automaticLayout: true }} /></div>}
              {!active && !compare && <p className="pointer-events-none absolute inset-0 grid place-items-center bg-surface text-[13px] text-text-muted"><span>Open a file from the tree, or press <Kbd>⌘P</Kbd>.</span></p>}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
