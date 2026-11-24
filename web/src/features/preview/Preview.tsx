// A page the session serves on this machine (local.ts), shown beside its
// conversation: a frame with its address, reload, a phone's width, and a way
// out to a real window. Only local pages: an address elsewhere is refused
// here. The frame is sandboxed (it cannot move the board away) and exists
// only while this is open, so a closed preview costs nothing.
import { ExternalLink, RotateCw, Smartphone, X } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { frameUrl, localUrlOf } from "./local"

const PHONE_W = 390
const btn = "inline-grid size-7 shrink-0 place-items-center rounded-[7px] text-text-muted hover:bg-press hover:text-text active:scale-[0.92] [&_svg]:size-[15px]"

export function Preview({ url, onUrl, onClose }: { url: string; onUrl: (url: string) => void; onClose: () => void }) {
  const [typed, setTyped] = useState(url)
  const [isRefused, setRefused] = useState(false)
  const [turn, setTurn] = useState(0) // a reload: the frame again
  const [isPhone, setPhone] = useState(false)
  useEffect(() => (setTyped(url), setRefused(false)), [url])
  const go = () => {
    const next = localUrlOf(typed)
    setRefused(!next)
    if (next === url) setTurn(t => t + 1)
    else if (next) onUrl(next)
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <form className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5" onSubmit={e => (e.preventDefault(), go())}>
        <button type="button" className={btn} onClick={() => setTurn(t => t + 1)} disabled={!url} title="Reload"><RotateCw /></button>
        <input value={typed} onChange={e => (setTyped(e.target.value), setRefused(false))} spellCheck={false} autoFocus={!url} aria-label="Address" aria-invalid={isRefused}
          placeholder="localhost:3000"
          className={cn("h-7 min-w-0 flex-1 rounded-[7px] border border-line bg-bg px-2.5 font-mono text-[12px] outline-none focus:border-brand", isRefused && "border-bad focus:border-bad")} />
        <button type="button" className={cn(btn, isPhone && "bg-press text-text")} onClick={() => setPhone(!isPhone)} aria-pressed={isPhone} title={isPhone ? "Full width" : "A phone's width"}><Smartphone /></button>
        {url && <a className={btn} href={frameUrl(url, location.hostname)} target="_blank" rel="noreferrer" title="Open in a new window"><ExternalLink /></a>}
        <button type="button" className={btn} onClick={onClose} title="Close (Esc)"><X className="size-4!" /></button>
      </form>
      {isRefused && <p className="shrink-0 border-b border-line bg-bad/8 px-3 py-1.5 text-[12px] text-bad">Only pages served on this machine open here: localhost and a port.</p>}
      <div className="flex min-h-0 flex-1 justify-center bg-side">
        {url
          ? <iframe key={`${url} ${turn}`} src={frameUrl(url, location.hostname)} title="Preview" referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
              className="h-full border-0 bg-white" style={{ width: isPhone ? PHONE_W : "100%" }} />
          : <p className="self-center px-6 text-center text-[13px] text-text-muted">Type the address of a page this machine serves.</p>}
      </div>
    </div>
  )
}
