// "Fork from here" (conversation.js ForkDialog): a new session starts from the
// conversation up to just before this message, with this text (edited or not)
// as its prompt; it works headless, then moves to Claude. ⌘↵ creates it.
import { GitFork } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { post } from "@/lib/api"
import { openSession } from "@/app/open-session"

export function ForkDialog({ sessionId, item, onClose }: { sessionId: string; item: { key: string; text: string }; onClose: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [isBusy, setBusy] = useState(false)
  const create = async () => {
    const prompt = area.current?.value.trim()
    if (!prompt || isBusy) return
    setBusy(true)
    try {
      const res = await post<{ ok: boolean; id: string }>(`/api/sessions/${encodeURIComponent(sessionId)}/fork`, { messageId: item.key, prompt })
      onClose()
      toast("Session forked: it works headless, then moves to Claude")
      openSession(res.id)
    } catch (err) {
      setBusy(false)
      toast((err as Error).message || "Could not fork")
    }
  }
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent showCloseButton={false}
        onOpenAutoFocus={e => {
          e.preventDefault()
          const el = area.current
          if (el) (el.focus(), el.setSelectionRange(el.value.length, el.value.length))
        }}>
        <DialogTitle className="flex items-center gap-2"><GitFork className="size-[17px]" />Fork from here</DialogTitle>
        <DialogDescription className="text-[12.5px]">
          A new session with the whole conversation up to just before this message. Change the message to try another path. The original session does not change.
        </DialogDescription>
        <Textarea ref={area} rows={5} defaultValue={item.text} className="resize-y text-[13px]/[1.5]"
          onKeyDown={e => e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.preventDefault(), create())} />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto flex items-center gap-1 text-text-muted"><Kbd>⌘</Kbd><Kbd>↵</Kbd> create</span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={isBusy} onClick={create}>{isBusy ? "Creating…" : "Create session"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
