// What people said on a merge's PR, one line a comment: who, where, what it asks, and what the
// agent that made the changes did with it (applied, already done, not applied and why), each a
// link to its thread. Over it, the agent's changes (base...head) and asking its reviewers to look
// again (they are told: it asks twice).
import { Check, Equal, ExternalLink, Minus, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Outcome, ReleaseStep } from "@server/release"
import { act } from "./feedback"
import { changed, useConfirm } from "./confirm"

const MARK: Record<Outcome["status"] | "open", { icon: LucideIcon; tone: string; label: string }> = {
  applied: { icon: Check, tone: "text-work", label: "Applied" },
  already: { icon: Equal, tone: "text-text-muted", label: "Already done" },
  skipped: { icon: X, tone: "text-bad", label: "Not applied" },
  open: { icon: Minus, tone: "text-ask", label: "Asks for a change" },
}
const fileOf = (path: string | null) => path?.split("/").pop() ?? "The PR"

export function FeedbackList({ ticketKey, step }: { ticketKey: string; step: ReleaseStep }) {
  const fb = step.feedback!
  const pr = step.links.find(l => l.label.startsWith("PR #"))?.url ?? null
  const repo = pr?.replace(/\/pull\/\d+$/, "") ?? null
  const changes = repo && fb.base && fb.head ? `${repo}/compare/${fb.base}...${fb.head}` : pr ? `${pr}/commits` : null
  const [isAsking, confirm] = useConfirm()
  const ask = () => void act("/api/pipeline/rereview", { key: ticketKey, step: step.id }, "Re-review asked on GitHub").then(ok => ok && changed())
  return (
    <div className="flex flex-col gap-2">
      {fb.state === "addressed" && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {changes && <a href={changes} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand no-underline hover:underline">See the changes<ExternalLink size={11} /></a>}
          {fb.askedAt ? <span className="text-text-muted">Re-review asked</span>
            : <button className={cn("font-semibold", isAsking ? "text-bad" : "text-text-muted hover:text-text")} onClick={() => confirm(ask)}>{isAsking ? "Sure? Its reviewers are told" : "Ask for a re-review"}</button>}
        </span>
      )}
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {fb.items.map((c, i) => {
          const mark = MARK[c.outcome?.status ?? "open"]
          return (
            <li key={i} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 text-[12.5px] leading-[1.45]">
              <mark.icon size={13} className={cn("translate-y-[2px]", mark.tone)} aria-label={mark.label} />
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-text">{fileOf(c.path)}</span>
                  <span className="text-xs text-faint">{c.author ?? "?"}</span>
                  {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand no-underline hover:underline">thread ↗</a>}
                </span>
                <span className="text-text-muted">{c.why ?? c.body.slice(0, 200)}</span>
                {c.outcome && <span className={cn("text-xs", mark.tone)}>{mark.label}{c.outcome.why ? `: ${c.outcome.why}` : ""}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
