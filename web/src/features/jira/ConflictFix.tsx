// A PR of the ticket with conflicts with its base: a click hands them to an agent
// (lib/conflicts.ts), which merges the base into it and pushes, or says why not.
import { Shimmer } from "@/components/ai-elements/shimmer"
import { cn } from "@/lib/utils"
import { useConfirm } from "./confirm"
import { useStageData } from "./stage-data"

// A PR with conflicts: a click hands them to an agent (it asks once more), which merges the base
// into it and pushes, or says why not; then what it said. The merge stays with whoever merges it.
export function ConflictFix({ url }: { url: string }) {
  const { prs, fixes, onResolve } = useStageData()
  const [isAsking, confirm] = useConfirm()
  const pr = prs[url]
  const fix = fixes[url]
  if (fix?.status === "running") return <Shimmer as="span" duration={2.2} className="block text-xs [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">An agent resolves the conflicts</Shimmer>
  const canResolve = !!onResolve && pr?.state === "OPEN" && pr.isConflicting
  if (!canResolve && !fix) return null
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      {fix && <span className={fix.status === "resolved" ? "text-work" : "text-ask"}>{fix.status === "resolved" ? "Conflicts resolved" : "Not resolved"}{fix.reason ? `: ${fix.reason}` : ""}</span>}
      {canResolve && <button className={cn("font-semibold transition-colors duration-120", isAsking ? "text-bad" : "text-text-muted hover:text-text")} onClick={() => confirm(() => onResolve(url))}>{isAsking ? "Sure? An agent pushes to the PR" : fix ? "Try again" : "Resolve conflicts"}</button>}
    </span>
  )
}
