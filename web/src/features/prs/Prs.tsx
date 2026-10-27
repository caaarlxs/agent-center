// The session's pull requests (needs gh): state, checks, review, size, and the
// actions GitHub allows from here (merge, ready for review, close, reopen).
import { ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { get, post } from "@/lib/api"
import type { PrDetail } from "@/lib/api-types"
import { cn } from "@/lib/utils"

const STATE = {
  OPEN: { icon: GitPullRequest, tone: "text-emerald-400", label: "Open" },
  DRAFT: { icon: GitPullRequestDraft, tone: "text-zinc-400", label: "Draft" },
  MERGED: { icon: GitMerge, tone: "text-violet-400", label: "Merged" },
  CLOSED: { icon: GitPullRequestClosed, tone: "text-rose-400", label: "Closed" },
}

function act(pr: PrDetail, action: string, method?: string) {
  return post("/api/prs/action", { url: pr.url, action, method }).then(() => toast(`${action[0].toUpperCase()}${action.slice(1)}: done`), (err: Error) => toast.error(err.message))
}

function PrCard({ pr }: { pr: PrDetail }) {
  const s = STATE[pr.isDraft && pr.state === "OPEN" ? "DRAFT" : pr.state]
  const checks = pr.checks === "pass" ? ["Checks pass", "text-emerald-400"] : pr.checks === "fail" ? [`${pr.failing.length} failing`, "text-rose-400"] : pr.checks === "pending" ? [`${pr.pending.length} running`, "text-amber-400"] : null
  return (
    <article className="space-y-2.5 rounded-xl border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <s.icon className={cn("mt-0.5 size-4 shrink-0", s.tone)} />
        <div className="min-w-0 flex-1">
          <a href={pr.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{pr.title}</a>
          <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">{pr.repo}#{pr.number} · {pr.headRefName} → {pr.baseRefName}</p>
        </div>
        <Button variant="ghost" size="icon-sm" asChild><a href={pr.url} target="_blank" rel="noreferrer" aria-label="Open on GitHub"><ExternalLink /></a></Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="outline" className={s.tone}>{s.label}</Badge>
        {checks && <Badge variant="outline" className={checks[1]} title={[...pr.failing, ...pr.pending].join("\n")}>{checks[0]}</Badge>}
        {pr.reviewDecision === "APPROVED" && <Badge variant="outline" className="text-emerald-400">Approved</Badge>}
        {pr.reviewDecision === "CHANGES_REQUESTED" && <Badge variant="outline" className="text-rose-400">Changes requested</Badge>}
        {pr.mergeable === "CONFLICTING" && <Badge variant="outline" className="text-rose-400">Conflicts</Badge>}
        <span className="ml-auto font-mono text-muted-foreground"><span className="text-emerald-400">+{pr.additions}</span> <span className="text-rose-400">−{pr.deletions}</span> · {pr.changedFiles} files</span>
      </div>
      {pr.state === "OPEN" && (
        <div className="flex gap-1.5">
          {pr.isDraft ? <Button size="sm" variant="outline" onClick={() => act(pr, "ready")}>Ready for review</Button> : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" disabled={pr.mergeable === "CONFLICTING"}><GitMerge />Merge</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => act(pr, "merge", "squash")}>Squash and merge</DropdownMenuItem>
                <DropdownMenuItem onClick={() => act(pr, "merge", "merge")}>Merge commit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => act(pr, "merge", "rebase")}>Rebase and merge</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => act(pr, "draft")}>Back to draft</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => act(pr, "close")}>Close</Button>
        </div>
      )}
      {pr.state === "CLOSED" && <Button size="sm" variant="outline" onClick={() => act(pr, "reopen")}>Reopen</Button>}
    </article>
  )
}

export function Prs({ id }: { id: string }) {
  const [prs, setPrs] = useState<PrDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    get<{ prs: PrDetail[] }>(`/api/sessions/${encodeURIComponent(id)}/prs`).then(r => setPrs(r.prs), (err: Error) => setError(err.message))
  }, [id])
  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>
  if (!prs) return <p className="p-6 text-sm text-muted-foreground">Asking GitHub…</p>
  if (!prs.length) return <p className="p-6 text-sm text-muted-foreground">No pull request for this session.</p>
  return <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">{prs.map(pr => <PrCard key={pr.url} pr={pr} />)}</div>
}
