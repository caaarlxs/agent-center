// What each stage left, in its own shape (a stage's tab, and a job's dialog):
// the refinement's decisions; the plan's PRs, its scripts and its to-dos; the
// build's PRs; the review's findings; a release's steps; the test's criteria,
// each with its evidence. One line a thing, a hairline between them.
import { AlertTriangle, Check, CircleHelp, Database, GitPullRequestArrow, Play, Send } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { repoDot } from "@/features/session/state"
import type { Asked, ChecklistItem, Finding, PipelineState, Severity, Stage, TestResult, Turn, Unit } from "@server/pipeline"
import type { Release } from "@server/release"
import { Ask } from "./Ask"
import { Evidence } from "./Evidence"
import { Details } from "./Fold"
import { ReleaseSteps, type After } from "./Release"
import { changed, useConfirm } from "./confirm"
import { act } from "./feedback"
import { Section } from "./kinds"
import { carriedResults, failed, isJob } from "./pipeline-board"

// ---------- the parts every stage shares ----------

const Repo = ({ repo }: { repo: string }) => (
  <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold"><i className="size-2 rounded-[3px]" style={{ background: repoDot(repo) }} />{repo}</span>
)
// One thing a line: its mark, what it is, and what it ends in (a PR, a repo, a key).
function Row({ mark, end, isDim = false, children }: { mark: ReactNode; end?: ReactNode; isDim?: boolean; children: ReactNode }) {
  return (
    <li className={cn("grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 border-t border-line py-2 text-[13px] leading-[1.45] first:border-t-0 transition-opacity duration-150", isDim && "opacity-45")}>
      <span className="translate-y-[2px] text-faint">{mark}</span>
      <span className="min-w-0">{children}</span>
      <span className="flex items-center gap-2.5 text-xs text-faint">{end}</span>
    </li>
  )
}
const Rows = ({ children }: { children: ReactNode }) => <ol className="m-0 list-none p-0">{children}</ol>
const PrLink = ({ url }: { url: string }) => <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs font-semibold text-brand no-underline hover:underline">#{url.split("/").pop()}</a>
// The sub-tasks a unit covers, in a line (the single one of older plans too).
export const subtasksOf = (u: Unit) => (u.subtasks?.length ? u.subtasks.join(", ") : u.subtask) || null

// ---------- refine ----------

