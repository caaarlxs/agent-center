// What each stage left, in its own shape (a stage's tab, and a job's dialog):
// the refinement's decisions; the plan's PRs, its scripts and its to-dos; the
// build's PRs; the review's findings; a release's steps; the test's criteria,
// each with its evidence. One line a thing, a hairline between them.
import { AlertTriangle, Check, CircleHelp, Database, FileText, GitPullRequestArrow, Hand, Play, Send, UserRound } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { repoDot } from "@/features/session/state"
import type { Asked, ChecklistItem, ContextImpact, Finding, PipelineState, Severity, Stage, TestResult, Turn, Unit } from "@server/pipeline"
import type { Release } from "@server/release"
import type { DebtEntry } from "@server/debt"
import { Ask } from "./Ask"
import { Evidence } from "./Evidence"
import { Details } from "./Fold"
import { ReleaseSteps, type After, type StepAction } from "./Release"
import { changed, useConfirm } from "./confirm"
import { act } from "./feedback"
import { Markdown } from "@/features/conversation/Markdown"
import { Section } from "./kinds"
import { carriedFindings, carriedResults, failed, isJob, summaryParts } from "./pipeline-board"
import { lastAnswers } from "./comment"
import { useStageData } from "./stage-data"
import { ConflictFix } from "./ConflictFix"

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
// What a stage did, in plain words: its first lines (a click shows it all); what it says
// is still pending, apart, in amber and always in view.
const LONG_SUMMARY = 420
export function Summary({ text }: { text: string }) {
  const { done, pending } = summaryParts(text)
  const [isOpen, setOpen] = useState(false)
  const isLong = done.length > LONG_SUMMARY
  return (
    <div className="flex flex-col gap-2.5">
      {done && (
        <div className="flex flex-col gap-1">
          <div className={cn(isLong && !isOpen && "max-h-[7.5em] overflow-hidden [mask-image:linear-gradient(to_bottom,black_50%,transparent)]")}>
            <Markdown className="max-w-[72ch] text-[13px]">{done}</Markdown>
          </div>
          {isLong && <button className="self-start text-xs font-semibold text-text-muted transition-colors duration-120 hover:text-text" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>{isOpen ? "Show less" : "Show all"}</button>}
        </div>
      )}
      {pending && <div className="rounded-[8px] bg-ask-soft px-3 py-2"><Markdown className="text-[13px]">{pending}</Markdown></div>}
    </div>
  )
}

// What GitHub says of a PR now: merged, closed, or open (a draft, with conflicts).
function PrState({ url }: { url: string }) {
  const pr = useStageData().prs[url]
  if (!pr) return null
  const [word, tone] = pr.state === "MERGED" ? ["merged", "text-work"] : pr.state === "CLOSED" ? ["closed", "text-faint"]
    : pr.isConflicting ? [pr.isDraft ? "draft · conflicts" : "conflicts", "text-bad"] : pr.isDraft ? ["draft", "text-ask"] : ["open", "text-text-muted"]
  return <span className={cn("text-[11.5px] font-semibold", tone)}>{word}</span>
}
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
const lastDecisions = (state: PipelineState) =>
  [...(state.history ?? [])].reverse().find(r => (r.stage ?? "refine") === "refine" && r.kept?.asked?.some(q => q.answer !== undefined))?.kept?.asked
export function RefinePanel({ state }: { state: PipelineState }) {
  const { comments } = useStageData()
  const asked = lastDecisions(state) ?? lastAnswers(comments)?.map(a => ({ ...a, proposal: "" }))
  const impact = state.contextImpact ?? []
  return (
    <div className="flex flex-col gap-5">
      {asked && <Section title="Decisions" extra={asked.length}><AskedList asked={asked} /></Section>}
      {impact.length > 0 && <Section title="Team context it changes" extra={impact.length}><Rows>{impact.map(c => <ImpactRow key={c.file + c.why} impact={c} />)}</Rows></Section>}
    </div>
  )
}

