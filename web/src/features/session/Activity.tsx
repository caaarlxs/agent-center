// What a card says of its session. The line: what it says it does, as Claude
// desktop shows it (lib/saying.ts: its task in progress, or the last command
// it described), the step it is at when it keeps a task list; the
// question when it waits for you, in amber; what it did, when it rests. The
// cells: what is not up yet (files not committed, commits not pushed, PRs
// open and their checks), always in the same place.
import { CloudUpload, GitPullRequest, MessageCircleQuestion, Pencil } from "lucide-react"
import type { ReactNode } from "react"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { doingPhrase } from "@/features/conversation/session-events"
import { plainOf } from "@/features/conversation/text"

const two = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as const

export function NowLine({ card, className }: { card: Card; className?: string }) {
  const base = cn("m-0 min-h-[2.8em] text-[12.5px] leading-[1.4] [overflow-wrap:anywhere]", className)
  if (card.column === "asking" && card.ask)
    return <p className={cn(base, "font-medium text-ask")} style={two} title={card.ask}><MessageCircleQuestion className="mr-1 inline size-3.5 align-[-2px]" />{plainOf(card.ask)}</p>
  if (card.column === "working") {
    // What it says it does (held while it reads and edits), else what it does now.
    const p = card.progress
    const said = card.doing?.kind === "compacting" || card.doing?.kind === "retrying" ? (doingPhrase(card.doing) ?? "Working") : (card.saying ?? doingPhrase(card.doing) ?? "Working")
    const line = p?.total ? `${Math.min(p.done + 1, p.total)}/${p.total} · ${said}` : said
    return <p className={cn(base, "font-medium text-text")} style={two} title={line}>{line}</p>
  }
  return <p className={cn(base, "text-text-muted")} style={two} title={card.recap ?? undefined}>{plainOf(card.recap ?? "")}</p>
}

const cell = "flex min-w-0 items-center justify-center gap-1 rounded-[7px] px-1.5 py-[3px] text-[11px] font-medium"

// The PR cell's colour: the worst of their checks; quiet with none open.
const prToneOf = (prs: Card["prs"]) =>
  !prs.length ? "bg-hover text-faint"
    : prs.some(p => p.checks === "fail") ? "bg-bad-soft text-bad"
    : prs.some(p => p.checks === "pending") ? "bg-ask-soft text-ask"
    : "bg-work-soft text-work"

// One cell: lit (its tone, its count) when there is something, else quiet.
function Cell({ count, tone, icon, title }: { count: number; tone: string; icon: ReactNode; title: string }) {
  return <span className={cn(cell, count ? tone : "bg-hover text-faint")} title={title}>{icon}{count || ""}</span>
}
const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`

export function WorkCells({ card }: { card: Card }) {
  if (!card.work && !card.prs?.length) return null // not in a git repository
  const files = card.work?.uncommitted ?? 0
  const commits = card.work?.unpushed ?? 0
  const prs = card.prs ?? []
  return (
    <span className="grid grid-cols-3 gap-1">
      <Cell count={files} tone="bg-ask-soft text-ask" icon={<Pencil className="size-3 flex-none" />} title={files ? `${many(files, "file", "files")} not committed` : "Nothing to commit"} />
      <Cell count={commits} tone="bg-ask-soft text-ask" icon={<CloudUpload className="size-3 flex-none" />} title={commits ? `${many(commits, "commit", "commits")} not pushed` : "Nothing to push"} />
      <Cell count={prs.length} tone={prToneOf(prs)} icon={<GitPullRequest className="size-3 flex-none" />}
        title={prs.length ? prs.map(p => `#${p.number} ${p.title} · checks ${p.checks ?? "none"}`).join("\n") : "No PR open"} />
    </span>
  )
}
