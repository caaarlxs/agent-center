// "General context": what Claude starts every session with, shown and edited
// here (lib/context.ts). On the left, ~/.claude/CLAUDE.md (every session, every
// project) and each project's memory (what you asked Claude to remember there;
// MEMORY.md is its index). On the right, the file picked: Edit writes it,
// Preview shows it as Claude's answers show markdown. ⌘S saves; a save that
// would overwrite a newer copy on disk is refused, and Reload brings it in.
import { BookText, Brain, ChevronDown, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { get, post } from "@/lib/api"
import type { ContextFile, ContextList } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { Markdown } from "@/features/conversation/Markdown"

const tabBtn = (on: boolean) => cn("rounded-[7px] px-2.5 py-1 text-[12.5px] font-medium", on ? "bg-surface text-text shadow-card" : "text-text-muted hover:text-text")
const fileBtn = (on: boolean) => cn("flex h-7 w-full min-w-0 items-center gap-2 rounded-[7px] px-2 text-left text-[12.5px]", on ? "bg-brand-soft font-semibold text-text" : "text-text-muted hover:bg-hover hover:text-text")
// A memory file's name, read as words: "no-commit-sin-pedirlo.md" → "no commit sin pedirlo".
const nameOf = (name: string) => (name === "MEMORY.md" ? "MEMORY.md · index" : name.replace(/\.md$/, "").replace(/[-_]+/g, " "))

export function ContextDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<ContextList | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<ContextFile | null>(null)
  const [text, setText] = useState("")
  const [tab, setTab] = useState<"edit" | "preview">("edit")
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isChanged = !!saved && text !== saved.text
  const askDrop = () => !isChanged || confirm("Drop your unsaved changes to this file?")

  useEffect(() => void get<ContextList>("/api/context").then(l => (setList(l), setPath(l.global)), err => setError((err as Error).message)), [])

  const load = (file: string) =>
    get<ContextFile>(`/api/context/file?path=${encodeURIComponent(file)}`).then(c => (setSaved(c), setText(c.text), setError(null)), err => setError((err as Error).message))
  useEffect(() => void (path && (setSaved(null), load(path))), [path])

  const pick = (file: string) => file !== path && askDrop() && setPath(file)
  const fold = (dir: string) => setOpen(prev => { const next = new Set(prev); if (!next.delete(dir)) next.add(dir); return next })

  const save = async () => {
    if (!saved || !isChanged || isSaving) return
    setSaving(true)
    try {
      const next = await post<ContextFile>("/api/context", { path: saved.path, text, version: saved.version })
      setSaved(next)
      setText(next.text)
      setError(null)
      toast("Saved: the sessions you start from now on use it")
    } catch (err) {
      setError((err as Error).message)
    }
    setSaving(false)
  }

  const close = () => askDrop() && onClose()
  const group = list?.memories.find(m => m.files.some(f => f.path === path))
  const fileName = path === list?.global ? "CLAUDE.md" : group?.files.find(f => f.path === path)?.name

  return (
    <Dialog open onOpenChange={o => !o && close()}>
      <DialogContent className="flex h-[min(780px,calc(100vh-48px))] w-[min(1080px,calc(100vw-32px))] max-w-none flex-col gap-3"
        onKeyDown={e => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && (e.preventDefault(), void save())}>
        <div className="flex items-start gap-3 pr-8">
          <BookText className="mt-0.5 size-[18px] shrink-0 text-text-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle className="text-base font-[650]">General context</DialogTitle>
            <p className="m-0 text-[12.5px] text-text-muted">
              What Claude reads when a session starts: the general instructions, for every project, and the memory of each project (what you asked Claude to remember there).
              A change applies to the sessions you start after saving it.
            </p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 gap-3 max-[700px]:flex-col">
          <nav className="flex w-[250px] shrink-0 flex-col gap-px overflow-y-auto max-[700px]:max-h-[180px] max-[700px]:w-full">
            {!list && !error && <Spinner className="m-3" />}
            {list && (
              <>
                <div className="mx-2 mb-1 text-[11px] font-semibold tracking-[0.05em] text-faint uppercase">Every session</div>
                <button className={fileBtn(path === list.global)} onClick={() => pick(list.global)} title={list.global}>
                  <BookText className="size-3.5 shrink-0" /><span className="truncate">CLAUDE.md</span>
                </button>
                <div className="mx-2 mt-3.5 mb-1 text-[11px] font-semibold tracking-[0.05em] text-faint uppercase">Memory by project</div>
                {list.memories.length === 0 && <p className="m-0 px-2 text-xs text-faint">No project has memory yet. Ask Claude to remember something in a session.</p>}
                {list.memories.map(m => {
                  const isOpen = open.has(m.dir) || group?.dir === m.dir
                  return (
                    <div key={m.dir} className="flex flex-col gap-px">
                      <button className={fileBtn(false)} onClick={() => fold(m.dir)} title={m.folder ?? m.dir}>
                        {isOpen ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                        <span className="truncate font-medium text-text">{m.label}</span>
                        <span className="ml-auto text-[11px] text-faint tabular-nums">{m.files.length}</span>
                      </button>
                      {isOpen && m.files.map(f => (
                        <button key={f.path} className={cn(fileBtn(path === f.path), "pl-7")} onClick={() => pick(f.path)} title={f.path}>
                          <Brain className="size-3 shrink-0" /><span className="truncate">{nameOf(f.name)}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </>
            )}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="inline-flex shrink-0 rounded-[9px] bg-side p-0.5">
                <button className={tabBtn(tab === "edit")} onClick={() => setTab("edit")}>Edit</button>
                <button className={tabBtn(tab === "preview")} onClick={() => setTab("preview")}>Preview</button>
              </div>
              <span className="min-w-0 truncate text-[12.5px] font-semibold" title={path ?? undefined}>{group ? `${group.label} · ${fileName}` : fileName}</span>
              {isChanged && <span className="shrink-0 text-xs text-ask">Unsaved changes</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-[10px] border border-line">
              {!saved ? (
                <div className="flex h-full items-center justify-center text-text-muted">{error ?? <Spinner />}</div>
              ) : tab === "edit" ? (
                <textarea key={saved.path} value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoFocus
                  placeholder="Nothing yet. Write here what every session should know: how you like to work, your tools, your rules."
                  className="block h-full w-full resize-none bg-surface p-3.5 font-mono text-[12.5px] leading-[1.6] outline-none" />
              ) : (
                <div className="h-full overflow-y-auto bg-surface p-4">
                  {text.trim() ? <Markdown>{text}</Markdown> : <p className="m-0 text-text-muted">Empty.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-text-muted">
            {error
              ? <span className="text-bad">{error}</span>
              : saved?.version ? "Each save keeps the version before it, next to the file (.before-edit)." : saved && "The file does not exist yet: saving creates it."}
          </span>
          {error && saved && <Button variant="outline" onClick={() => void load(saved.path)} title="Read the file again from disk (your changes here are dropped)">Reload</Button>}
          <Button variant="outline" onClick={close}>Close</Button>
          <Button onClick={() => void save()} disabled={!isChanged || isSaving}>{isSaving ? "Saving…" : "Save"} <Kbd>⌘S</Kbd></Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