// What a pass asked you, and what you answered (a proposal you took, dimmed).
export function AskedList({ asked }: { asked: Asked[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
      {asked.map(q => (
        <li key={q.id} className="flex flex-col gap-1">
          <span className="text-[13px] leading-[1.45] font-semibold">{q.question}</span>
          {q.answer !== undefined && <span className={cn("max-w-[72ch] text-[13px] leading-[1.55] whitespace-pre-wrap", q.isProposal ? "text-faint" : "text-text-muted")}>{q.answer}</span>}
        </li>
      ))}
    </ol>
  )
}

// The decisions you took last in the refinement, as questions and answers (none: a refinement from before they were kept).
export const lastDecisions = (state: PipelineState) =>
  [...(state.history ?? [])].reverse().find(r => (r.stage ?? "refine") === "refine" && r.kept?.asked?.some(q => q.answer !== undefined))?.kept?.asked
export function RefinePanel({ state }: { state: PipelineState }) {
  const asked = lastDecisions(state)
  return asked ? <Section title="Decisions" extra={asked.length}><AskedList asked={asked} /></Section> : null
}

// ---------- plan ----------

// The plan's to-do list in plain words, each item ticked once the build has
// done it (the one it works on next, breathing, while it builds).
export function Checklist({ items, checked, units = [], isBuilding }: { items: ChecklistItem[]; checked: string[]; units?: Unit[]; isBuilding: boolean }) {
  const done = new Set(checked)
  const next = isBuilding ? items.find(i => !done.has(i.id))?.id : undefined
  return (
    <Section title="To-dos" extra={`${items.filter(i => done.has(i.id)).length} of ${items.length}`}>
      <Rows>
        {items.map(i => {
          const repo = units.find(u => u.id === i.unit)?.repo
          return (
            <Row key={i.id} end={repo && <Repo repo={repo} />} mark={
              <span className={cn("grid size-[13px] place-items-center rounded-full border transition-colors duration-200",
                done.has(i.id) ? "border-work bg-work text-background" : i.id === next ? "border-work" : "border-line-strong")}>
                {done.has(i.id) ? <Check size={9} strokeWidth={3} /> : i.id === next ? <i className="run-dot size-[5px] rounded-full bg-work" /> : null}
              </span>}>
              <span className={done.has(i.id) ? "text-text-muted" : "text-text"}>{i.text}</span>
            </Row>
          )
        })}
      </Rows>
    </Section>
  )
}

// The plan: the PRs it opens (a repo and what each delivers), the scripts it runs on the data, and its to-dos.
export function PlanPanel({ state }: { state: PipelineState }) {
  const units = state.units ?? []
  const scripts = state.scripts ?? []
  return (
    <div className="flex flex-col gap-5">
      <Section title="Pull requests" extra={units.length}>
        <Rows>{units.map(u => <Row key={u.id} mark={<GitPullRequestArrow size={13} />} end={subtasksOf(u) && <span className="font-mono text-[11.5px]">{subtasksOf(u)}</span>}><Repo repo={u.repo} /> <span className="text-text-muted">{u.title}</span></Row>)}</Rows>
      </Section>
      {scripts.length > 0 && (
        <Section title="Scripts on the data" extra={scripts.length}>
          <Rows>
            {scripts.map(x => {
              const repo = units.find(u => u.id === x.unit)?.repo
              return <Row key={x.id} mark={<Database size={13} />} end={repo && <Repo repo={repo} />}><span title={[x.command, x.when, x.envs.join(" → ")].filter(Boolean).join(" · ")}>{x.title}</span></Row>
            })}
          </Rows>
        </Section>
      )}
      {state.checklist?.length ? <Checklist items={state.checklist} checked={state.checked ?? []} units={units} isBuilding={false} /> : null}
    </div>
  )
}

// ---------- build ----------

// The build is the plan made real: every PR of the ticket (all), each with its link and
// whether its tests passed; the ones this pass did not touch, dimmed.
export function BuildPanel({ state, all = state.units ?? [] }: { state: PipelineState; all?: Unit[] }) {
  const pass = new Map((state.units ?? []).map(u => [u.id, u]))
  return (
    <Section title="Pull requests" extra={all.length}>
      <Rows>
        {all.map(unit => {
          const u = pass.get(unit.id) ?? unit
          return (
            <Row key={u.id} isDim={!pass.has(u.id)} mark={<GitPullRequestArrow size={13} />} end={
              <>
                {u.pr && <PrLink url={u.pr} />}
                {u.status === "done" ? <Check size={13} strokeWidth={2.6} className="text-work" aria-label="Tests and checks passed" /> : u.status === "failed" ? <AlertTriangle size={13} className="text-bad" aria-label="Failed" /> : null}
              </>}>
              <Repo repo={u.repo} /> <span className="text-text-muted">{u.title}</span>
            </Row>
          )
        })}
      </Rows>
    </Section>
  )
}

// ---------- review ----------

// What the review found, the worst first: each says what fails and where (a
// click shows why and the fix); the ones a build fixed since, ticked.
const SEVERITY: Record<Severity, { rank: number; dot: string; name: string }> = {
  blocker: { rank: 0, dot: "bg-bad", name: "Blocker" }, major: { rank: 1, dot: "bg-ask", name: "Major" }, minor: { rank: 2, dot: "bg-line-strong", name: "Minor" },
}
const SEVERITIES: Severity[] = ["blocker", "major", "minor"]

function FindingRow({ finding: f, unit, isFixed, isPublished = false, isChosen, onChoose, ask }: { finding: Finding; unit: Unit | undefined; isFixed: boolean; isPublished?: boolean; isChosen: boolean | null; onChoose: () => void; ask?: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : ""
  return (
    <li className="border-t border-line first:border-t-0">
      <div className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 py-2">
        {isFixed ? <Check size={12} className="text-work" /> : <i className={cn("size-2 translate-y-[-1px] rounded-full", SEVERITY[f.severity].dot)} aria-label={f.severity} />}
        <button className={cn("text-left text-[13px] leading-[1.45] font-semibold hover:underline hover:decoration-line-strong hover:underline-offset-[3px]", isFixed ? "text-text-muted" : "text-text")} onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>{f.title}</button>
        <span className="flex items-center gap-2.5 text-xs text-faint">
          {/* The build says it fixed it: only the next review confirms it. */}
          {isFixed ? <span className="font-semibold text-ask">fixed · to confirm</span> : isPublished ? <span>published</span> : unit && <Repo repo={unit.repo} />}
          {isChosen !== null && <input type="checkbox" checked={isChosen} onChange={onChoose} aria-label={`Fix ${f.title}`} className="size-3.5 cursor-pointer accent-(--brand)" />}
        </span>
      </div>
      {isOpen && (
        <div className="ml-6 flex flex-col gap-2 pb-3 text-[13px] leading-[1.55]">
          {/* For you first; the agent's own words (the file, the case, the fix) folded. */}
          {f.plain ? (
            <>
              <p className="m-0 max-w-[72ch] text-text-muted">{f.plain}</p>
              <Details label="Technical detail"><Technical where={where} finding={f} /></Details>
            </>
          ) : <Technical where={where} finding={f} />}
          {ask}
          {unit?.pr && <a href={`${unit.pr}/files`} target="_blank" rel="noreferrer" className="self-start text-xs font-semibold text-brand no-underline hover:underline">Open in PR #{unit.pr.split("/").pop()}</a>}
        </div>
      )}
    </li>
  )
}

function Technical({ where, finding: f }: { where: string; finding: Finding }) {
  return (
    <div className="flex flex-col gap-2">
      {where && <span className="truncate font-mono text-[11px] text-faint">{where}</span>}
      {f.detail && <p className="m-0 text-text-muted">{f.detail}</p>}
      {f.fix && <p className="m-0 text-text-muted">{f.fix}</p>}
    </div>
  )
}

// A job's review (lib/jobs.ts) publishes what you chose to its PRs instead: it asks once more.
function PublishButton({ n, onGo }: { n: number; onGo: () => void }) {
  const [isAsking, confirm] = useConfirm()
  const label = `Publish ${n} to the PRs`
  return (
    <Button variant={isAsking ? "destructive" : "outline"} className="mt-1 h-8 self-start gap-1.5 text-xs" onClick={() => confirm(onGo)}>
      <Send size={13} />{isAsking ? `Sure? ${label}` : label}
    </Button>
  )
}

// The findings by severity (one at a time if you pick it). You choose what the build fixes:
// the blockers and majors come chosen, the minors not; one button fixes them all in one run.
export function ReviewPanel({ state, onFix, onPublish }: { state: PipelineState; onFix: (ids: string[]) => void; onPublish?: (ids: string[]) => void }) {
  const findings = [...(state.findings ?? [])].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank)
  const [only, setOnly] = useState<Severity | null>(null)
  const fixed = new Set(state.fixed ?? [])
  const published = new Set((state as { published?: string[] }).published ?? [])
  const canChoose = state.stage === "review" && (state.status === "ready" || state.status === "needs-info") && (isJob(state) ? !!onPublish : state.status === "ready")
  const [picked, setChosen] = useState(() => new Set(findings.filter(f => f.severity !== "minor").map(f => f.id)))
  // What is published already is never chosen again.
  const chosen = new Set([...picked].filter(id => !published.has(id)))
  const choose = (id: string) => setChosen(c => (c.has(id) ? new Set([...c].filter(x => x !== id)) : new Set([...c, id])))
  if (!findings.length) return <Section title="Findings" extra={0}>{null}</Section>
  return (
    <div className="flex flex-col gap-2">
      <SeverityChips findings={findings} only={only} onPick={setOnly} />
      <ol className="m-0 list-none p-0">
        {findings.filter(f => !only || f.severity === only).map(f => <FindingRow key={f.id} finding={f} unit={state.units?.find(u => u.id === f.unit)} isFixed={fixed.has(f.id)} isPublished={published.has(f.id)} isChosen={canChoose && !published.has(f.id) ? chosen.has(f.id) : null} onChoose={() => choose(f.id)}
          ask={isJob(state) ? undefined : <Ask ticketKey={state.key} about={`finding:${f.id}`} turns={state.threads?.[`finding:${f.id}`]} />} />)}
      </ol>
      {canChoose && chosen.size > 0 && (onPublish ? <PublishButton n={chosen.size} onGo={() => onPublish([...chosen])} />
        : <FixButton n={chosen.size} isBlocking={findings.some(f => chosen.has(f.id) && f.severity !== "minor")} onGo={() => onFix([...chosen])} />)}
    </div>
  )
}

// One severity at a time, or all: a chip each, with how many (none: it cannot be picked).
function SeverityChips({ findings, only, onPick }: { findings: Finding[]; only: Severity | null; onPick: (s: Severity | null) => void }) {
  const count = (s: Severity) => findings.filter(f => f.severity === s).length
  const chip = (isOn: boolean) => cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors duration-120 disabled:pointer-events-none disabled:opacity-40", isOn ? "bg-press text-text" : "text-text-muted hover:bg-hover hover:text-text")
  return (
    <div className="flex flex-wrap gap-1">
      <button className={chip(only === null)} aria-pressed={only === null} onClick={() => onPick(null)}>All <span className="tabular-nums">{findings.length}</span></button>
      {SEVERITIES.map(s => (
        <button key={s} className={chip(only === s)} aria-pressed={only === s} disabled={!count(s)} onClick={() => onPick(s)}>
          <i className={cn("size-2 rounded-full", SEVERITY[s].dot)} />{SEVERITY[s].name} <span className="tabular-nums">{count(s)}</span>
        </button>
      ))}
    </div>
  )
}

// With blockers or majors chosen it is the next step; with only minors, a quiet one beside staging.
const FixButton = ({ n, isBlocking, onGo }: { n: number; isBlocking: boolean; onGo: () => void }) => (
  <Button variant={isBlocking ? "default" : "outline"} className="mt-1 h-8 self-start gap-1.5 text-xs" onClick={onGo}>
    <Play size={13} className="fill-current" />Fix {n} with build
  </Button>
)

// ---------- staging and prod ----------

// The agent stage after a release, as its list's last row: the test in staging, the check in prod.
export const afterOf = (env: Stage, state: PipelineState): After => {
  const agent = env === "staging" ? "test" : "smoke"
  const title = env === "staging" ? "Test in staging" : "Check prod"
  if (state.stage !== agent) return { title, status: "pending" }
  const status = state.status === "running" ? "running" : state.status === "failed" || failed(state).length ? "failed" : state.status === "needs-info" || (state.results ?? []).some(r => r.status === "untested") ? "waiting" : "done"
  return { title, status }
}

// A release: its steps in order, the one at hand with its button (live: onStep acts on it).
export function ReleasePanel({ ticketKey, release, after, isPreview, onStep }: { ticketKey: string; release: Release; after: After; isPreview: boolean; onStep?: (step: string, action: "approve" | "skip", value?: string) => void }) {
  return <ReleaseSteps ticketKey={ticketKey} release={release} after={after} isPreview={isPreview} onAct={onStep} />
}

// What a test (in staging) or a check (in prod) found: a cell a criterion, then
// each one (what it did, and its evidence, at a glance). One the test could not
// try says why, and you check it by hand (it then passes, saying so). What an
// earlier pass tried and this one did not comes after, dimmed.
const RESULT_MARK = {
  pass: <Check size={13} strokeWidth={2.6} className="text-work" />,
  fail: <AlertTriangle size={13} className="text-bad" />,
  untested: <CircleHelp size={13} className="text-ask" />,
}
const CELL = { pass: "bg-work-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--work)_35%,transparent)]", fail: "bg-bad-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--bad)_50%,transparent)]", untested: "bg-ask-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ask)_45%,transparent)]" }
const rowId = (key: string, id: string) => `result-${key}-${id}`

function ResultRow({ result: r, ticketKey, canCheck, isCarried, turns }: { result: TestResult; ticketKey: string; canCheck: boolean; isCarried: boolean; turns?: Turn[] }) {
  const [isOpen, setOpen] = useState(r.status !== "pass" && !isCarried)
  return (
    <li id={rowId(ticketKey, r.id)} className={cn("scroll-mt-4 border-t border-line first:border-t-0", isCarried && "opacity-45")}>
      <div className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 py-2">
        <span className="translate-y-[2px]">{RESULT_MARK[r.status]}</span>
        <button className="text-left text-[13px] leading-[1.45]" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>{r.criterion}</button>
        <span className="flex items-center gap-2.5 text-xs text-faint">
          {r.status === "untested" && canCheck && (
            <button className="font-semibold text-text-muted hover:text-text" onClick={() => void act("/api/pipeline/checked", { key: ticketKey, ids: [r.id] }, "Checked by hand").then(ok => ok && changed())}>Checked by hand</button>
          )}
          <span className="font-mono text-[11.5px]">{r.id}</span>
        </span>
      </div>
      {isOpen && (
        <div className="ml-6 flex flex-col gap-2.5 pb-3">
          {r.summary && <p className="m-0 max-w-[72ch] text-[13px] leading-[1.55] text-text-muted">{r.summary}</p>}
          {r.evidence && <p className="m-0 font-mono text-[11.5px] leading-[1.55] break-words whitespace-pre-wrap text-text-muted">{r.evidence}</p>}
          {canCheck && r.status !== "pass" && <Ask ticketKey={ticketKey} about={`result:${r.id}`} turns={turns} />}
          <Evidence ticketKey={ticketKey} files={r.files ?? []} />
        </div>
      )}
    </li>
  )
}

const RESULT_ORDER: TestResult["status"][] = ["fail", "untested", "pass"]
export function TestPanel({ state, release }: { state: PipelineState; release: Release | null }) {
  const own = [...(state.results ?? [])].sort((a, b) => RESULT_ORDER.indexOf(a.status) - RESULT_ORDER.indexOf(b.status))
  const carried = carriedResults(state)
  const all = [...own, ...carried]
  const canCheck = state.status === "ready" && !isJob(state)
  return (
    <div className="flex flex-col gap-3">
      {all.length > 3 && (
        <div className="flex flex-wrap gap-[3px]">
          {all.map(r => <button key={r.id} title={`${r.id}: ${r.criterion}`} aria-label={`${r.id}, ${r.status}`} className={cn("size-[18px] rounded-[4px] transition-[filter] duration-100 hover:brightness-150", CELL[r.status])}
            onClick={() => document.getElementById(rowId(state.key, r.id))?.scrollIntoView({ block: "nearest", behavior: "smooth" })} />)}
        </div>
      )}
      {all.length > 0 && (
        <ol className="m-0 list-none p-0">
          {own.map(r => <ResultRow key={r.id} result={r} ticketKey={state.key} canCheck={canCheck} isCarried={false} turns={state.threads?.[`result:${r.id}`]} />)}
          {carried.map(r => <ResultRow key={r.id} result={r} ticketKey={state.key} canCheck={false} isCarried />)}
        </ol>
      )}
      {release && <Details label="The deploy"><ReleaseSteps ticketKey={state.key} release={release} after={afterOf(release.env, state)} /></Details>}
    </div>
  )
}
