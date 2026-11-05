// The team's code debt the agents saw and left alone, and the improvements they
// propose to the team's tools (lib/debt.ts): a button on the Pipeline view with
// how many points are open, and a list of them by repo. You pick points and
// turn them into one Jira ticket, or dismiss them.
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { get } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { DebtEntry } from "@server/debt"
import { act } from "./Pipeline"

type Show = "open" | "all"
const KINDS = [["debt", "Debt"], ["improvement", "Improvements"]] as const
const DOT = { blocker: "bg-bad", major: "bg-ask", minor: "bg-line-strong" } as const
const loadDebt = () => get<{ debt: DebtEntry[] }>("/api/pipeline/debt").then(r => r.debt, () => [] as DebtEntry[])

export function DebtButton() {
  const [debt, setDebt] = useState<DebtEntry[]>([])
  const [isOpen, setOpen] = useState(false)
  useEffect(() => void loadDebt().then(setDebt), [isOpen])
  const open = debt.filter(d => d.status === "open" && d.kind !== "improvement")
  const ideas = debt.filter(d => d.status === "open" && d.kind === "improvement").length
  const grave = open.filter(d => d.severity === "blocker").length
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text">
        Debt <span className={cn("tabular-nums", grave ? "text-bad" : "text-faint")}>{open.length}{grave ? ` · ${grave} grave` : ""}{ideas ? ` · ${ideas} improvement${ideas === 1 ? "" : "s"}` : ""}</span>
      </button>
      {isOpen && <DebtList debt={debt} onChange={() => void loadDebt().then(setDebt)} onClose={() => setOpen(false)} />}
    </>
  )
}

function DebtList({ debt, onChange, onClose }: { debt: DebtEntry[]; onChange: () => void; onClose: () => void }) {
  const [show, setShow] = useState<Show>("open")
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("debt")
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const shown = debt.filter(d => (d.kind ?? "debt") === kind && (show === "all" || d.status === "open")).sort((a, b) => a.repo.localeCompare(b.repo) || order(a) - order(b))
  const repos = [...new Set(shown.map(d => d.repo))]
  const toggle = (key: string) => setChosen(c => (c.has(key) ? new Set([...c].filter(k => k !== key)) : new Set([...c, key])))
  const run = async (action: "ticket" | "dismiss") => {
    if (await act("/api/pipeline/debt", { keys: [...chosen], action }, action === "ticket" ? "Ticket created in Jira" : "Dismissed")) (setChosen(new Set()), onChange())
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[min(960px,92vw)] max-w-none flex-col gap-3">
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="text-[15px]">Code debt</DialogTitle>
          {KINDS.map(([k, label]) => (
            <button key={k} onClick={() => (setKind(k), setChosen(new Set()))} className={cn("text-xs", kind === k ? "font-semibold text-text" : "text-faint hover:text-text")}>{label}</button>
          ))}
          <i className="h-3 w-px bg-line" />
          {(["open", "all"] as Show[]).map(s => (
            <button key={s} onClick={() => setShow(s)} className={cn("text-xs", show === s ? "font-semibold text-text" : "text-faint hover:text-text")}>{s === "open" ? "Open" : "All"}</button>
          ))}
          <span className="ml-auto flex gap-2">
            <Button variant="outline" className="h-7 text-xs" disabled={!chosen.size} onClick={() => void run("dismiss")}>Dismiss</Button>
            <Button className="h-7 text-xs" disabled={!chosen.size} onClick={() => void run("ticket")}>Create Jira ticket{chosen.size ? ` (${chosen.size})` : ""}</Button>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!shown.length && <p className="m-0 py-6 text-center text-[13px] text-faint">{kind === "debt" ? "No debt yet: Build and Review note it here as they find it." : "No improvements proposed yet."}</p>}
          {repos.map(repo => (
            <section key={repo} className="mb-3">
              <h3 className="m-0 mb-1 text-xs font-semibold text-text-muted">{repo}</h3>
              <ul className="m-0 list-none p-0">
                {shown.filter(d => d.repo === repo).map(d => <DebtRow key={d.key} d={d} isChosen={chosen.has(d.key)} onToggle={() => toggle(d.key)} />)}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const order = (d: DebtEntry) => ["blocker", "major", "minor"].indexOf(d.severity)

function DebtRow({ d, isChosen, onToggle }: { d: DebtEntry; isChosen: boolean; onToggle: () => void }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <label className="flex cursor-pointer items-baseline gap-2.5 py-1.5 text-[12.5px]">
        <input type="checkbox" checked={isChosen} onChange={onToggle} disabled={d.status !== "open"} className="size-3.5 shrink-0 translate-y-[2px] accent-(--brand)" />
        <i className={cn("size-2 shrink-0 rounded-full", DOT[d.severity])} title={d.severity} />
        <span className="min-w-0 flex-1">
          <span className="text-text">{d.note}</span>
          <span className="ml-2 font-mono text-[11px] text-faint">{d.file}{d.line ? `:${d.line}` : ""}{d.rule ? ` · ${d.rule}` : ""}</span>
        </span>
        <span className="shrink-0 text-[11px] text-faint">{d.status === "ticketed" ? d.jira : d.status === "dismissed" ? "dismissed" : d.tickets.join(", ")}</span>
      </label>
    </li>
  )
}
