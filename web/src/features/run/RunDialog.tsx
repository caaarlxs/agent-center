// "Run": start the session's project in its folder with the command saved
// for its repository, see where it listens, read its output, stop it. It
// keeps running after the dialog closes.
import { ExternalLink, Play, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { get, post } from "@/lib/api"
import type { Card, RunState } from "@/lib/api-types"
import { cn } from "@/lib/utils"

type RunInfo = { command: string | null; suggestion: string | null; repo: string; cwd: string; run: (RunState & { isRunning: boolean }) | null }
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

function RunLine({ run }: { run: RunInfo["run"] }) {
  if (!run) return <span className="text-muted-foreground">Not running</span>
  if (run.isRunning) return <span className="flex items-center gap-2 text-emerald-400"><i className="size-2 rounded-full bg-emerald-400" />Running since {clock(run.startedAt)}</span>
  if (run.wasStopped) return <span className="flex items-center gap-2 text-muted-foreground"><i className="size-2 rounded-full bg-zinc-500" />Stopped</span>
  return <span className={cn("flex items-center gap-2", run.exitCode ? "text-rose-400" : "text-muted-foreground")}><i className="size-2 rounded-full bg-current" />Exited{run.exitCode ? ` with code ${run.exitCode}` : ""}</span>
}

export function RunDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const [info, setInfo] = useState<RunInfo | null>(null)
  const [isBusy, setBusy] = useState(false)
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
    await post(`${url}/run`, { command }).then(refresh, (err: Error) => toast.error(err.message))
    setBusy(false)
  }
  const stop = () => post(`${url}/stoprun`).then(() => setTimeout(refresh, 800), (err: Error) => toast.error(err.message))
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="gap-4 sm:max-w-2xl">
        <DialogTitle className="flex min-w-0 items-center gap-2 pr-8"><Play className="size-4" />Run<span className="truncate font-normal text-muted-foreground">{card.title}</span></DialogTitle>
        {!info ? <div className="grid place-items-center py-10"><Spinner /></div> : (
          <>
            <div className="space-y-1.5">
              <Input ref={input} className="font-mono" defaultValue={run?.command ?? info.command ?? info.suggestion ?? ""} placeholder="npm run dev" spellCheck={false}
                onKeyDown={e => e.key === "Enter" && start()} aria-label={`Command for ${info.repo}`} />
              <p className="text-xs text-muted-foreground">
                Saved for {info.repo}. Runs in <span className="font-mono break-all" title={info.cwd}>{info.cwd.replace(/^\/Users\/[^/]+/, "~")}</span> with a free port in <code>$PORT</code>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <RunLine run={run} />
              {run?.isRunning && (run.ports.length
                ? run.ports.map(p => <Button key={p} asChild variant="outline" size="sm"><a href={`http://localhost:${p}`} target="_blank" rel="noreferrer">localhost:{p}<ExternalLink /></a></Button>)
                : <span className="text-muted-foreground">waiting for a port…</span>)}
              <span className="ml-auto flex gap-2">
                {run?.isRunning && <Button variant="ghost" size="sm" className="text-rose-400" onClick={stop}><Square />Stop</Button>}
                <Button size="sm" disabled={isBusy} onClick={start}><Play />{run?.isRunning ? "Restart" : "Start"}</Button>
              </span>
            </div>
            {lines.length > 0 && <pre ref={log} className="max-h-72 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed">{lines.join("\n")}</pre>}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
