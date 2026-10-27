// "New session" (dialogs.js NewSession): a folder (the repos and folders used
// before, filtered as you type, ↑↓ to move, or any folder with "Browse…"),
// what to ask, files and dictation, and the first turn's mode, model and effort
// (remembered). Send (⌘↵) runs the first turn here, headless, and opens the
// conversation; "Open in Claude" leaves it in a new session of the desktop app.
import { Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { PromptInput, PromptInputBody, PromptInputProvider, PromptInputTextarea, usePromptInputAttachments, usePromptInputController } from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { get, post } from "@/lib/api"
import { persistedStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { repoFilter } from "@/app/view-state"
import { AttachButton, MicButton, PickedFiles, fileErrors } from "@/features/prompt/PromptExtras"
import { EFFORTS, MODELS, MODES, Pick } from "@/features/prompt/Settings"
import { MAX_BYTES, MAX_FILES, messageWith } from "@/features/prompt/files"
import { hasWhisper } from "@/features/prompt/voice"
import { repoDot } from "@/features/session/state"

type Repo = { root: string; name: string }
const prefs = persistedStore("newPrefs", { mode: "bypassPermissions", model: "claude-fable-5-1", effort: "high" })
const field = "w-full rounded-md border border-line-strong bg-surface px-2.5 py-[7px] text-[13.5px] focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] focus:outline-none"

function Folders({ root, onPick }: { root: string | null; onPick: (root: string) => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [picked, setPicked] = useState<Repo | null>(null) // a folder chosen with "Browse…"
  const [filter, setFilter] = useState("")
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    get<{ repos: Repo[] }>("/api/repos").then(res => {
      setRepos(res.repos)
      if (!root && res.repos[0]) onPick(repoFilter.get() ?? res.repos[0].root)
    }, () => setRepos([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const all = [...(picked && !(repos ?? []).some(r => r.root === picked.root) ? [picked] : []), ...(repos ?? [])]
  const matches = (r: Repo, q: string) => `${r.name} ${r.root}`.toLowerCase().includes(q.toLowerCase())
  const shown = all.filter(r => !filter || matches(r, filter))
  const browse = () =>
    post<{ folder: string | null }>("/api/pick-folder").then(res => {
      if (!res.folder) return
      setPicked({ root: res.folder, name: res.folder.split("/").pop() || res.folder })
      setFilter("")
      onPick(res.folder)
    }, (err: Error) => toast(err.message || "Could not open the folder picker"))
  return (
    <>
      <div className="flex gap-2">
        <input className={field} placeholder="Filter folders…" value={filter} autoFocus
          onChange={e => {
            setFilter(e.target.value)
            const first = all.find(r => matches(r, e.target.value)) // the first match is picked
            if (first) onPick(first.root)
          }}
          onKeyDown={e => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
            e.preventDefault()
            const i = shown.findIndex(r => r.root === root)
            const next = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]
            if (next) (onPick(next.root), requestAnimationFrame(() => list.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" })))
          }} />
        <Button type="button" variant="outline" className="h-[34px] shrink-0" onClick={browse} title="Pick any folder on the Mac with the system picker"><Search className="size-3.5" />Browse…</Button>
      </div>
      <div ref={list} role="listbox" className="flex max-h-[260px] flex-col gap-px overflow-y-auto rounded-[10px] border border-line p-1">
        {!repos && <p className="m-2 text-text-muted">Loading folders…</p>}
        {shown.map(r => (
          <button type="button" key={r.root} role="option" aria-selected={root === r.root} onClick={() => onPick(r.root)}
            className={cn("flex h-[34px] shrink-0 items-center gap-[9px] rounded-[7px] px-[9px] text-left",
              root === r.root ? "bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_40%,transparent)]" : "hover:bg-hover")}>
            <i className="size-[9px] shrink-0 rounded-[3px]" style={{ background: repoDot(r.name) }} />
            <b className="shrink-0 font-semibold">{r.name}</b><span className="min-w-0 truncate text-xs text-text-muted">{r.root}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// The prompt with its tools, the explanation and the two ways to start.
function Prompt({ root, onClose }: { root: string | null; onClose: () => void }) {
  const chosen = prefs.use()
  const { textInput } = usePromptInputController()
  const { files } = usePromptInputAttachments()
  const [isSending, setSending] = useState(false)
  const [isWhisper, setWhisper] = useState(false)
  useEffect(() => void hasWhisper().then(setWhisper), [])
  const hasContent = !!textInput.value.trim() || files.length > 0
  const launch = async (send: boolean) => {
    if (!root || isSending) return
    setSending(true)
    try {
      // The session has no id yet: its files wait in a folder of their own.
      const prompt = await messageWith(`new-${crypto.randomUUID().slice(0, 8)}`, textInput.value.trim(), files)
      const res = await post<{ ok: boolean; id?: string }>("/api/new", { folder: root, prompt, send, ...chosen })
      onClose()
      if (res.id) (toast("Session created: Claude is working"), setTimeout(() => openSession(res.id!), 600))
      else toast("New session opened in Claude")
    } catch (err) {
      setSending(false)
      toast((err as Error).message || "Could not create the session")
    }
  }
  return (
    <div className="composer-box flex flex-col gap-2.5">
      <PromptInput multiple maxFiles={MAX_FILES} maxFileSize={MAX_BYTES} onError={fileErrors} onSubmit={() => void launch(hasContent)}>
        <PickedFiles />
        <PromptInputBody>
          {/* Enter writes a new line here; ⌘↵ sends. */}
          <PromptInputTextarea rows={4} className="min-h-24" placeholder={isWhisper ? "What you want Claude to do (optional) — or dictate it" : "What you want Claude to do (optional)"}
            onKeyDown={e => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return
              e.preventDefault()
              if (e.metaKey || e.ctrlKey) e.currentTarget.form?.requestSubmit()
              else document.execCommand("insertText", false, "\n")
            }} />
        </PromptInputBody>
        <div data-align="block-end" className="order-last flex w-full min-w-0 items-center gap-0.5 pt-1 pr-1.5 pb-1.5 pl-2">
          <AttachButton />
          <MicButton />
          <span className="mx-1.5 h-[18px] w-px shrink-0 bg-line" />
          <Pick icon="mode" value={chosen.mode} options={MODES} onPick={mode => prefs.set({ ...chosen, mode })} title="Permission mode for the first turn" />
          <Pick icon="model" value={chosen.model} options={MODELS} onPick={model => prefs.set({ ...chosen, model })} title="Model" />
          <Pick icon="effort" value={chosen.effort} options={EFFORTS} onPick={effort => prefs.set({ ...chosen, effort })} title="Effort for the first turn" />
        </div>
      </PromptInput>
      <div className="mt-1 flex items-center gap-2">
        <span className="flex-1 text-xs text-text-muted">
          {hasContent
            ? "Send: the first turn runs here, headless, with this mode, model and effort, and the session shows up at once. Open it in Claude when you want."
            : "Without a prompt, it opens in Claude for you to write there (with Claude's settings)."}
        </span>
        <Button type="button" variant="outline" onClick={() => launch(false)} disabled={!root || isSending}>Open in Claude</Button>
        <Button type="button" onClick={() => launch(true)} disabled={!root || !hasContent || isSending}>{isSending ? "Launching…" : "Send"} <Kbd>⌘↵</Kbd></Button>
      </div>
    </div>
  )
}

export function NewSessionDialog({ onClose }: { onClose: () => void }) {
  const [root, setRoot] = useState<string | null>(null)
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent showCloseButton={false} className="gap-2.5">
        <DialogTitle className="mb-1">New session</DialogTitle>
        <Folders root={root} onPick={setRoot} />
        <PromptInputProvider>
          <Prompt root={root} onClose={onClose} />
        </PromptInputProvider>
      </DialogContent>
    </Dialog>
  )
}
