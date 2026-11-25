// What a person found trying the ticket in Staging or Prod (lib/findings.ts): add one (what
// happens, what should happen, where, its story, screenshots pasted or dropped, links), change
// or delete it, and fix the ones you choose with a build. Fix with build writes in Jira (a [Fix]
// under each story, the story reopened): the button says so and asks twice.
import { useEffect, useState, type ClipboardEvent, type DragEvent } from "react"
import { ExternalLink, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { get, postFile } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { PersonFinding, Platform } from "@server/findings"
import type { Env, PipelineState } from "@server/pipeline"
import { changed, useConfirm } from "./confirm"
import { Evidence, evidenceUrl } from "./Evidence"
import { act, sendWithFeedback } from "./feedback"
import { PLATFORM_NAMES, fixAsk, linkName, linksIn, platformsLine } from "./finding-text"

const PLATFORMS = Object.keys(PLATFORM_NAMES) as Platform[]
type Story = { key: string; summary: string }
type Draft = { story: string; what: string; expected: string; platforms: Platform[]; images: string[]; links: string[] }

export function FindingsPanel({ state, env }: { state: PipelineState; env: Env }) {
  const ids = new Set((state.results ?? []).map(r => r.id))
  const drafts = (state.found ?? []).filter(f => !ids.has(f.id))
  const [editing, setEditing] = useState<PersonFinding | "new" | null>(null)
  const [left, setLeft] = useState<string[]>([])
  const chosen = drafts.filter(f => !left.includes(f.id))
  const [isAsking, confirm] = useConfirm()
  const canFix = state.status === "ready" && chosen.length > 0
  const fix = () => void act("/api/pipeline/finding/fix", { key: state.key, ids: chosen.map(f => f.id) }, "Fixing with a build").then(ok => ok && changed())
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h4 className="m-0 flex-1 text-[13px] font-semibold text-text">Findings{drafts.length ? ` · ${drafts.length}` : ""}</h4>
        <Button variant="outline" className="h-7 gap-1 text-xs" disabled={state.status === "running"} onClick={() => setEditing("new")}><Plus size={13} />Add a finding</Button>
        {drafts.length > 0 && (
          <Button className={cn("h-7 text-xs", isAsking && "bg-bad hover:bg-bad")} disabled={!canFix} onClick={() => confirm(fix)}>
            {isAsking ? fixAsk(chosen) : `Fix with build${chosen.length < drafts.length ? ` · ${chosen.length}` : ""}`}
          </Button>
        )}
      </div>
      {drafts.length > 0 && (
        <ol className="m-0 list-none p-0">
          {drafts.map(f => (
            <FindingRow key={f.id} ticketKey={state.key} finding={f} isChosen={!left.includes(f.id)} canChange={state.status !== "running"}
              onChoose={on => setLeft(l => (on ? l.filter(id => id !== f.id) : [...l, f.id]))} onEdit={() => setEditing(f)} />
          ))}
        </ol>
      )}
      {editing && <FindingForm state={state} env={env} finding={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function FindingRow({ ticketKey, finding: f, isChosen, canChange, onChoose, onEdit }: { ticketKey: string; finding: PersonFinding; isChosen: boolean; canChange: boolean; onChoose: (on: boolean) => void; onEdit: () => void }) {
  const [isAsking, confirm] = useConfirm()
  const remove = () => void act("/api/pipeline/finding/delete", { key: ticketKey, id: f.id }, `${f.id} deleted`).then(ok => ok && changed())
  return (
    <li className="border-t border-line first:border-t-0">
      <div className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 py-2">
        <input type="checkbox" className="translate-y-[2px]" checked={isChosen} onChange={e => onChoose(e.target.checked)} aria-label={`Fix ${f.id}`} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] leading-[1.45] text-text">{f.what}</span>
          <span className="text-[12.5px] leading-[1.45] text-text-muted">→ {f.expected}</span>
          <span className="text-xs text-faint">{f.story} · {platformsLine(f.platforms)} · {f.env}</span>
          {f.links.length > 0 && (
            <span className="flex flex-wrap gap-x-3 text-xs">
              {f.links.map(l => <a key={l} href={l} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text-muted hover:text-text"><ExternalLink size={11} />{linkName(l)}</a>)}
            </span>
          )}
        </div>
        <span className="flex items-center gap-2.5 text-xs text-faint">
          {canChange && <button className="hover:text-text" onClick={onEdit} aria-label={`Change ${f.id}`}><Pencil size={13} /></button>}
          {canChange && <button className={cn(isAsking ? "font-semibold text-bad" : "hover:text-text")} onClick={() => confirm(remove)} aria-label={`Delete ${f.id}`}>{isAsking ? "Delete?" : <Trash2 size={13} />}</button>}
          <span className="font-mono text-[11.5px]">{f.id}</span>
        </span>
      </div>
      <Evidence ticketKey={ticketKey} files={f.images.map(name => ({ name, caption: null }))} />
    </li>
  )
}

// The images go to the ticket's evidence as they arrive; the finding names them when you save it.
const upload = async (key: string, file: File) => (await postFile<{ name: string }>(`/api/pipeline/${encodeURIComponent(key)}/finding-image`, file)).name
const imagesOf = (list: FileList | DataTransferItemList | null | undefined) =>
  [...(list ?? [])].map(i => (i instanceof File ? i : i.kind === "file" ? i.getAsFile() : null)).filter((f): f is File => !!f && f.type.startsWith("image/"))

// The stories come from Jira as they are now: yours under the ticket.
function useStories(key: string) {
  const [stories, setStories] = useState<Story[] | null>(null)
  useEffect(() => {
    get<{ stories: Story[] }>(`/api/pipeline/finding-stories?key=${encodeURIComponent(key)}`).then(r => setStories(r.stories), (err: Error) => (setStories([]), toast(err.message)))
  }, [key])
  return stories
}

function FindingForm({ state, env, finding, onClose }: { state: PipelineState; env: Env; finding: PersonFinding | null; onClose: () => void }) {
  const stories = useStories(state.key)
  const [draft, setDraft] = useState<Draft>(() => finding ?? { story: "", what: "", expected: "", platforms: [], images: [], links: [] })
  const [link, setLink] = useState("")
  const [isBusy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const set = (part: Partial<Draft>) => setDraft(d => ({ ...d, ...part }))
  const story = draft.story || stories?.[0]?.key || ""
  const addImages = async (files: File[]) => {
    setUploading(n => n + files.length)
    for (const file of files) {
      await upload(state.key, file).then(name => setDraft(d => ({ ...d, images: [...d.images, name] })), (err: Error) => toast(err.message))
      setUploading(n => n - 1)
    }
  }
  const onPaste = (e: ClipboardEvent) => {
    const files = imagesOf(e.clipboardData?.items)
    if (files.length) (e.preventDefault(), void addImages(files))
  }
  const save = async () => {
    setBusy(true)
    const links = [...new Set([...draft.links, ...linksIn(link)])]
    const ok = await sendWithFeedback("/api/pipeline/finding", { key: state.key, id: finding?.id ?? null, finding: { ...draft, story, links, env: finding?.env ?? env } }, finding ? `${finding.id} saved` : "Finding added")
    setBusy(false)
    if (ok) (changed(), onClose())
  }
  const isReady = !!story && !!draft.what.trim() && !!draft.expected.trim() && draft.platforms.length > 0 && !uploading && !isBusy
  const field = "rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] leading-[1.5]"
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,820px)] w-[min(600px,calc(100vw-32px))] flex-col gap-3.5 overflow-auto" onPaste={onPaste} onDragOver={e => e.preventDefault()} onDrop={(e: DragEvent) => (e.preventDefault(), void addImages(imagesOf(e.dataTransfer?.files)))}>
        <DialogTitle className="m-0 text-[16px] font-[620]">{finding ? `Change ${finding.id}` : `A finding in ${env}`}</DialogTitle>
        <select className="h-8 rounded-[6px] border border-line bg-surface px-2 text-[13px]" value={story} onChange={e => set({ story: e.target.value })} disabled={!stories?.length}>
          {!stories && <option>Reading the stories…</option>}
          {stories?.map(s => <option key={s.key} value={s.key}>{s.key} · {s.summary}</option>)}
        </select>
        <PlatformPicker value={draft.platforms} onToggle={p => setDraft(d => ({ ...d, platforms: d.platforms.includes(p) ? d.platforms.filter(x => x !== p) : [...d.platforms, p] }))} />
        <textarea autoFocus rows={3} className={field} placeholder="What happens" value={draft.what} onChange={e => set({ what: e.target.value })} />
        <textarea rows={2} className={field} placeholder="What should happen" value={draft.expected} onChange={e => set({ expected: e.target.value })} />
        <ImagesField ticketKey={state.key} images={draft.images} uploading={uploading} onAdd={files => void addImages(files)} onRemove={name => set({ images: draft.images.filter(n => n !== name) })} />
        <LinksField links={draft.links} text={link} onText={setLink} onChange={links => set({ links })} />
        <footer className="flex items-center justify-end gap-2.5">
          <Button variant="outline" className="h-8 text-xs" disabled={isBusy} onClick={onClose}>Cancel</Button>
          <Button className="h-8 gap-1.5 text-xs" disabled={!isReady} onClick={() => void save()}>{isBusy && <Spinner className="size-3.5" />}{finding ? "Save" : "Add"}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

function PlatformPicker({ value, onToggle }: { value: Platform[]; onToggle: (p: Platform) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLATFORMS.map(p => (
        <button key={p} onClick={() => onToggle(p)} aria-pressed={value.includes(p)}
          className={cn("h-7 rounded-full border px-3 text-xs transition-colors duration-150", value.includes(p) ? "border-text bg-text text-surface" : "border-line text-text-muted hover:border-line-strong hover:text-text")}>
          {PLATFORM_NAMES[p]}
        </button>
      ))}
    </div>
  )
}

function ImagesField({ ticketKey, images, uploading, onAdd, onRemove }: { ticketKey: string; images: string[]; uploading: number; onAdd: (files: File[]) => void; onRemove: (name: string) => void }) {
  const tile = "flex h-14 w-[84px] items-center justify-center rounded-[6px] border border-dashed border-line"
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {images.map(name => (
        <span key={name} className="relative h-14 w-[84px] overflow-hidden rounded-[6px] border border-line">
          <img src={evidenceUrl(ticketKey, name)} alt="" className="size-full object-cover object-top" />
          <button className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white" onClick={() => onRemove(name)} aria-label="Remove the image"><X size={11} /></button>
        </span>
      ))}
      {uploading > 0 && <span className={tile}><Spinner className="size-4" /></span>}
      <label className={cn(tile, "cursor-pointer text-faint hover:border-line-strong hover:text-text")} aria-label="Add images">
        <ImagePlus size={16} />
        <input type="file" accept="image/*" multiple className="hidden" onChange={e => (onAdd(imagesOf(e.target.files)), (e.target.value = ""))} />
      </label>
    </div>
  )
}

function LinksField({ links, text, onText, onChange }: { links: string[]; text: string; onText: (text: string) => void; onChange: (links: string[]) => void }) {
  const add = () => (onChange([...new Set([...links, ...linksIn(text)])]), onText(""))
  return (
    <div className="flex flex-col gap-1.5">
      {links.map(l => (
        <span key={l} className="flex items-center gap-2 text-xs">
          <a href={l} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-text-muted hover:text-text"><ExternalLink size={11} className="shrink-0" /><span className="truncate">{linkName(l)}</span></a>
          <button className="text-faint hover:text-text" onClick={() => onChange(links.filter(x => x !== l))} aria-label="Remove the link"><X size={12} /></button>
        </span>
      ))}
      <input className="h-8 rounded-[6px] border border-line bg-surface px-2 text-[13px]" placeholder="Link" value={text}
        onChange={e => onText(e.target.value)} onBlur={() => text.trim() && add()} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())} />
    </div>
  )
}
