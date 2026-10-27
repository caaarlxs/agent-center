// "New session": a folder (the ones you used, or any from Finder), what to
// ask, files and dictation, and the mode, model and effort it starts with.
// Start runs it here and opens its conversation; "Open in Claude" leaves the
// prompt in a new session of the desktop app instead.
import { FolderOpen, FolderGit2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputProvider, PromptInputSubmit, PromptInputTextarea, PromptInputTools,
  usePromptInputAttachments, usePromptInputController,
} from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { get, post } from "@/lib/api"
import { persistedStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { repoFilter } from "@/app/view-state"
import { EFFORTS, MODELS, MODES, Pick } from "@/features/conversation/Composer"
import { AttachButton, MicButton, PickedFiles, fileErrors } from "@/features/prompt/PromptExtras"
import { MAX_BYTES, MAX_FILES, messageWith } from "@/features/prompt/files"

type Repo = { root: string; name: string; lastUsed: number }
const prefs = persistedStore("newPrefs", { mode: "bypassPermissions", model: "claude-fable-5-1", effort: "high" })
const home = (path: string) => path.replace(/^\/Users\/[^/]+/, "~")

function Folders({ folder, onPick }: { folder: string | null; onPick: (root: string) => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  useEffect(() => {
    get<{ repos: Repo[] }>("/api/repos").then(res => {
      setRepos(res.repos)
      if (!folder && res.repos[0]) onPick(repoFilter.get() ?? res.repos[0].root)
    }, (err: Error) => toast.error(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const browse = () =>
    post<{ folder: string | null }>("/api/pick-folder").then(res => res.folder && onPick(res.folder), (err: Error) => toast.error(err.message))
  const shown = repos && folder && !repos.some(r => r.root === folder) ? [{ root: folder, name: folder.split("/").pop() ?? folder, lastUsed: 0 }, ...repos] : (repos ?? [])
  return (
    <Command className="rounded-lg border" value={folder ?? ""} onValueChange={onPick}>
      <CommandInput placeholder="Folder…" />
      <CommandList className="max-h-52">
        <CommandEmpty>No folder matches</CommandEmpty>
        {shown.map(r => (
          <CommandItem key={r.root} value={r.root} keywords={[r.name]} onSelect={onPick} className={cn(folder === r.root && "bg-accent")}>
            <FolderGit2 /><span className="font-medium">{r.name}</span><span className="ml-auto min-w-0 truncate text-right text-xs text-muted-foreground">{home(r.root)}</span>
          </CommandItem>
        ))}
      </CommandList>
      <Button variant="ghost" size="sm" className="m-1 justify-start text-muted-foreground" onClick={browse}><FolderOpen />Other folder…</Button>
    </Command>
  )
}

// Inside the prompt's provider: it reads what is typed and picked.
function OpenInClaude({ folder, onDone }: { folder: string | null; onDone: () => void }) {
  const { textInput } = usePromptInputController()
  const { files } = usePromptInputAttachments()
  const [isBusy, setBusy] = useState(false)
  const open = async () => {
    if (!folder) return void toast.error("Choose a folder")
    setBusy(true)
    try {
      const prompt = await messageWith(`new-${crypto.randomUUID()}`, textInput.value.trim(), files)
      await post("/api/new", { folder, prompt, send: false })
      toast("New session opened in Claude")
      onDone()
    } catch (err) {
      toast.error((err as Error).message)
    }
    setBusy(false)
  }
  return <Button variant="ghost" size="sm" disabled={isBusy} onClick={open}>Open in Claude</Button>
}

export function NewSessionDialog({ onClose }: { onClose: () => void }) {
  const [folder, setFolder] = useState<string | null>(null)
  const chosen = prefs.use()
  const [status, setStatus] = useState<"ready" | "submitted">("ready")
  const start = async ({ text, files }: { text: string; files: Parameters<typeof messageWith>[2] }) => {
    if (!folder) return void toast.error("Choose a folder")
    if (!text.trim() && !files.length) return
    setStatus("submitted")
    try {
      const prompt = await messageWith(`new-${crypto.randomUUID()}`, text.trim(), files)
      const res = await post<{ ok: boolean; id?: string }>("/api/new", { folder, prompt, send: true, ...chosen })
      onClose()
      if (res.id) (toast("Session started"), setTimeout(() => openSession(res.id!), 600))
      else toast("New session opened in Claude")
    } catch (err) {
      setStatus("ready")
      toast.error((err as Error).message)
      throw err // keeps what was typed
    }
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="gap-3 sm:max-w-2xl">
        <DialogTitle>New session</DialogTitle>
        <Folders folder={folder} onPick={setFolder} />
        <PromptInputProvider>
          <PromptInput multiple maxFiles={MAX_FILES} maxFileSize={MAX_BYTES} onError={fileErrors} onSubmit={start} className="rounded-xl">
            <PickedFiles />
            <PromptInputBody><PromptInputTextarea autoFocus placeholder="What should Claude do?" /></PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <AttachButton />
                <MicButton />
                <Pick value={chosen.mode} options={MODES} placeholder="Mode" onPick={mode => prefs.set({ ...chosen, mode })} />
                <Pick value={chosen.model} options={MODELS} placeholder="Model" onPick={model => prefs.set({ ...chosen, model })} />
                <Pick value={chosen.effort} options={EFFORTS} placeholder="Effort" onPick={effort => prefs.set({ ...chosen, effort })} />
              </PromptInputTools>
              <span className="flex items-center gap-1">
                <OpenInClaude folder={folder} onDone={onClose} />
                <PromptInputSubmit status={status} disabled={!folder} />
              </span>
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </DialogContent>
    </Dialog>
  )
}
