// The "Files" workspace (files.js): what the session sent you, published or
// wrote, newest first (read again every 10 s), and a viewer for the chosen one:
// Markdown drawn (or its source), code in Monaco, pictures, video, sound, PDFs
// and pages as they are (pages sandboxed: no access to the board), Word and
// Excel as the server converts them (OfficeDoc), CSV as a table, and anything
// else as Quick Look's picture of its first page. Only files the session's own
// transcript names are served (lib/session-files.ts).
import Editor from "@monaco-editor/react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { get, post } from "@/lib/api"
import { bytesText } from "@/lib/format"
import { useMonaco, useMonacoTheme } from "@/lib/monaco"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { FileIcon } from "@/components/common/FileIcon"
import { showImage } from "@/components/common/Lightbox"
import { Markdown, copyText } from "@/features/conversation/Markdown"
import { ago } from "@/features/session/state"
import { SideFlyout, useSideRoom } from "@/features/session/SideFlyout"
import { kindOf, parseDelimited } from "./kinds"
import { OfficeDoc } from "./OfficeDoc"
import { Anim } from "@/components/icons/animated"
import { CopyMark, useCopyMoment } from "@/components/icona/marks"

type Listed = { path: string; name: string; size: number; modifiedAt: number; source: "sent" | "artifact" | "written"; url?: string }
type Info = { path: string; size: number; isViewable: boolean; error?: string }

const SOURCE = { sent: "sent", artifact: "published", written: "written" } // written: a file opened from the conversation
const MAX_ROWS = 1000
const at = (id: string, what: string, path: string) => `/api/sessions/${encodeURIComponent(id)}/${what}?path=${encodeURIComponent(path)}`
const home = (path: string) => path.replace(/^\/Users\/[^/]+/, "~")
const muted = "p-4 text-text-muted"

function useText(url: string | null) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    setText(null)
    if (url) fetch(url).then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))).then(setText, () => setText(""))
  }, [url])
  return text
}

function Body({ id, file, info, isSource }: { id: string; file: Listed; info: Info; isSource: boolean }) {
  const kind = kindOf(file.name)
  const fileUrl = at(id, "file", file.path)
  const text = useText(info.isViewable && ["markdown", "code", "table"].includes(kind) ? fileUrl : null)
  const monaco = useMonaco()
  const { theme, isPlain } = useMonacoTheme()
  const rows = useMemo(() => (kind === "table" && text ? parseDelimited(text, file.name.endsWith(".tsv") ? "\t" : ",", MAX_ROWS) : []), [kind, text, file.name])
  const [hasNoPreview, setNoPreview] = useState(false)
  if (!info.isViewable) return <p className={muted}>Too large to show here ({bytesText(info.size)}).</p>
  const code = monaco.ready && text !== null
    ? <div className="h-full min-h-0"><Editor value={text} path={`files/${isPlain ? "plain/" : ""}${file.path}`} language={isPlain ? "plaintext" : undefined} theme={theme} options={{ readOnly: true, fontSize: 13, minimap: { enabled: false }, automaticLayout: true }} /></div>
    : <p className={muted}>Loading…</p>
  switch (kind) {
    case "markdown":
      if (isSource) return code
      return text === null ? <p className={muted}>Loading…</p> : <Markdown className="file-md mx-auto max-w-[760px] px-[22px] pt-[18px] pb-10">{text}</Markdown>
    case "code":
      return code
    case "image":
      return <img src={fileUrl} alt={file.name} onClick={() => showImage(fileUrl)} className="mx-auto my-3.5 block max-w-full cursor-pointer rounded-lg" />
    case "video":
      return <video src={fileUrl} controls className="mx-auto my-3.5 block max-w-full cursor-pointer rounded-lg" />
    case "audio":
      return <div className="p-4"><audio src={fileUrl} controls /></div>
    case "pdf":
    case "page":
      return <iframe src={fileUrl} title={file.name} className="block h-full min-h-[480px] w-full border-0 bg-white" sandbox={kind === "page" ? "allow-scripts" : undefined} />
    case "document":
      return <OfficeDoc url={at(id, "filepreview", file.path)} />
    case "table":
      if (text === null) return <p className={muted}>Loading…</p>
      return (
        <div className="overflow-auto p-3">
          <table className="border-collapse text-[12.5px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => i === 0
                    ? <th key={j} className="sticky top-0 max-w-[420px] border border-line bg-side px-2 py-1 text-left align-top font-semibold whitespace-pre-wrap">{c}</th>
                    : <td key={j} className="max-w-[420px] border border-line px-2 py-1 text-left align-top whitespace-pre-wrap">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length >= MAX_ROWS && <p className="mt-2 text-text-muted">Only the first 1000 rows show here.</p>}
        </div>
      )
    default:
      return hasNoPreview ? <p className={muted}>macOS has no preview for this kind of file: open it on the Mac.</p> : (
        <figure className="m-0 flex flex-col items-center gap-2 p-3.5">
          <img src={at(id, "filepreview", file.path)} alt={file.name} onError={() => setNoPreview(true)} className="block max-w-full rounded-lg bg-white shadow-pop" />
          <figcaption className="text-xs text-text-muted">The first page, as Quick Look shows it. Open it on the Mac for all of it.</figcaption>
        </figure>
      )
  }
}

