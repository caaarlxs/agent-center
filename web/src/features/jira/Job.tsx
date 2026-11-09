// A job (lib/jobs.ts) whole: what its specialist does now or what it found,
// against which ticket and PRs; its document and runs folded at the foot.
// It writes nowhere: what it found stays here.
import { useEffect, useState } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { get } from "@/lib/api"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { Markdown } from "@/features/conversation/Markdown"
import { ago, repoDot } from "@/features/session/state"
import type { Job } from "@server/jobs"
import type { AgentStage } from "@server/pipeline"
import { AtWork, BuildPanel, FoldButton, PlanPanel, ReviewPanel, Runs, StopAgent, TestPanel, act, openLog, useConfirm } from "./Pipeline"
import { PipelineMark, liveLine } from "./PipelineMark"
import { SPECIALISTS, jobLabel } from "./jobs-board"
import { costOf, dollars } from "./pipeline-board"

const FOLLOW_MS = 5_000
// What each specialist's document is.
const DOC: Record<AgentStage, string> = { refine: "Refinement", plan: "Plan", build: "Build", review: "Review", test: "Test", smoke: "Prod check" }

function Sources({ job }: { job: Job }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {job.ticket && <button className="font-mono font-semibold text-brand hover:underline" onClick={() => openDialog({ kind: "ticket", key: job.ticket! })}>{job.ticket}</button>}
      {job.prs.map(p => (
        <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-text-muted no-underline hover:text-text">
          <i className="size-[7px] shrink-0 rounded-[2px]" style={{ background: repoDot(p.repo) }} />
          <span className="truncate">{p.repo} #{p.number}{p.title ? ` · ${p.title}` : ""}</span>
        </a>
      ))}
    </div>
  )
}

// What the job does now, or what it ended in; its log while it works, else
// running it again or clearing it.
function JobNow({ job, onClose }: { job: Job; onClose: () => void }) {
  const now = useNow()
  const card = useLive(l => l.snapshot?.cards.find(c => c.id === job.sessionId))
  const isRunning = job.status === "running"
  const runs = job.history ?? []
  const line = liveLine(job, card)
  const name = nameOf(job)
  const again = async () => (await act("/api/jobs/start", { stage: job.stage, ticket: job.ticket, prs: job.prs.map(p => p.url) }, `${name}: a new job`)) && onClose()
  const clear = async () => (await act("/api/jobs/clear", { id: job.id }, "Cleared")) && onClose()
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-side px-3 py-2.5">
      <PipelineMark state={job} card={card} size={26} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isRunning ? <Shimmer as="span" duration={2.2} className="truncate text-[13.5px] font-semibold [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">{line}</Shimmer>
          : <span className={cn("truncate text-[13.5px] font-semibold", job.status === "failed" ? "text-bad" : "text-text")}>{line}</span>}
        <span className="text-[11.5px] text-faint tabular-nums">{ago(isRunning ? job.startedAt : (job.endedAt ?? job.startedAt), now)}{runs.length ? ` · ≈${dollars(costOf(runs))}` : ""}</span>
      </div>
      {!isRunning && <OnInPipeline job={job} onClose={onClose} />}
      {isRunning && <StopAgent path="/api/jobs/stop" body={{ id: job.id }} />}
      {isRunning ? job.sessionId && <button className="shrink-0 text-xs font-semibold text-text-muted hover:text-text" onClick={() => openLog(job.sessionId!)}>Log</button>
        : <>
            <button className="shrink-0 text-xs font-semibold text-faint hover:text-text" onClick={() => void clear()}>Clear</button>
            <Button variant="outline" className="h-7 shrink-0 text-xs" onClick={() => void again()}>Run again</Button>
          </>}
    </div>
  )
}

