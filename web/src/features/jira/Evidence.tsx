// What a test left to show a criterion (lib/evidence.ts): its pictures as
// thumbnails, the rest (a PDF, a response, rows, a log) as chips; a click
// opens it whole, in a viewer.
import { Braces, Download, ExternalLink, FileText, ScrollText, Table } from "lucide-react"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { EvidenceFile } from "@server/evidence"

export const evidenceUrl = (key: string, name: string) => `/api/pipeline/evidence?key=${encodeURIComponent(key)}&file=${encodeURIComponent(name)}`
const extOf = (name: string) => name.split(".").pop()!.toLowerCase()
const isPicture = (name: string) => ["png", "jpg", "jpeg", "gif", "webp"].includes(extOf(name))
const ICON = { pdf: FileText, json: Braces, csv: Table } as const
const iconOf = (name: string) => ICON[extOf(name) as keyof typeof ICON] ?? ScrollText

export function Evidence({ ticketKey, files }: { ticketKey: string; files: EvidenceFile[] }) {
  const [open, setOpen] = useState<EvidenceFile | null>(null)
  if (!files.length) return null
  return (
    <>
      <div className="ml-6 flex flex-wrap gap-1.5 pb-2.5">
        {files.map(f => {
          const label = f.caption ?? f.name
          if (isPicture(f.name)) return (
            <button key={f.name} onClick={() => setOpen(f)} title={label} aria-label={`Open ${label}`}
              className="h-12 w-[72px] overflow-hidden rounded-[6px] border border-line bg-surface transition-[border-color,transform] duration-150 hover:border-line-strong active:scale-[0.97]">
              <img src={evidenceUrl(ticketKey, f.name)} alt="" loading="lazy" className="size-full object-cover object-top" />
            </button>
          )
          const Icon = iconOf(f.name)
          return (
            <button key={f.name} onClick={() => setOpen(f)} title={label}
              className="inline-flex h-12 max-w-[180px] items-center gap-1.5 rounded-[6px] border border-line bg-surface px-2.5 text-[11.5px] text-text-muted transition-[border-color,transform] duration-150 hover:border-line-strong hover:text-text active:scale-[0.97]">
              <Icon size={13} className="shrink-0" /><span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>
      {open && <Viewer ticketKey={ticketKey} file={open} onClose={() => setOpen(null)} />}
    </>
  )
}

// A text file (a response, rows, a log), read to show it; JSON laid out.
function useText(url: string, isText: boolean) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!isText) return
    void fetch(url).then(r => r.text()).then(t => {
      try {
        setText(url.includes(".json") ? JSON.stringify(JSON.parse(t), null, 2) : t)
      } catch {
        setText(t)
      }
    }, () => setText("Could not read the file"))
  }, [url, isText])
  return text
}

function Viewer({ ticketKey, file, onClose }: { ticketKey: string; file: EvidenceFile; onClose: () => void }) {
  const url = evidenceUrl(ticketKey, file.name)
  const ext = extOf(file.name)
  const text = useText(url, !isPicture(file.name) && ext !== "pdf")
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[min(1100px,92vw)] max-w-none flex-col gap-3">
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="min-w-0 flex-1 truncate text-[14px]">{file.caption ?? file.name}</DialogTitle>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"><ExternalLink size={12} />Open</a>
          <a href={url} download={file.name} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"><Download size={12} />Download</a>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-[8px] border border-line bg-surface">
          {isPicture(file.name) ? <img src={url} alt={file.caption ?? file.name} className="mx-auto block max-w-full" />
            : ext === "pdf" ? <iframe src={url} title={file.name} className="h-[75vh] w-full" />
            : <pre className="m-0 p-3 font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap">{text ?? "Loading…"}</pre>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