function Viewer({ id, file }: { id: string; file: Listed }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [isSource, setSource] = useState(false)
  useEffect(() => void get<Info>(at(id, "fileinfo", file.path)).then(setInfo, (err: Error) => setInfo({ path: file.path, size: 0, isViewable: false, error: err.message })), [id, file.path])
  const isMarkdown = kindOf(file.name) === "markdown"
  const path = info?.path ?? file.path
  const openOnMac = (reveal = false) => post(`/api/sessions/${encodeURIComponent(id)}/openfile`, { path: file.path, reveal }).catch((err: Error) => toast(err.message || "Could not open it"))
  const copied = useCopyMoment()
  const copyPath = () => copyText(path).then(() => (copied.play(), toast("Path copied")), () => toast("Could not copy"))
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[13.5px]">{file.name}</b>
          <small className="truncate text-[11.5px] text-faint" title={path}>{home(path)}{info?.size != null && !info.error ? ` · ${bytesText(info.size)}` : ""}</small>
        </div>
        {isMarkdown && <Button variant="ghost" onClick={() => setSource(!isSource)}>{isSource ? "Rendered" : "Source"}</Button>}
        {file.url && <Button variant="ghost" asChild><a href={file.url} target="_blank" rel="noreferrer">claude.ai<Anim.ArrowUpRight size={12} /></a></Button>}
        {info && !info.error && (
          <>
            <button className={cn("inline-grid size-7 place-items-center rounded-[7px] text-text-muted transition-colors duration-200 hover:bg-press hover:text-text active:scale-[0.92]", copied.step >= 0 && "text-work hover:text-work")} onClick={copyPath} title="Copy the path"><CopyMark moment={copied} size={14} idle={<Anim.Copy size={14} />} /></button>
            <Button variant="ghost" onClick={() => openOnMac(true)} title="Show it in Finder">Show in Finder</Button>
            <Button variant="ghost" onClick={() => openOnMac()} title="Open it in its app on this Mac">Open on the Mac</Button>
          </>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {!info ? <p className={muted}>Loading…</p> : info.error ? <p className={muted}>{info.error}</p> : <Body id={id} file={file} info={info} isSource={isSource} />}
      </div>
    </section>
  )
}

// file: one to show first (a link in the conversation). The list reloads
// every 10 s while it shows, as the session may write more.
export function Files({ id, file }: { id: string; file?: string }) {
  const now = useNow()
  const hasSideRoom = useSideRoom()
  const [files, setFiles] = useState<Listed[] | null>(null)
  const [chosen, setChosen] = useState<Listed | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      get<{ files: Listed[] }>(`/api/sessions/${encodeURIComponent(id)}/files`).then(r => {
        if (!alive) return
        setFiles(r.files)
        setChosen(c => (c && r.files.find(f => f.path === c.path)) ?? c ?? r.files[0] ?? null)
      }, () => alive && setFiles(f => f ?? []))
    load()
    const timer = setInterval(load, 10_000)
    return () => ((alive = false), clearInterval(timer))
  }, [id])
  // Asked for one: it shows, also when the list does not have it yet.
  useEffect(() => {
    if (!file) return
    const name = file.split("/").pop() ?? file
    setChosen(c => (c?.path === file ? c : files?.find(f => f.path === file) ?? { path: file, name, size: 0, modifiedAt: Date.now(), source: "written" }))
  }, [file, files === null])
  const list = (
    <ul className={cn("m-0 min-h-0 list-none overflow-auto p-1.5", !hasSideRoom && "border-r border-line bg-side")}>
      {files === null && <li className="px-2.5 py-2 text-[12.5px] text-text-muted">Looking…</li>}
      {files?.length === 0 && !file && <li className="px-2.5 py-2 text-[12.5px] text-text-muted">No files shared yet</li>}
      {files?.map(f => (
        <li key={f.path}>
          <button onClick={() => setChosen(f)} title={f.path}
            className={cn("flex h-[30px] w-full items-center gap-2 rounded-[7px] px-2 text-left text-[12.5px] text-text", chosen?.path === f.path ? "bg-select" : "hover:bg-hover")}>
            <FileIcon path={f.path} />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <small className="shrink-0 text-[11px] text-faint">{SOURCE[f.source] ?? f.source} · {ago(f.modifiedAt, now)}</small>
          </button>
        </li>
      ))}
    </ul>
  )
  // The list opens beside the panel, as Code's tree does; inside it where there is no room.
  return (
    <div className={cn("min-h-0 flex-1", hasSideRoom ? "flex" : "grid grid-cols-[minmax(240px,24%)_minmax(0,1fr)]")}>
      {hasSideRoom ? <SideFlyout label="Files">{list}</SideFlyout> : list}
      {chosen && <Viewer key={chosen.path} id={id} file={chosen} />}
    </div>
  )
}
