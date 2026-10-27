// "Catch me up": Claude reads what the sessions did since the last summary
// and groups them, with the one to look at first. The last summary shows at
// once when it is from the last hour; otherwise a new one is written.
import { RefreshCw, Sun } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { get, post } from "@/lib/api"
import type { Card, Digest, DigestEntry, DigestGroup } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { focusCard } from "@/app/view-state"
import { StateIcon } from "@/features/session/StateIcon"
import { ago } from "@/features/session/state"

const GROUPS: [DigestGroup, string, string][] = [
  ["waiting", "Waiting for you", "text-amber-400"],
  ["stuck", "Stuck", "text-rose-400"],
  ["finished", "Finished", "text-emerald-400"],
  ["running", "Running", "text-sky-400"],
  ["later", "Later", "text-muted-foreground"],
]
const FRESH_MS = 60 * 60_000

function Row({ entry, onOpen }: { entry: DigestEntry; onOpen: (id: string) => void }) {
  return (
    <button onClick={() => onOpen(entry.id)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent">
      <StateIcon card={entry.card as unknown as Card} size={22} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2"><b className="truncate font-medium">{entry.title}</b><span className="shrink-0 text-xs text-muted-foreground">{entry.repo}</span></span>
        {entry.line && <span className="block text-sm text-muted-foreground">{entry.line}</span>}
      </span>
      {entry.next && <span className="max-w-[40%] shrink-0 rounded-md bg-amber-400/10 px-2 py-1 text-xs text-amber-300">{entry.next}</span>}
    </button>
  )
}

export function DigestDialog({ onClose }: { onClose: () => void }) {
  const [digest, setDigest] = useState<Digest | null | undefined>(undefined) // undefined: loading the last one
  const [isWriting, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Writing takes seconds: the dialog may close before the answer.
  const alive = useRef(true)
  useEffect(() => () => void (alive.current = false), [])

  const write = async () => {
    setWriting(true)
    setError(null)
    try {
      const res = await post<{ digest: Digest }>("/api/digest")
      if (alive.current) setDigest(res.digest)
    } catch (err) {
      if (alive.current) setError((err as Error).message)
    }
    if (alive.current) setWriting(false)
  }
  useEffect(() => {
    get<{ digest: Digest | null }>("/api/digest").then(res => {
      if (!alive.current) return
      const isFresh = !!res.digest?.entries && Date.now() - res.digest.at < FRESH_MS
      setDigest(isFresh ? res.digest : null)
      if (!isFresh) void write()
    }, () => void write())
  }, [])

  const open = (id: string) => (onClose(), openSession(id), focusCard(id))
  const entries = digest?.entries ?? []
  const focus = digest?.focus && entries.find(e => e.id === digest.focus!.id)
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <header className="flex items-center gap-3 pr-8">
          <DialogTitle className="flex items-center gap-2"><Sun className="size-4 text-amber-400" />Catch me up</DialogTitle>
          {digest && <span className="text-xs text-muted-foreground">Since {ago(digest.since, Date.now())}</span>}
          <Button variant="outline" size="sm" className="ml-auto" disabled={isWriting} onClick={write}>
            {isWriting ? <Spinner /> : <RefreshCw />}{isWriting ? "Reading…" : "Refresh"}
          </Button>
        </header>
        {error && <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        {!digest && isWriting && <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Spinner />Claude reads what your sessions did</div>}
        {digest && (
          <div className={cn("space-y-4 transition-opacity", isWriting && "opacity-50")}>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {GROUPS.map(([key, label, tone]) => {
                const n = entries.filter(e => e.group === key).length
                return n > 0 && <span key={key} className={tone}><b>{n}</b> {label.toLowerCase()}</span>
              })}
              {!entries.length && <span className="text-muted-foreground">Nothing new since the last summary</span>}
            </div>
            {focus && (
              <button onClick={() => open(focus.id)} className="w-full rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-left hover:bg-amber-400/10">
                <span className="text-xs font-medium text-amber-400">Start with</span>
                <b className="block font-medium">{focus.title}</b>
                <span className="text-sm text-muted-foreground">{digest.focus!.why}</span>
              </button>
            )}
            {GROUPS.map(([key, label, tone]) => {
              const list = entries.filter(e => e.group === key)
              return list.length > 0 && (
                <section key={key}>
                  <h3 className={cn("mb-1 px-2 text-xs font-semibold", tone)}>{label}</h3>
                  {list.map(e => <Row key={e.id} entry={e} onOpen={open} />)}
                </section>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