// A refinement, a plan or a build of a ticket goes on in the pipeline from
// where it ended (it asks once more: it labels the ticket, a build moves it in
// Jira); once there, a link to it.
function OnInPipeline({ job, onClose }: { job: Job; onClose: () => void }) {
  const [isAsking, confirm] = useConfirm()
  const adopts = useLive(l => l.snapshot?.adopts) ?? []
  if (job.continued) return <button className="shrink-0 text-xs font-semibold text-brand hover:underline" onClick={() => openDialog({ kind: "ticket", key: job.continued! })}>In the pipeline</button>
  if (job.status !== "ready" || !job.ticket || !adopts.includes(job.stage as AgentStage)) return null
  const go = () => confirm(async () => (await act("/api/jobs/continue", { id: job.id }, `${job.ticket} goes on in the pipeline`)) && (onClose(), openDialog({ kind: "ticket", key: job.ticket! })))
  return <Button variant={isAsking ? "destructive" : "default"} className="h-7 shrink-0 text-xs" onClick={go}>{isAsking ? "Sure? Continue in the pipeline" : "Continue in the pipeline"}</Button>
}

// What it left, by specialist: a plan's units, a build's PRs, a review's
// findings, a test's results; and the questions it could not decide.
function StagePanel({ job }: { job: Job }) {
  if (job.stage === "plan") return <PlanPanel state={job} steps={null} />
  if (job.stage === "build") return <BuildPanel state={job} />
  if (job.stage === "review") return <ReviewPanel state={job} onFix={() => {}} onPublish={ids => void act("/api/jobs/publish", { id: job.id, findings: ids }, "Published to the PRs")} />
  if (job.stage === "test" || job.stage === "smoke") return <TestPanel state={job} release={null} />
  return null
}

function JobResult({ job }: { job: Job }) {
  if (job.status === "running") return <AtWork state={job} />
  if (job.status === "failed") return null
  return (
    <>
      <StagePanel job={job} />
      {job.questions.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
          {job.questions.map(q => (
            <li key={q.id} className="flex flex-col gap-1.5">
              <span className="font-semibold">{q.question}</span>
              {q.context && <Markdown className="text-[13px] text-text-muted">{q.context}</Markdown>}
              {q.proposal && <Markdown className="border-l-2 border-line-strong pl-3 text-[13px] text-text-muted">{q.proposal}</Markdown>}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

// Its document (read again while it works) and its runs, folded.
function JobFoot({ job }: { job: Job }) {
  const now = useNow()
  const [doc, setDoc] = useState<string | null>(null)
  const [fold, setFold] = useState<"doc" | "runs" | null>(null)
  const isRunning = job.status === "running"
  useEffect(() => {
    const load = () => get<{ doc: string | null } | null>(`/api/jobs/job?id=${encodeURIComponent(job.id)}`).then(r => setDoc(r?.doc ?? null), () => {})
    void load()
    if (!isRunning) return
    const timer = setInterval(load, FOLLOW_MS)
    return () => clearInterval(timer)
  }, [job.id, isRunning])
  const runs = job.history ?? []
  if (!doc && !runs.length) return null
  const toggle = (f: "doc" | "runs") => setFold(open => (open === f ? null : f))
  return (
    <footer className="-mx-1 border-t border-line px-1 pt-2.5">
      <span className="flex justify-end gap-4">
        {doc && <FoldButton label={DOC[job.stage as AgentStage]} isOpen={fold === "doc"} onToggle={() => toggle("doc")} />}
        {runs.length > 0 && <FoldButton label="Runs" isOpen={fold === "runs"} onToggle={() => toggle("runs")} />}
      </span>
      {fold === "doc" && doc && <Markdown className="mt-3 max-h-[40vh] overflow-auto text-[13px]">{doc}</Markdown>}
      {fold === "runs" && <div className="mt-3"><Runs history={runs} now={now} /></div>}
    </footer>
  )
}

const nameOf = (job: Job) => SPECIALISTS.find(s => s.stage === job.stage)?.name ?? job.stage

export function JobDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const job = useLive(l => l.snapshot?.jobs.find(j => j.id === id))
  if (!job) return null
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,900px)] w-[min(760px,calc(100vw-32px))] flex-col gap-4">
        <header className="flex flex-col gap-2 pr-8">
          <span className="text-xs font-[650] tracking-[0.04em] text-text-muted uppercase">{nameOf(job)} · <span className="font-mono">{job.id}</span></span>
          <DialogTitle className="m-0 text-[17px] leading-[1.35] font-[620]">{job.summary ?? jobLabel(job)}</DialogTitle>
          <Sources job={job} />
        </header>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-1">
          <JobNow job={job} onClose={onClose} />
          <JobResult job={job} />
        </div>
        <JobFoot job={job} />
      </DialogContent>
    </Dialog>
  )
}