// A document of the team's context the ticket changes: which and why; a click shows what it says and what it would say.
function ImpactRow({ impact: c }: { impact: ContextImpact }) {
  const [isOpen, setOpen] = useState(false)
  return (
    <Row mark={<FileText size={13} />} end={<span className="font-mono text-[11.5px]">{c.file.split("/").pop()}</span>}>
      <button className="block w-full text-left hover:underline hover:decoration-line-strong hover:underline-offset-[3px]" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>{c.why}</button>
      {isOpen && (
        <span className="mt-1.5 flex flex-col gap-1.5 text-text-muted">
          {c.quote && <span className="line-through decoration-line-strong">{c.quote}</span>}
          {c.proposal && <span>{c.proposal}</span>}
        </span>
      )}
    </Row>
  )
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
        <Rows>
          {units.map((u, i) => {
            const after = u.dependsOn.map(d => units.findIndex(x => x.id === d) + 1).filter(n => n > 0)
            return (
              <Row key={u.id} mark={<span className="font-mono text-[11.5px]">{i + 1}</span>} end={subtasksOf(u) && <span className="font-mono text-[11.5px]">{subtasksOf(u)}</span>}>
                <Repo repo={u.repo} /> <span className="text-text-muted">{u.title}</span>{after.length > 0 && <span className="text-faint"> · after {after.join(", ")}</span>}
              </Row>
            )
          })}
        </Rows>
      </Section>
      {scripts.length > 0 && (
        <Section title="Scripts on the data" extra={scripts.length}>
          <Rows>
            {scripts.map(x => {
              const repo = units.find(u => u.id === x.unit)?.repo
              return (
                <Row key={x.id} mark={<Database size={13} />} end={repo && <Repo repo={repo} />}>
                  <span title={x.command}>{x.title}</span>
                  {(x.when || x.envs.length > 0) && <span className="block text-xs text-faint">{[x.when, x.envs.join(" → ")].filter(Boolean).join(" · ")}</span>}
                </Row>
              )
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
  const debt = useStageData().debt.filter(d => d.tickets.includes(state.key) && d.status === "open")
  return (
    <div className="flex flex-col gap-5">
    {state.fixing && <p className="m-0 text-[13px] text-text-muted">Fixes {state.fixing.ids.join(", ")}, from the {state.fixing.from}</p>}
    <Section title="Pull requests" extra={all.length}>
      <Rows>
        {all.map(unit => {
          const u = pass.get(unit.id) ?? unit
          return (
            <Row key={u.id} isDim={!pass.has(u.id)} mark={<GitPullRequestArrow size={13} />} end={
              <>
                {u.pr && <PrState url={u.pr} />}
                {u.pr && <PrLink url={u.pr} />}
                <UnitMark unit={u} warns={(state.checks ?? []).filter(c => c.status === "warn" && c.id.startsWith(`${u.id}-`)).map(c => c.label)} />
              </>}>
              <Repo repo={u.repo} /> <span className="text-text-muted">{u.title}</span>
              {u.pr && <span className="mt-1 block empty:hidden"><ConflictFix url={u.pr} /></span>}
            </Row>
          )
        })}
      </Rows>
    </Section>
    {debt.length > 0 && <DebtSeen debt={debt} />}
    </div>
  )
}

// The code debt the ticket's runs saw and left alone, the worst first: a few, then all on a click.
const DEBT_SHOWN = 5
function DebtSeen({ debt }: { debt: DebtEntry[] }) {
  const [isAll, setAll] = useState(false)
  const sorted = [...debt].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank)
  return (
    <Section title="Code debt it saw" extra={debt.length}>
      <Rows>
        {(isAll ? sorted : sorted.slice(0, DEBT_SHOWN)).map(d => (
          <Row key={d.key} mark={<i className={cn("inline-block size-2 rounded-full", SEVERITY[d.severity].dot)} />} end={<Repo repo={d.repo} />}>
            {d.note}<span className="block font-mono text-[11.5px] text-faint">{d.file}{d.line ? `:${d.line}` : ""}</span>
          </Row>
        ))}
      </Rows>
      {debt.length > DEBT_SHOWN && <button className="self-start text-xs font-semibold text-text-muted transition-colors duration-120 hover:text-text" onClick={() => setAll(v => !v)} aria-expanded={isAll}>{isAll ? "Show less" : `Show all ${debt.length}`}</button>}
    </Section>
  )
}

// Whether a PR's tests passed, and what the board's own checks of it warn about (on hover).
function UnitMark({ unit: u, warns }: { unit: Unit; warns: string[] }) {
  if (u.status === "failed") return <AlertTriangle size={13} className="text-bad" aria-label="Failed" />
  if (warns.length) return <AlertTriangle size={13} className="text-ask" aria-label={warns.join(" · ")}><title>{warns.join("\n")}</title></AlertTriangle>
  return u.status === "done" ? <Check size={13} strokeWidth={2.6} className="text-work" aria-label="Tests and checks passed" /> : null
}

// ---------- review ----------

// What the review found, the worst first: each says what fails and where (a
// click shows why and the fix); the ones a build fixed since, ticked.
const SEVERITY: Record<Severity, { rank: number; dot: string; name: string }> = {
  blocker: { rank: 0, dot: "bg-bad", name: "Blocker" }, major: { rank: 1, dot: "bg-ask", name: "Major" }, minor: { rank: 2, dot: "bg-line-strong", name: "Minor" },
}
const SEVERITIES: Severity[] = ["blocker", "major", "minor"]

// isGone: an earlier pass found it and this one did not: fixed since.
function FindingRow({ finding: f, unit, isFixed, isGone = false, isPublished = false, isChosen, onChoose, ask }: { finding: Finding; unit: Unit | undefined; isFixed: boolean; isGone?: boolean; isPublished?: boolean; isChosen: boolean | null; onChoose: () => void; ask?: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : ""
  return (
    <li className={cn("border-t border-line first:border-t-0", isGone && "opacity-45")}>
      <div className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 pt-2">
        {isFixed ? <Check size={12} className="text-work" /> : <i className={cn("size-2 translate-y-[-1px] rounded-full", SEVERITY[f.severity].dot)} aria-label={f.severity} />}
        <button className={cn("text-left text-[13px] leading-[1.45] font-semibold hover:underline hover:decoration-line-strong hover:underline-offset-[3px]", isFixed ? "text-text-muted" : "text-text")} onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>{f.title}</button>
        <span className="flex items-center gap-2.5 text-xs text-faint">
          {/* The build says it fixed it: only the next review confirms it. */}
          {isGone ? <span>fixed</span> : isFixed ? <span className="font-semibold text-ask">fixed · to confirm</span> : isPublished ? <span>published</span> : unit && <Repo repo={unit.repo} />}
          {isChosen !== null && <input type="checkbox" checked={isChosen} onChange={onChoose} aria-label={`Fix ${f.title}`} className="size-3.5 cursor-pointer accent-(--brand)" />}
        </span>
      </div>
      {/* For you, in view (two lines; a click shows it whole); the agent's own words (the file, the case, the fix) folded. */}
      {f.plain && <p className={cn("m-0 ml-6 max-w-[72ch] pt-0.5 text-[13px] leading-[1.55] text-text-muted", !isOpen && "line-clamp-2")}>{f.plain}</p>}
      <div className="pb-2" />
      {isOpen && (
        <div className="ml-6 flex flex-col gap-2 pb-3 text-[13px] leading-[1.55]">
          {f.plain ? <Details label="Technical detail"><Technical where={where} finding={f} /></Details> : <Technical where={where} finding={f} />}
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
  const gone = isJob(state) ? [] : carriedFindings(state)
  const [only, setOnly] = useState<Severity | null>(null)
  const fixed = new Set(state.fixed ?? [])
  const published = new Set((state as { published?: string[] }).published ?? [])
  const canChoose = state.stage === "review" && (state.status === "ready" || state.status === "needs-info") && (isJob(state) ? !!onPublish : state.status === "ready")
  const [chosen, choose] = useChosen(findings, published)
  if (!findings.length && !gone.length) return null
  return (
    <div className="flex flex-col gap-2">
      {findings.length > 0 && <SeverityChips findings={findings} only={only} onPick={setOnly} />}
      <ol className="m-0 list-none p-0">
        {findings.filter(f => !only || f.severity === only).map(f => <FindingRow key={f.id} finding={f} unit={state.units?.find(u => u.id === f.unit)} isFixed={fixed.has(f.id)} isPublished={published.has(f.id)} isChosen={canChoose && !published.has(f.id) ? chosen.has(f.id) : null} onChoose={() => choose(f.id)}
          ask={isJob(state) ? undefined : <Ask ticketKey={state.key} about={`finding:${f.id}`} turns={state.threads?.[`finding:${f.id}`]} />} />)}
        {!only && gone.map(f => <FindingRow key={`gone-${f.id}-${f.title}`} finding={f} unit={state.units?.find(u => u.id === f.unit)} isFixed isGone isChosen={null} onChoose={() => {}} />)}
      </ol>
      {canChoose && chosen.size > 0 && (onPublish ? <PublishButton n={chosen.size} onGo={() => onPublish([...chosen])} />
        : <FixButton n={chosen.size} isBlocking={findings.some(f => chosen.has(f.id) && f.severity !== "minor")} onGo={() => onFix([...chosen])} />)}
    </div>
  )
}

// What the build fixes: the blockers and majors come chosen, the minors not; what is published already, never.
function useChosen(findings: Finding[], published: Set<string>): [Set<string>, (id: string) => void] {
  const [picked, setPicked] = useState(() => new Set(findings.filter(f => f.severity !== "minor").map(f => f.id)))
  const toggle = (id: string) => setPicked(c => (c.has(id) ? new Set([...c].filter(x => x !== id)) : new Set([...c, id])))
  return [new Set([...picked].filter(id => !published.has(id))), toggle]
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
export function ReleasePanel({ ticketKey, release, after, isPreview, threads, onStep }: { ticketKey: string; release: Release; after: After; isPreview: boolean; threads?: Record<string, Turn[]>; onStep?: (step: string, action: StepAction, value?: string) => void }) {
  return <ReleaseSteps ticketKey={ticketKey} release={release} after={after} isPreview={isPreview} threads={threads} onAct={onStep} />
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
          {r.status === "pass" && r.evidence?.startsWith("Comprobado a mano") && <span className="inline-flex items-center gap-1"><Hand size={12} />by hand</span>}
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
      {release && <Details label={`Deploy · ${release.steps.filter(s => s.status === "done" || s.status === "skipped").length} of ${release.steps.length}`}><ReleaseSteps ticketKey={state.key} release={release} after={afterOf(release.env, state)} threads={isJob(state) ? undefined : (state.threads ?? {})} /></Details>}
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
      <TestData />
    </div>
  )
}

// The test data the test made in staging: the accounts it used and what it created.
function TestData() {
  const { scenario } = useStageData()
  if (!scenario?.pieces.length && !scenario?.accounts.length) return null
  return (
    <Details label="Test data">
      <Rows>
        {scenario.accounts.map(a => <Row key={a} mark={<UserRound size={13} />}>{a}</Row>)}
        {scenario.pieces.map(p => <Row key={p.id} mark={<Database size={13} />} end={<span className="font-mono text-[11.5px]">{p.model}</span>}>{p.name ?? p.id}</Row>)}
      </Rows>
    </Details>
  )
}
