// "Run": start the session's project in its folder with the command saved
// for its repository, see where it listens, read its output, stop it. It
// keeps running after the dialog closes.
import { Play, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { get, post } from "@/lib/api"
import type { Card, RunState } from "@/lib/api-types"
import { clock } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Anim } from "@/components/icons/animated"
import { RunMark, useRunMoment } from "@/components/icona/marks"

type RunInfo = { command: string | null; suggestion: string | null; repo: string; cwd: string; run: (RunState & { isRunning: boolean }) | null }

// Whether it runs, stopped, or ended (with its error code).
function RunLine({ run }: { run: RunInfo["run"] }) {
  if (!run) return <span className="text-text-muted">Not running.</span>
  const dot = (tone: string) => <i className={cn("size-[7px] rounded-full", tone)} />
  if (run.isRunning) return <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">{dot("bg-work shadow-[0_0_0_3px_var(--work-soft)]")}Running since {clock(run.startedAt)}</span>
  if (run.wasStopped) return <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">{dot("bg-faint")}Stopped</span>
  return <span className={cn("inline-flex items-center gap-1.5 text-xs text-text-muted", run.exitCode && "text-bad")}>{dot(run.exitCode ? "bg-bad" : "bg-faint")}Exited{run.exitCode ? ` with an error (code ${run.exitCode})` : ""}</span>
}

export function RunDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const [info, setInfo] = useState<RunInfo | null>(null)
  const [isBusy, setBusy] = useState(false)
  const started = useRunMoment() // play turns to pause as it starts
  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLPreElement>(null)
  const url = `/api/sessions/${encodeURIComponent(card.id)}`
  const refresh = () => get<RunInfo>(`${url}/run`).then(setInfo, () => {})
  useEffect(() => {
    void refresh()
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])
  const lines = info?.run?.lines ?? []
  useEffect(() => void (log.current && (log.current.scrollTop = log.current.scrollHeight)), [lines.length])

  const run = info?.run ?? null
  const start = async () => {
    const command = input.current?.value.trim()
    if (!command) return input.current?.focus()
    setBusy(true)
    await post(`${url}/run`, { command }).then(() => (started.play(), refresh()), (err: Error) => toast(err.message || "Could not start"))
    setBusy(false)
  }
  const stop = () => post(`${url}/stoprun`).then(() => setTimeout(refresh, 800), (err: Error) => toast(err.message))
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent showCloseButton={false} className="w-[min(680px,calc(100vw-32px))] gap-0">
        <DialogTitle className="mb-3.5 flex min-w-0 items-center gap-2"><Play className="size-4" />Run<span className="truncate text-sm font-medium text-text-muted">{card.title}</span></DialogTitle>
        {!info ? <div className="grid place-items-center py-8"><Spinner /></div> : (
          <>
            <label className="mb-1.5 block text-[12.5px] text-text-muted">Command to start <b className="text-text">{info.repo}</b></label>
            <Input ref={input} className="font-mono" defaultValue={run?.command ?? info.command ?? info.suggestion ?? ""} placeholder="npm run dev" spellCheck={false}
              onKeyDown={e => e.key === "Enter" && start()} />
            <p className="mt-1.5 mb-3 text-xs text-text-muted">
              Saved for every session of {info.repo}. It runs in this session's folder (<span className="font-mono" title={info.cwd}>{info.cwd.replace(/^\/Users\/[^/]+/, "~")}</span>). <code className="font-mono text-[11.5px]">$PORT</code> holds a free port.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <RunLine run={run} />
              {run?.isRunning && (run.ports.length
                ? run.ports.map(p => <Button key={p} asChild variant="outline"><a href={`http://localhost:${p}`} target="_blank" rel="noreferrer">localhost:{p}<Anim.ExternalLink size={12} /></a></Button>)
                : <span className="text-text-muted">Waiting for it to open a port…</span>)}
              <span className="flex-1" />
              {run?.isRunning && <Button variant="outline" className="text-bad" onClick={stop}><Square className="size-3" />Stop</Button>}
              <Button disabled={isBusy} onClick={start}><RunMark moment={started} size={12} idle={<Anim.Play size={12} />} />{run?.isRunning ? "Restart" : "Start"}</Button>
            </div>
            {lines.length > 0 && <pre ref={log} className="mt-3 mb-0 max-h-[260px] overflow-auto rounded-[9px] border border-line bg-side px-3 py-2.5 font-mono text-[11.5px]/[1.5] [overflow-wrap:anywhere] whitespace-pre-wrap text-text-muted">{lines.join("\n")}</pre>}
          </>
        )}
        <div className="mt-3.5 flex items-center gap-1 text-xs text-text-muted">It keeps running after you close this window. <Kbd>Esc</Kbd> close</div>
      </DialogContent>
    </Dialog>
  )
}
