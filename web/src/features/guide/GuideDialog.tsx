// The guide (?): what the app does, from FEATURES.md, one line a feature in
// groups, and the keyboard shortcuts; a field narrows both as you type. A
// line new in the last two weeks says so. Opening it counts as a look at
// what is new.
import { Fragment, useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { helpOpen } from "@/features/keys/help-state"
import { CATALOGUE, dayOf, markSeen } from "./whats-new"
import { findIn } from "./guide"

const SHORTCUTS: [string, string[][]][] = [
  ["Move", [["J", "K"], ["↓", "↑"]]],
  ["Open conversation", [["↵"]]],
  ["Reply", [["R"]]],
  ["Rename", [["T"]]],
  ["Open in Claude", [["O"]]],
  ["Pin", [["P"]]],
  ["Colour", [["C"], ["0–7"]]],
  ["Later", [["A"], ["1–5"]]],
  ["Mark as done", [["E"]]],
  ["Undo", [["Z"]]],
  ["Search", [["/"], ["⌘", "K"]]],
  ["Inbox · Board · Canvas · Tiers", [["1"], ["2"], ["3"], ["4"]]],
  ["Tiers: one row up · down", [["["], ["]"]]],
  ["Tiers: one place left · right", [["<"], [">"]]],
  ["Lanes per repo", [["G"]]],
  ["Next up: what waits for you", [["F"]]],
  ["New session", [["N"]]],
  ["Catch me up", [["D"]]],
  ["Stop the running turn", [["S"]]],
  ["Mark to review", [["U"]]],
  ["Canvas: zoom in · zoom out · fit", [["+"], ["−"], ["0"]]],
  ["Canvas: move the view (hold and drag)", [["Space"]]],
  ["This guide", [["?"]]],
  ["Close", [["Esc"]]],
]
const NEW_DAYS = 14

const heading = "mt-4 mb-1 text-[11px] font-semibold tracking-[0.04em] text-faint uppercase first:mt-0"

export function GuideDialog() {
  const isOpen = helpOpen.use()
  const [query, setQuery] = useState("")
  useEffect(() => void (isOpen ? markSeen() : setQuery("")), [isOpen])
  const recent = dayOf(Date.now() - NEW_DAYS * 86_400_000)
  const groups = useMemo(() => findIn(CATALOGUE, query), [query])
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const keys = SHORTCUTS.filter(([label]) => words.every(w => `keyboard shortcuts ${label}`.toLowerCase().includes(w)))
  return (
    <Dialog open={isOpen} onOpenChange={helpOpen.set}>
      <DialogContent className="flex max-h-[min(720px,calc(100vh-48px))] w-[min(600px,calc(100vw-32px))] max-w-none flex-col gap-0 p-0">
        <div className="shrink-0 border-b border-line px-5 pt-4 pb-3">
          <DialogTitle className="mb-2.5 text-base font-[650]">Guide</DialogTitle>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search: notes, zones, PR, Jira…" aria-label="Search the guide"
            className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {groups.map(g => (
            <section key={g.name}>
              <h3 className={heading}>{g.name}</h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {g.items.map(i => (
                  <li key={i.text} className="flex items-baseline gap-2 border-b border-line py-[6px] text-[13px] last:border-b-0">
                    <span className="min-w-0 flex-1">{i.text}</span>
                    {i.since && i.since >= recent && <span className="shrink-0 rounded bg-brand-soft px-1.5 text-[10.5px] font-semibold text-brand">New</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {keys.length > 0 && (
            <section>
              <h3 className={heading}>Keyboard shortcuts</h3>
              <dl className="m-0 flex flex-col">
                {keys.map(([label, combos]) => (
                  <div key={label} className="flex items-center justify-between border-b border-line py-[6px] text-[13px] last:border-b-0">
                    <dt>{label}</dt>
                    <dd className="m-0 flex items-center gap-[5px]">
                      {combos.map((k, n) => (
                        <Fragment key={n}>{n > 0 && <span className="mx-0.5 text-[11px] text-text-muted">or</span>}{k.map(x => <Kbd key={x}>{x}</Kbd>)}</Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {!groups.length && !keys.length && <p className="py-6 text-center text-text-muted">Nothing about “{query.trim()}”.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
