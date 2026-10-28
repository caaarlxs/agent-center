// "Catch me up" (dialogs.js Digest): Claude reads what the sessions did since
// the last summary and groups them, with the one to look at first. The last
// summary shows at once when it is from the last hour; otherwise a new one is
// written. A click on a row opens that conversation.
import { Sun } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { get, post } from "@/lib/api"
import type { Card, Digest, DigestEntry, DigestGroup } from "@/lib/api-types"
import { when } from "@/lib/format"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { focusCard } from "@/app/view-state"
import { StateIcon } from "@/features/session/StateIcon"
import { SunSlowSpinIcon } from "@/components/icona/sun-slow-spin"
import { RefreshSpinIcon } from "@/components/icona/refresh-spin"
import { Once } from "@/components/icona/moment"

const GROUPS: [DigestGroup, string][] = [
  ["waiting", "Waiting for you"],
  ["stuck", "Stuck"],
  ["finished", "Finished"],
  ["running", "Running"],
  ["later", "For later"],
]
const COUNT_TONE: Partial<Record<DigestGroup, string>> = { waiting: "bg-ask-soft text-ask [&_b]:text-ask", stuck: "bg-bad-soft text-bad [&_b]:text-bad" }
const FRESH_MS = 60 * 60_000
const heading = "text-[11.5px] font-bold tracking-[0.05em] uppercase"

function Row({ entry, onOpen }: { entry: DigestEntry; onOpen: (id: string) => void }) {
  return (
    <button onClick={() => onOpen(entry.id)} title="Open the conversation" className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-[7px] text-left hover:bg-hover">
      <StateIcon card={entry.card as unknown as Card} size={26} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex min-w-0 items-baseline gap-2 text-[13.5px] font-semibold"><span className="truncate">{entry.title}</span><span className="text-[11.5px] font-medium whitespace-nowrap text-faint">{entry.repo}</span></span>
        {entry.line && <span className="text-[12.5px] text-text-muted">{entry.line}</span>}
      </span>
      {entry.next && <span className="max-w-[40%] shrink-0 truncate rounded-md bg-brand-soft px-2 py-[3px] text-[11.5px] font-semibold text-brand">{entry.next}</span>}
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
      if (alive.current) setError((err as Error).message || "Could not write the summary")
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
      <DialogContent showCloseButton={false} className="flex max-h-[min(78vh,760px)] w-[min(640px,calc(100vw-32px))] flex-col gap-0 p-0">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 pt-[18px] pb-3">
          <DialogTitle className="inline-flex items-center gap-2">{isWriting ? <Once icon={SunSlowSpinIcon} size={18} className="text-ask" isLoop /> : <Sun className="size-[18px] text-ask" />}Catch me up</DialogTitle>
          <span className="min-w-0 flex-1 text-xs text-text-muted">{digest && `Since ${when(digest.since)}`}</span>
          <Button variant="outline" disabled={isWriting} onClick={write} title="A new summary since the last one">
            {isWriting ? <><Once icon={RefreshSpinIcon} size={12} isLoop />Reading…</> : "Refresh"}
          </Button>
        </header>
        {error && <p className="mx-5 mt-3 mb-0 rounded-lg bg-bad-soft px-2.5 py-2 text-[12.5px] text-bad">{error}</p>}
        {!digest && isWriting && <div className="flex items-center gap-2.5 px-5 py-7 text-text-muted"><Spinner />Claude reads what your sessions did. It takes about 10 seconds.</div>}
        {digest && (
          <div className={cn("flex flex-col gap-3.5 overflow-y-auto px-5 pt-3.5 pb-1.5 transition-opacity duration-200", isWriting && "opacity-50")}>
            <div className="flex flex-wrap gap-1.5">
              {GROUPS.map(([key, label]) => {
                const n = entries.filter(e => e.group === key).length
                return n > 0 && <span key={key} className={cn("rounded-full bg-hover px-[9px] py-[3px] text-xs text-text-muted [&_b]:font-bold [&_b]:text-text", COUNT_TONE[key])}><b>{n}</b> {label.toLowerCase()}</span>
              })}
              {!entries.length && <span className="text-text-muted">Nothing new since the last summary.</span>}
            </div>
            {focus && (
              <button onClick={() => open(focus.id)} className="flex flex-col items-start gap-0.5 rounded-[10px] border border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-brand-soft px-3 py-2.5 text-left hover:bg-hover">
                <span className="text-[11px] font-bold tracking-[0.05em] text-brand uppercase">Start with</span>
                <span className="text-[13.5px] font-semibold">{focus.title}</span>
                <span className="text-[12.5px] text-text-muted">{digest.focus!.why}</span>
              </button>
            )}
            {GROUPS.map(([key, label]) => {
              const list = entries.filter(e => e.group === key)
              return list.length > 0 && (
                <section key={key} className="flex flex-col gap-0.5">
                  <h3 className={cn(heading, "mb-1 text-text-muted")}>{label}</h3>
                  {list.map(e => <Row key={e.id} entry={e} onOpen={open} />)}
                </section>
              )
            })}
          </div>
        )}
        <p className="m-0 px-5 pt-2.5 pb-4 text-[11.5px] text-text-muted">A separate request to Claude with your account: it does not open or touch your sessions. It covers what happened since the last summary and what still waits for you.</p>
      </DialogContent>
    </Dialog>
  )
}
