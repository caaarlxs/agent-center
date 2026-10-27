// The "Files" workspace: what the session sent you, published or wrote, newest
// first, and a viewer for the chosen one. Markdown drawn, code in Monaco,
// pictures, PDFs and pages as they are (pages sandboxed: no access to the
// board), Word and Excel as the server converts them (OfficeDoc), CSV as a table, and
// anything else as Quick Look's picture. Only files the session's own
// transcript names are served (lib/session-files.ts).
import Editor from "@monaco-editor/react"
import { Copy, ExternalLink, FolderOpen } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { MessageResponse } from "@/components/ai-elements/message"
import { FileIcon } from "@/components/common/FileIcon"
import { Button } from "@/components/ui/button"
import { get, post } from "@/lib/api"
import { monacoTheme, useMonaco } from "@/lib/monaco"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { ago } from "@/features/session/state"
import { kindOf, parseDelimited } from "./kinds"
import { OfficeDoc } from "./OfficeDoc"

type Listed = { path: string; name: string; size: number; modifiedAt: number; source: "sent" | "artifact" | "written"; url?: string }

const SOURCE = { sent: "sent", artifact: "published", written: "written" }
const at = (id: string, what: string, path: string) => `/api/sessions/${encodeURIComponent(id)}/${what}?path=${encodeURIComponent(path)}`
const sizeOf = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} KB` : `${b} B`)

function useText(url: string | null) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    setText(null)
    if (url) fetch(url).then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))).then(setText, () => setText(""))
  }, [url])
  return text
}

function Viewer({ id, file }: { id: string; file: Listed }) {
  const kind = kindOf(file.name)
  const fileUrl = at(id, "file", file.path)
  const text = useText(["markdown", "code", "table"].includes(kind) ? fileUrl : null)
  const monaco = useMonaco()
  const rows = useMemo(() => (kind === "table" && text ? parseDelimited(text, file.name.endsWith(".tsv") ? "\t" : ",", 500) : []), [kind, text, file.name])
  const [isBroken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [file.path])
  if (file.size > 30 * 1024 * 1024) return <p className="p-6 text-sm text-muted-foreground">Too large to show here: open it on the Mac.</p>
  switch (kind) {
    case "markdown":
      return <div className="min-h-0 flex-1 overflow-auto px-8 py-6"><div className="mx-auto max-w-3xl">{text === null ? "…" : <MessageResponse>{text}</MessageResponse>}</div></div>
    case "code":
      return monaco.ready && text !== null
        ? <div className="min-h-0 flex-1"><Editor value={text} path={`files/${file.path}`} theme={monacoTheme()} options={{ readOnly: true, fontSize: 13, minimap: { enabled: false }, automaticLayout: true }} /></div>
        : <p className="p-6 text-sm text-muted-foreground">Opening…</p>
    case "image":
      return <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[repeating-conic-gradient(#ffffff08_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-6"><img src={fileUrl} alt={file.name} className="max-h-full max-w-full rounded shadow" /></div>
    case "video":
      return <div className="grid min-h-0 flex-1 place-items-center p-6"><video src={fileUrl} controls className="max-h-full max-w-full" /></div>
    case "pdf":
    case "page":
      return <iframe src={fileUrl} title={file.name} className="min-h-0 w-full flex-1 bg-white" sandbox={kind === "page" ? "allow-scripts" : undefined} />
    case "document":
      return <OfficeDoc url={at(id, "filepreview", file.path)} />
    case "table":
      return (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <table className="border-collapse font-mono text-xs">
            <tbody>{rows.map((r, i) => <tr key={i} className={cn(i === 0 && "bg-muted font-semibold")}>{r.map((c, j) => <td key={j} className="max-w-80 truncate border px-2 py-1">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    default:
      return isBroken
        ? <p className="p-6 text-sm text-muted-foreground">This kind of file does not show here: open it on the Mac.</p>
        : <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-6"><img src={at(id, "filepreview", file.path)} alt={file.name} onError={() => setBroken(true)} className="max-h-full max-w-full rounded shadow" /></div>
  }
}

export function Files({ id }: { id: string }) {
  const now = useNow()
  const [files, setFiles] = useState<Listed[] | null>(null)
  const [chosen, setChosen] = useState<Listed | null>(null)
  useEffect(() => {
    get<{ files: Listed[] }>(`/api/sessions/${encodeURIComponent(id)}/files`).then(r => (setFiles(r.files), setChosen(c => c ?? r.files[0] ?? null)), (err: Error) => toast.error(err.message))
  }, [id])
  const openOnMac = (reveal = false) => chosen && post(`/api/sessions/${encodeURIComponent(id)}/openfile`, { path: chosen.path, reveal }).catch((err: Error) => toast.error(err.message))
  if (!files) return <p className="p-6 text-sm text-muted-foreground">Reading the files…</p>
  if (!files.length) return <p className="p-6 text-sm text-muted-foreground">This session has not sent, published or written any file yet.</p>
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,24%)_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r bg-sidebar/40 p-1.5">
        {files.map(f => (
          <button key={f.path} onClick={() => setChosen(f)} title={f.path}
            className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent", chosen?.path === f.path && "bg-accent")}>
            <FileIcon path={f.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px]">{f.name}</span>
              <span className="block text-[11px] text-muted-foreground">{SOURCE[f.source]} · {sizeOf(f.size)} · {ago(f.modifiedAt, now)}</span>
            </span>
          </button>
        ))}
      </aside>
      {chosen && (
        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex items-center gap-2 border-b px-4 py-2">
            <FileIcon path={chosen.name} />
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={chosen.path}>{chosen.path}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <Button size="icon-sm" variant="ghost" title="Copy the path" onClick={() => navigator.clipboard.writeText(chosen.path).then(() => toast("Path copied"))}><Copy /></Button>
              {chosen.url && <Button size="sm" variant="ghost" asChild><a href={chosen.url} target="_blank" rel="noreferrer">claude.ai<ExternalLink /></a></Button>}
              <Button size="sm" variant="ghost" onClick={() => openOnMac(true)}><FolderOpen />Show in Finder</Button>
              <Button size="sm" variant="outline" onClick={() => openOnMac()}>Open on the Mac</Button>
            </span>
          </header>
          <Viewer key={chosen.path} id={id} file={chosen} />
        </section>
      )}
    </div>
  )
}
