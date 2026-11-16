// What you do to a ticket in the pipeline now and then, in one menu (each asks
// once more): start over, take it off the pipeline, clean up what runs left,
// roll back an environment.
import { Ellipsis, History, LogOut, RotateCcw, Trash2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "@/lib/notify"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { get } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { PipelineState } from "@server/pipeline"
import type { Leftover } from "@server/cleanup"
import { isRelease, nodeOf } from "./pipeline-board"
import { useConfirm } from "./confirm"
import { act, sendWithFeedback } from "./feedback"

// An item that asks once more: the first pick turns it red and keeps the menu open; the second does it.
function SureItem({ icon, label, sure, isDanger = false, onGo }: { icon: ReactNode; label: string; sure: string; isDanger?: boolean; onGo: () => void }) {
  const [isAsking, confirm] = useConfirm()
  return (
    <DropdownMenuItem className={cn("gap-2", (isAsking || isDanger) && "text-bad")} onSelect={e => (isAsking || e.preventDefault(), confirm(onGo))}>
      {icon}{isAsking ? sure : label}
    </DropdownMenuItem>
  )
}

// Where a release ended in this column, and was not rolled back already, it can be undone.
const deployedEnv = (state: PipelineState) => {
  const env = nodeOf(state.stage)
  if (env !== "staging" && env !== "prod") return null
  const isDeployed = !!state.deployed?.[env] || (state.release?.env === env && !state.release.rollback && state.status !== "failed")
  return isDeployed && !(state.release?.rollback && state.release.env === env) ? env : null
}

export function TicketMenu({ state, putAside, onChanged }: { state: PipelineState; putAside: number; onChanged: () => void }) {
  const [leftovers, setLeftovers] = useState<Leftover[] | null>(null)
  const isRunning = state.status === "running"
  const env = deployedEnv(state)
  const canRemove = !(isRunning && isRelease(state.stage))
  if (isRunning && !canRemove && !putAside && !env) return null
  const key = state.key
  const reset = async () => (await act("/api/pipeline/reset", { key }, "Started over: the comments stay in Jira")) && onChanged()
  const remove = async () => (await sendWithFeedback<{ warnings?: string[] }>("/api/pipeline/remove", { key }, r => ["Out of the pipeline", ...(r.warnings ?? [])].join(". "))) && onChanged()
  const rollBack = (env: string) => void act("/api/pipeline/rollback", { key, env }, `Rolling back ${env}`).then(ok => ok && onChanged())
  const openLeftovers = () => void get<{ items: Leftover[] }>(`/api/pipeline/leftovers?key=${encodeURIComponent(key)}`).then(r => setLeftovers(r.items), (err: Error) => toast(err.message || "It did not work"))
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="grid size-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors duration-120 hover:bg-hover hover:text-text" aria-label="More"><Ellipsis size={15} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          {!isRunning && <SureItem icon={<RotateCcw size={13} />} label="Start over" sure="Sure? Clears runs and labels" onGo={() => void reset()} />}
          {canRemove && <SureItem icon={<LogOut size={13} />} label="Take off the pipeline" sure="Sure? Jira and PRs stay" onGo={() => void remove()} />}
          {putAside > 0 && <DropdownMenuItem className="gap-2" onSelect={openLeftovers}><Trash2 size={13} />Clean up {putAside} left</DropdownMenuItem>}
          {env && <><DropdownMenuSeparator /><SureItem icon={<History size={13} />} label={`Roll back ${env}`} sure={`Sure? Roll back ${env}`} isDanger onGo={() => rollBack(env)} /></>}
        </DropdownMenuContent>
      </DropdownMenu>
      {leftovers && <CleanUp ticketKey={key} items={leftovers} onClose={() => setLeftovers(null)} onDone={() => (setLeftovers(null), onChanged())} />}
    </>
  )
}

// What runs put aside left (worktrees, local branches, the runs' folders): each to pick; nothing goes until Delete.
function CleanUp({ ticketKey, items, onClose, onDone }: { ticketKey: string; items: Leftover[]; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState(() => new Set(items.filter(i => i.isPicked).map(i => i.id)))
  const [isBusy, setBusy] = useState(false)
  const toggle = (id: string) => setPicked(now => (now.has(id) ? new Set([...now].filter(x => x !== id)) : new Set([...now, id])))
  const remove = async () => {
    setBusy(true)
    const out = await sendWithFeedback<{ failed?: string[] }>("/api/pipeline/cleanup", { key: ticketKey, ids: [...picked] }, r => (r.failed?.length ? `Some of it stays: ${r.failed.join("; ")}` : `Deleted ${picked.size}`))
    setBusy(false)
    if (out) onDone()
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(80vh,640px)] w-[min(560px,calc(100vw-32px))] flex-col gap-3">
        <DialogTitle className="m-0 text-[15px] font-[620]">Clean up {ticketKey}</DialogTitle>
        {items.length ? (
          <ul className="m-0 flex min-h-0 list-none flex-col gap-1.5 overflow-auto p-0">
            {items.map(i => (
              <li key={i.id}>
                <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                  <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} className="mt-[3px] size-3.5 shrink-0 accent-(--brand)" />
                  <span className="min-w-0">
                    <span className="block truncate">{i.label}</span>
                    {(i.detail || i.warn) && <span className={cn("block text-xs", i.warn ? "text-bad" : "text-faint")}>{i.warn ?? i.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-[13px] text-text-muted">Nothing is left.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="h-8 text-xs" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="h-8 text-xs" disabled={!picked.size || isBusy} onClick={() => void remove()}>{isBusy ? "Deleting…" : `Delete ${picked.size}`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
