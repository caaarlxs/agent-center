// A document of a ticket's folder an agent named (plan.md, ticket.md…), over the panel to read.
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { get } from "@/lib/api"
import { Markdown } from "@/features/conversation/Markdown"

export function DocViewer({ ticketKey, name, onClose }: { ticketKey: string; name: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => void get<{ text: string }>(`/api/pipeline/file?key=${encodeURIComponent(ticketKey)}&name=${encodeURIComponent(name)}`).then(r => setText(r.text), (err: Error) => setError(err.message)), [ticketKey, name])
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,1000px)] w-[min(860px,calc(100vw-32px))] flex-col gap-3">
        <DialogTitle className="font-mono text-[13px] font-semibold">{name}</DialogTitle>
        <div className="-mx-1 min-h-0 flex-1 overflow-auto px-1">
          {error ? <p className="m-0 text-[13px] text-bad">{error}</p>
            : text === null ? <div className="h-40 animate-pulse rounded-[8px] bg-hover" />
            : name.endsWith(".json") ? <pre className="m-0 font-mono text-xs whitespace-pre-wrap">{text}</pre>
            : <Markdown className="text-[13.5px]">{text}</Markdown>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
