// A session's conversation, as the classic board draws it (conversation.js):
// your messages (long ones fold, pasted text folds away, sent files as pictures
// and chips, the time and a Fork link under each), Claude's answers in
// Markdown, the tool runs folded, its task list, the "next step" box, the
// questions it asks (answered here while it waits), the app's own dialogs,
// the files and pages it sent, the tasks it suggests for a session of their
// own (started from here), what still runs in the background, the reply
// choices it offers, the approval it asks for, and your messages it has not
// received yet, each with Undo. A "New messages" pill shows when more arrives
// while you read further up.
import { ArrowDown, ChevronDown, ChevronRight, FileText, GitFork, ListChecks, Terminal, Bot, Wrench } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { get, post } from "@/lib/api"
import type { Bridge, Card, Permission, Snapshot, SuggestionState } from "@/lib/api-types"
import { bytesText, clock, memText, MEMORY_WARN } from "@/lib/format"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { openSession, showFile } from "@/app/open-session"
import { fileName, sentFiles } from "@/features/prompt/files"
import { ago } from "@/features/session/state"
import { answer, launch, permit } from "@/features/session/actions"
import { ForkDialog } from "./ForkDialog"
import type { Shown, SuggestionItem } from "./items"
import { Markdown, SessionOf } from "./Markdown"
import { useLiveAnswer } from "./session-events"
import { useTypewriter } from "./typewriter"
import { type Pending, deliveredOf, dropPending, stampOf, takenBack, usePending, waitingOf } from "./pending"
import { reply, takeBack } from "./send"
import { dialogAnswer, extOf, familyOf, linesText, nameOf, partsOf, type Family } from "./text"
import { type Suggestions, useConversation } from "./useConversation"
import { Anim } from "@/components/icons/animated"

const linkBtn = "text-brand underline underline-offset-2"
// The "?" disc before a question (.next-ask span).
const Disc = () => <span className="inline-flex size-[17px] shrink-0 translate-y-0.5 items-center justify-center rounded-full bg-ask text-[11px] font-extrabold text-surface">?</span>
const card = "rounded-xl border border-line bg-side px-[13px] py-[11px]"

// What you typed, pasted blocks folded away and a long text clamped to 12
// lines; the files you sent as pictures and named files, without the line
// that names them for Claude.
function Bubble({ text: raw, isPending }: { text: string; isPending?: boolean }) {
  const { text, images, files } = sentFiles(raw)
  const { parts, isLong } = partsOf(text)
  const [isOpen, setOpen] = useState(false)
  return (
    <div className={cn("rounded-[14px_14px_4px_14px] border border-[color-mix(in_srgb,var(--brand)_18%,transparent)] bg-brand-soft px-3 py-2 text-[13.5px] [overflow-wrap:anywhere] whitespace-pre-wrap",
      isPending && "border-dashed opacity-65")}>
      {parts.map((p, i) =>
        "typed" in p ? (
          <span key={i} className={cn(isLong && !isOpen && "line-clamp-12")}>{p.typed.trim()}</span>
        ) : (
          <details key={i} className="group/paste my-1.5 rounded-lg border border-[color-mix(in_srgb,var(--brand)_22%,transparent)] bg-surface whitespace-normal">
            <summary className="cursor-pointer list-none px-[9px] py-[5px] text-xs font-semibold text-text-muted">
              <span className="text-faint">{"▸ "}</span>Pasted text · {linesText(p.pasted.split("\n").length)}
            </summary>
            <pre className="m-0 max-h-80 overflow-auto border-t border-line px-2.5 py-2 font-mono text-[11.5px]/[1.5] whitespace-pre-wrap">{p.pasted}</pre>
          </details>
        ),
      )}
      {isLong && <button className="mt-1 block text-xs font-semibold text-brand" onClick={() => setOpen(o => !o)}>{isOpen ? "Show less" : "Show all"}</button>}
      {images.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {images.map(rel => (
            <a key={rel} href={`/api/uploads/${rel}`} target="_blank" rel="noreferrer" title="Open the image">
              <img src={`/api/uploads/${rel}`} alt="" loading="lazy" className="block max-h-40 max-w-[220px] rounded-lg border border-line" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {files.map(rel => (
            <a key={rel} href={`/api/uploads/${rel}`} target="_blank" rel="noreferrer" title="Open the file" className={chip}>
              <FileText className="size-3.5 shrink-0 text-text-muted" /><span className="truncate">{fileName(rel)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

const chip = "inline-flex h-[30px] max-w-[260px] items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-text no-underline hover:border-line-strong"
const FAMILY_TONE: Record<Family, string> = {
  sheet: "bg-[rgb(22_163_74/0.16)] text-work",
  doc: "bg-[color-mix(in_srgb,var(--review)_18%,transparent)] text-review",
  slides: "bg-run-soft text-run",
  pdf: "bg-bad-soft text-bad",
  media: "bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-brand",
  code: "bg-hover text-text-muted",
}
// A file type's label, tinted by its family (files.js ExtTag).
export function ExtTag({ ext }: { ext: string }) {
  return <span className={cn("inline-flex h-[18px] min-w-[26px] shrink-0 items-center justify-center rounded px-1 font-mono text-[9.5px] font-semibold uppercase", FAMILY_TONE[familyOf(ext)])}>{ext || "file"}</span>
}

// A file Claude showed you: its type, name and size ("gone" when it is no
// longer there); a click opens it in the Files tab.
function FileChip({ sessionId, path }: { sessionId: string; path: string }) {
  const [info, setInfo] = useState<{ path?: string; size?: number; error?: string } | null>(null)
  useEffect(() => void get<{ path: string; size: number }>(`/api/sessions/${encodeURIComponent(sessionId)}/fileinfo?path=${encodeURIComponent(path)}`).then(setInfo, (err: Error) => setInfo({ error: err.message })), [sessionId, path])
  return (
    <button className={chip} onClick={() => showFile(path)} title={info?.path ?? path}>
      <ExtTag ext={extOf(path)} /><span className="truncate">{nameOf(path)}</span>
      {info?.size != null ? <small className="shrink-0 text-[11px] text-faint tabular-nums">{bytesText(info.size)}</small> : info?.error && <small className="shrink-0 text-[11px] text-faint">gone</small>}
    </button>
  )
}

function YourMessage({ item, onFork }: { item: Extract<Shown, { kind: "user" }>; onFork: () => void }) {
  return (
    <div className="group/msg flex max-w-[88%] flex-col items-end gap-[3px] self-end">
      <Bubble text={item.text} />
      <span className="flex items-center justify-end gap-2 text-[11px] text-faint">
        <button className={cn(linkBtn, "inline-flex items-center gap-1 text-[11.5px] no-underline opacity-0 transition-opacity duration-[120ms] group-hover/msg:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100")}
          onClick={onFork} title="New session with the conversation up to just before this message; the original does not change">
          <GitFork className="size-3" />Fork
        </button>
        {item.at && <span title={item.isMidTurn ? "You wrote it while Claude was working" : undefined}>{item.isMidTurn ? "during the turn · " : ""}{clock(Date.parse(item.at))}</span>}
      </span>
    </div>
  )
}

function Tools({ lines }: { lines: string[] }) {
  const [isOpen, setOpen] = useState(false)
  return (
    <div className="text-xs text-text-muted">
      <button className="-ml-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-[3px] text-text-muted hover:bg-hover hover:text-text" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}>
        {isOpen ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Wrench className="size-3 shrink-0" />
        <span className="shrink-0 font-[550]">{lines.length === 1 ? "1 action" : `${lines.length} actions`}</span>
        {!isOpen && <span className="min-w-0 truncate font-mono text-[11.5px] text-faint">{lines.at(-1)}</span>}
      </button>
      {isOpen && (
        <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-line pl-[18px]">
          {lines.map((l, i) => <li key={i} title={l} className="truncate font-mono text-[11.5px] text-text-muted">{l}</li>)}
        </ul>
      )}
    </div>
  )
}

function Plan({ steps }: { steps: Extract<Shown, { kind: "plan" }>["steps"] }) {
  const done = steps.filter(s => s.status === "completed").length
  return (
    <div className="rounded-xl border border-line bg-surface px-[13px] py-2.5">
      <div className="mb-1.5 flex items-center gap-[7px] text-xs font-[650] text-text-muted"><ListChecks className="size-[13px]" />Plan<span className="ml-auto font-medium tabular-nums">{done}/{steps.length}</span></div>
      <ul className="flex flex-col gap-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-[9px] text-[13px]">
            <i className={cn("mt-0.5 size-3.5 shrink-0 rounded-full",
              s.status === "completed" ? "bg-work shadow-[inset_0_0_0_3.5px_var(--surface)]"
                : s.status === "in_progress" ? "animate-spin border-2 border-brand border-r-transparent [animation-duration:1s]"
                : "border-[1.5px] border-dashed border-line-strong")} />
            <span className={cn(s.status === "completed" && "text-text-muted")}>{s.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// What only Claude desktop can answer: why, and the button that opens it there.
function AnswerInApp({ sessionId, why }: { sessionId: string; why: string }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
      <span className="text-xs text-text-muted">{why}</span>
      <Button onClick={() => launch(sessionId)}>Answer in Claude <Anim.ArrowUpRight size={13} /></Button>
    </div>
  )
}

type QuestionItem = Extract<Shown, { kind: "question" }>
// A question with options. While the session waits for it (`canAnswer`), a
// click answers (several, then Send, when it takes several), or your own text.
function Question({ item, sessionId, canAnswer: isAnswerable, picked, onPick }: { item: QuestionItem; sessionId: string; canAnswer: boolean; picked?: string; onPick: (text: string, value: string) => void }) {
  const [several, setSeveral] = useState<string[]>([])
  const [own, setOwn] = useState("")
  const shown = item.answer ?? picked ?? null
  const canAnswer = isAnswerable && !item.answer
  const chosen = canAnswer && item.isMulti ? several : (shown ?? "").split(",").map(a => a.trim())
  const labels = item.options.map(o => o.label)
  // The app always adds a free "Other": an answer outside the options is that.
  const free = shown && !labels.some(l => shown.includes(l)) ? shown : null
  const choose = (label: string) => {
    if (!canAnswer) return
    if (item.isMulti) setSeveral(list => (list.includes(label) ? list.filter(l => l !== label) : [...list, label]))
    else onPick(item.text, label)
  }
  const hint = (o: QuestionItem["options"][number]) => (o.description && o.description.trim().toLowerCase() !== o.label.trim().toLowerCase() ? o.description : null)
  const option = (isChosen: boolean) =>
    cn("flex items-start gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-[7px]",
      isChosen && "border-[color-mix(in_srgb,var(--brand)_60%,transparent)] bg-brand-soft",
      canAnswer && "cursor-pointer transition-[border-color,background-color,transform] duration-[120ms] ease-(--ease-out) active:scale-[0.99]",
      canAnswer && !isChosen && "hover:border-line-strong hover:bg-hover",
      shown && !canAnswer && !isChosen && "opacity-55")
  const mark = (isChosen: boolean) =>
    cn("mt-0.5 size-3.5 shrink-0 border-[1.5px] border-line-strong", item.isMulti ? "rounded" : "rounded-full", isChosen && "border-brand bg-brand shadow-[inset_0_0_0_2.5px_var(--surface)]")
  return (
    <div className={cn(card, "w-[min(520px,100%)] self-start")}>
      <p className="m-0 flex items-baseline gap-2 font-semibold"><Disc />{item.text}</p>
      {item.isMulti && canAnswer && <p className="mt-0.5 ml-[25px] text-xs text-faint">You can pick several</p>}
      {item.options.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1" role={canAnswer ? (item.isMulti ? "group" : "radiogroup") : undefined}>
          {item.options.map(o => {
            const isChosen = chosen.includes(o.label)
            return (
              <li key={o.label} className={option(isChosen)} role={canAnswer ? (item.isMulti ? "checkbox" : "radio") : undefined} aria-checked={canAnswer ? isChosen : undefined}
                tabIndex={canAnswer ? 0 : undefined} onClick={() => choose(o.label)}
                onKeyDown={e => canAnswer && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), choose(o.label))}>
                <i className={mark(isChosen)} />
                <div><b className="block text-[13px] leading-[1.35] font-semibold">{o.label}</b>{hint(o) && <small className="mt-px block text-xs text-text-muted">{hint(o)}</small>}</div>
              </li>
            )
          })}
          {free && <li className={option(true)}><i className={mark(true)} /><div><b className="block text-[13px] font-semibold">{free}</b><small className="block text-xs text-text-muted">Your own answer</small></div></li>}
        </ul>
      )}
      {canAnswer ? (
        <form className="mt-2 flex gap-1.5" onSubmit={e => (e.preventDefault(), own.trim() && !item.isMulti && onPick(item.text, own.trim()))}>
          <input className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] focus:outline-none"
            placeholder="Another answer…" value={own} onChange={e => setOwn(e.target.value)} />
          {item.isMulti
            ? <Button type="button" disabled={!several.length && !own.trim()} onClick={() => onPick(item.text, [...several, ...(own.trim() ? [own.trim()] : [])].join(", "))}>Send</Button>
            : <Button variant="outline" disabled={!own.trim()}>Send</Button>}
        </form>
      ) : !shown && <AnswerInApp sessionId={sessionId} why="You can answer this question only in Claude desktop." />}
    </div>
  )
}

// A dialog of the desktop app (the plan to approve, a branch to pick…).
function AppDialog({ item, sessionId }: { item: Extract<Shown, { kind: "dialog" }>; sessionId: string }) {
  return (
    <div className={cn(card, "w-[min(520px,100%)] self-start")}>
      <p className="m-0 flex items-baseline gap-2 font-semibold"><Disc />{item.label}</p>
      {item.detail && (item.isLong ? (
        <details className="my-1.5 rounded-lg border border-[color-mix(in_srgb,var(--brand)_22%,transparent)] bg-surface">
          <summary className="cursor-pointer list-none px-[9px] py-[5px] text-xs font-semibold text-text-muted"><span className="text-faint">{"▸ "}</span>Show the plan</summary>
          <Markdown className="max-h-[360px] overflow-auto border-t border-line px-2.5 py-2 text-[12.5px]">{item.detail}</Markdown>
        </details>
      ) : <p className="mt-2 text-xs text-text-muted">{item.detail}</p>)}
      {item.answer ? <p className="mt-2 text-[13px]"><b>Your answer:</b> {dialogAnswer(item.answer)}</p>
        : <AnswerInApp sessionId={sessionId} why="You can answer this only in Claude desktop." />}
    </div>
  )
}

// A task Claude suggests for a session of its own (spawn_task), as the chip
// in Claude desktop: Start opens "New session" with its prompt and folder (in
// a new worktree), Dismiss puts it away. `state`: what became of it, here or
// in the app.
function Suggestion({ item, sessionId, state, onDismiss }: { item: SuggestionItem; sessionId: string; state?: SuggestionState; onDismiss: (taskId: string) => void }) {
  const repo = item.folder?.split("/").pop()
  const start = () => openDialog({ kind: "new", draft: { root: item.folder, prompt: item.prompt, worktree: true, suggestion: { from: sessionId, taskId: item.taskId } } })
  return (
    <div className={cn(card, "w-[min(520px,100%)] self-start", (state || item.isGone) && "opacity-75")}>
      <p className="m-0 flex items-center gap-1.5 text-[11.5px] text-faint"><GitFork className="size-3" />Suggested task{repo && <> · in <b className="font-semibold text-text-muted">{repo}</b></>}</p>
      <p className="mt-1 text-[13.5px] font-semibold">{item.title}</p>
      {item.tldr && <p className="mt-1 text-[12.5px]/[1.45] text-text-muted">{item.tldr}</p>}
      <details className="group/prompt my-1.5 rounded-lg border border-[color-mix(in_srgb,var(--brand)_22%,transparent)] bg-surface">
        <summary className="cursor-pointer list-none px-[9px] py-[5px] text-xs font-semibold text-text-muted">
          <span className="text-faint group-open/prompt:hidden">{"▸ "}</span><span className="hidden text-faint group-open/prompt:inline">{"▾ "}</span>Prompt
        </summary>
        <pre className="m-0 max-h-80 overflow-auto border-t border-line px-2.5 py-2 font-mono text-[11.5px]/[1.5] whitespace-pre-wrap">{item.prompt}</pre>
      </details>
      <div className="mt-2 flex items-center gap-2">
        {item.isGone && !state ? <span className="text-xs text-text-muted">Claude took this suggestion back</span>
          : state?.state === "started" ? (
            <>
              <span className="text-xs font-semibold text-work">Started</span>
              {state.session && <Button variant="ghost" onClick={() => openSession(state.session!)}>Open the session</Button>}
            </>
          ) : (
            <>
              {state?.state === "dismissed" && <span className="text-xs text-text-muted">Dismissed</span>}
              <span className="flex-1" />
              {!state && item.taskId && <Button variant="ghost" onClick={() => onDismiss(item.taskId!)}>Dismiss</Button>}
              <Button onClick={start} disabled={!item.folder}
                title={item.folder ? `A new session in a new worktree of ${item.folder}, with this prompt: you can change it before it starts` : "The session's folder is unknown"}>
                {state ? "Start anyway" : "Start"}…
              </Button>
            </>
          )}
      </div>
    </div>
  )
}

// The tool approval Claude asks for now.
function PermissionCard({ sessionId, permission }: { sessionId: string; permission: Permission }) {
  const { command, file_path, url, description } = permission.input as Record<string, string | undefined>
  const what = command ?? file_path ?? url
  const decide = (d: "allow" | "deny") => permit(sessionId, permission.id, d).then(() => toast(d === "allow" ? "Allowed" : "Denied"), (err: Error) => toast(err.message))
  return (
    <div className={cn(card, "w-[min(520px,100%)] self-start")}>
      <p className="m-0 flex items-baseline gap-2 font-semibold"><Disc />Allow Claude to use {permission.tool}?</p>
      {description && <p className="mt-2 text-xs text-text-muted">{description}</p>}
      {what && <pre className="mt-2 max-h-[180px] overflow-auto rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-xs/[1.5] [overflow-wrap:anywhere] whitespace-pre-wrap">{what}</pre>}
      <div className="mt-2.5 flex justify-end gap-2"><Button variant="outline" onClick={() => decide("deny")}>Deny</Button><Button onClick={() => decide("allow")}>Allow</Button></div>
    </div>
  )
}

function PendingMessage({ p, sessionId, bridge, isWorking }: { p: Pending; sessionId: string; bridge: Bridge | null; isWorking: boolean }) {
  const stamp = stampOf(p, bridge, isWorking)
  return (
    <div className="flex max-w-[88%] flex-col items-end gap-[3px] self-end">
      <Bubble text={p.text} isPending />
      <span className={cn("text-[11px]", stamp.isBad ? "text-bad" : "text-faint")}>
        {stamp.text} ·{" "}
        {stamp.isBad && !stamp.text.startsWith("Could not") && <><button className={linkBtn} onClick={() => launch(sessionId)} title="Opens the session in Claude desktop; when you write in it, it starts and gets the message">Open in Claude</button> · </>}
        <button className={linkBtn} onClick={() => takeBack(sessionId, p)} title="Remove the message before it arrives and put it back in the field">Undo</button>
      </span>
    </div>
  )
}

const BG_LABEL: Record<string, string> = { shell: "in the background", subagent: "subagent", monitor: "monitor", workflow: "workflow", current: "in progress" }
type LiveCard = Snapshot["cards"][number]
type Task = NonNullable<LiveCard["background"]>[number]
type Proc = NonNullable<LiveCard["memory"]>["items"][number]
const taskTitle = (t: Task) => t.description || t.command || BG_LABEL[t.type] || t.type || "task"
const flat = (text: unknown) => String(text ?? "").replace(/['"]/g, "").replace(/\s+/g, " ").trim()

// "Running now" (components.js BackgroundBox): the background tasks and what
// each takes in memory, then what else the session started that still takes
// memory, each with Stop.
function RunningNow({ sessionId }: { sessionId: string }) {
  const live = useLive(l => l.snapshot?.cards.find(c => c.id === sessionId))
  const now = useNow()
  if (!live) return null
  const tasks = live.background ?? []
  const items = (live.memory?.items ?? []).filter(i => i.kind !== "session")
  const used = new Set<number>()
  const processOf = (t: Task) => {
    const k = flat(t.command)
    const found = k ? items.find(i => !used.has(i.pid) && flat(i.command).includes(k)) : undefined
    if (found) used.add(found.pid)
    return found
  }
  const rows = tasks.map(t => ({ task: t, proc: processOf(t) }))
  const others = items.filter(i => !used.has(i.pid) && i.bytes >= 20 * 1024 ** 2)
  if (!rows.length && !others.length) return null
  const stopAt = (i: Proc) => post(`/api/sessions/${encodeURIComponent(sessionId)}/stopprocess`, { pid: i.pid }).then(() => toast(`Stopping ${i.label}…`), (err: Error) => toast(err.message || "Could not stop it"))
  const memCell = (i: Proc | undefined) => {
    if (!i) return null
    const idle = i.idleSince && now - i.idleSince > 5 * 60_000 ? `idle ${ago(i.idleSince, now)}` : ""
    return (
      <>
        {idle && <span className={cn("shrink-0 text-[11px] text-faint", i.isForgotten && "text-run")} title={i.isForgotten ? "Up for hours and unused for a while: likely forgotten" : "No CPU used lately"}>{idle}</span>}
        <span className={cn("shrink-0 text-[11.5px] text-text-muted tabular-nums", i.bytes >= MEMORY_WARN && "font-semibold text-run")}>{memText(i.bytes)}</span>
        <button className={cn(linkBtn, "shrink-0 text-[11.5px]")} title={`Stop it (and what it started)${i.cwd ? `: ${i.cwd}` : ""}`} onClick={() => stopAt(i)}>Stop</button>
      </>
    )
  }
  const row = "flex min-w-0 items-center gap-2 text-[12.5px] text-text"
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-[10px] border border-line bg-side px-2.5 py-2">
      <div className="flex items-center gap-2 text-[11.5px] font-bold tracking-[0.05em] text-text-muted uppercase">
        <i className="run-dot size-2 rounded-full bg-run" />Running now<span className="font-medium text-faint">{rows.length + others.length}</span>
        {(live.memory?.total ?? 0) >= MEMORY_WARN && <span className="ml-auto font-semibold tracking-normal text-run normal-case" title="Memory this session and what it started take on this Mac">{memText(live.memory!.total)} in memory</span>}
      </div>
      {rows.map(({ task: t, proc }) => (
        <div key={t.id} className={row} title={[t.command ?? t.description ?? "", proc?.cwd].filter(Boolean).join("\n")}>
          {t.type === "subagent" ? <Bot className="size-[13px] shrink-0 text-work" /> : <Terminal className="size-[13px] shrink-0 text-work" />}
          <span className={cn("min-w-0 flex-1 truncate", t.type === "shell" && !t.description && "font-mono text-xs")}>{taskTitle(t)}</span>
          <span className="max-w-[40%] shrink-0 truncate text-[11px] text-faint">{BG_LABEL[t.type] ?? t.type}</span>
          <span className="shrink-0 text-[11px] text-faint">{ago(t.since, now)}</span>
          {memCell(proc)}
        </div>
      ))}
      {others.map(i => (
        <div key={i.pid} className={row} title={[i.command, i.cwd].filter(Boolean).join("\n")}>
          {i.kind === "mcp" ? <Wrench className="size-[13px] shrink-0 text-work" /> : <Terminal className="size-[13px] shrink-0 text-work" />}
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{i.label}</span>
          <span className="max-w-[40%] shrink-0 truncate text-[11px] text-faint">{[i.kind === "mcp" ? "MCP server" : i.cwd?.split("/").slice(-2).join("/"), i.isDetached && "left running"].filter(Boolean).join(" · ")}</span>
          <span className="shrink-0 text-[11px] text-faint">{ago(i.since, now)}</span>
          {memCell(i)}
        </div>
      ))}
    </div>
  )
}

const ANSWER_RECEIPT_MS = 12_000 // an answer the session has not taken by then did not reach it

type Asked = { canAnswer: (text: string) => boolean; picks: Record<string, string>; onPick: (text: string, value: string) => void }
type Suggested = { states: Suggestions; onDismiss: (taskId: string) => void }

function ShownItem({ item, sessionId, asked, suggested, onFork }: { item: Shown; sessionId: string; asked: Asked; suggested: Suggested; onFork: (item: Extract<Shown, { kind: "user" }>) => void }) {
  switch (item.kind) {
    case "user":
      return <YourMessage item={item} onFork={() => onFork(item)} />
    case "assistant":
      return <Markdown>{item.text}</Markdown>
    case "tools":
      return <Tools lines={item.lines} />
    case "plan":
      return <Plan steps={item.steps} />
    case "next":
      return (
        <div className={card}>
          {item.recap && <Markdown className="text-[13px] text-text-muted">{item.recap}</Markdown>}
          {item.ask && <p className={cn("m-0 flex items-baseline gap-2 font-semibold", item.recap && "mt-2")}><Disc />{item.ask}</p>}
          {item.picked && <p className="mt-1.5 ml-[25px] text-[13px] text-text-muted"><span className="text-faint">↳ </span>{item.picked}</p>}
        </div>
      )
    case "chapter":
      return (
        <div className="my-1.5 flex items-center gap-2.5 text-[11.5px] font-[650] tracking-[0.04em] text-faint uppercase">
          <span className="h-px flex-1 bg-line" />{item.title}<span className="h-px flex-1 bg-line" />
        </div>
      )
    case "question":
      return <Question item={item} sessionId={sessionId} canAnswer={asked.canAnswer(item.text)} picked={asked.picks[item.text]} onPick={asked.onPick} />
    case "dialog":
      return <AppDialog item={item} sessionId={sessionId} />
    case "suggestion":
      return <Suggestion item={item} sessionId={sessionId} state={item.taskId ? suggested.states[item.taskId] : undefined} onDismiss={suggested.onDismiss} />
    case "files":
      return (
        <div className="flex flex-col gap-1">
          {item.caption && <p className="m-0 text-[12.5px] text-text-muted">{item.caption}</p>}
          <div className="flex flex-wrap gap-1.5">{item.paths.map(p => <FileChip key={p} sessionId={sessionId} path={p} />)}</div>
        </div>
      )
    case "artifact":
      return (
        <div className="flex max-w-[520px] items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2.5">
          <FileText className="size-4 shrink-0 text-brand" />
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-[13px]">{item.path ? nameOf(item.path).replace(/\.[^.]+$/, "") : "Artifact"}</b>
            <small className="text-[11.5px] text-faint">{item.url ? "Published on claude.ai" : "Published"}</small>
          </div>
          {item.path && <Button variant="ghost" onClick={() => showFile(item.path!)}>View file</Button>}
          {item.url && <Button variant="outline" asChild><a href={item.url} target="_blank" rel="noreferrer">Open <Anim.ArrowUpRight size={12} /></a></Button>}
        </div>
      )
  }
}

export function ConversationView({ sessionId, card: session, bridge }: { sessionId: string; card: Card | undefined; bridge: Bridge | null }) {
  const { shown, suggestions, markDismissed, isLoaded, error, hasMore, loadEarlier, refresh } = useConversation(sessionId)
  // The answer being written now (mod v10), until the transcript has it,
  // its letters appearing one after another.
  const writing = useTypewriter(useLiveAnswer(sessionId, shown.length))
  const mine = usePending(sessionId)
  const gone = takenBack.use()
  const waiting = useMemo(() => waitingOf(mine, bridge?.queued ?? [], gone), [mine, bridge?.queued, gone])
  const [forking, setForking] = useState<Extract<Shown, { kind: "user" }> | null>(null)

  // A message sent from here shows as pending until the transcript has it.
  const userTexts = useMemo(() => shown.flatMap(i => (i.kind === "user" ? [i.text] : [])), [shown])
  const seenUsers = useRef(0)
  useEffect(() => {
    if (!isLoaded) return
    const delivered = deliveredOf(mine, userTexts.slice(seenUsers.current))
    seenUsers.current = userTexts.length
    if (delivered.length) dropPending(sessionId, delivered)
  }, [isLoaded, userTexts, mine, sessionId])

  // Answers to the question the session asks gather here until each of its
  // questions has one, then go together (one question: at the first click).
  const question = bridge?.question ?? null
  const [picks, setPicks] = useState<Record<string, string>>({})
  const lastQuestion = useRef<string | null>(null)
  useEffect(() => {
    if (question) {
      if (question.id !== lastQuestion.current) setPicks({})
      lastQuestion.current = question.id
      return
    }
    if (!lastQuestion.current) return
    // Answered, here or in the app: the answer lands on items already shown.
    lastQuestion.current = null
    const timer = setTimeout(refresh, 1500)
    return () => clearTimeout(timer)
  }, [question, refresh])
  const asked: Asked = {
    canAnswer: text => !!question?.questions.some(q => q.question === text),
    picks,
    onPick: async (text, value) => {
      const next = { ...picks, [text]: value }
      setPicks(next)
      if (!question || !question.questions.every(q => next[q.question])) return
      const ok = await answer(sessionId, question.id, next).then(() => (toast("Answer sent"), true), (err: Error) => (setPicks(picks), toast(err.message || "Could not answer"), false))
      if (!ok) return
      // The session takes it within seconds (its mod clears the question);
      // still waiting after that, it did not reach it.
      const asked = question.id
      setTimeout(() => {
        if (lastQuestion.current !== asked) return
        setPicks({})
        toast("The answer did not reach the session: answer it in Claude")
      }, ANSWER_RECEIPT_MS)
    },
  }

  const suggested: Suggested = {
    states: suggestions,
    onDismiss: taskId => {
      markDismissed(taskId)
      post(`/api/sessions/${encodeURIComponent(sessionId)}/suggestion`, { taskId }).catch((err: Error) => toast(err.message || "Could not dismiss it"))
    },
  }

  // The question it asks now, before the transcript has it. The approval
  // comes from the card: the board decides there whether it still waits.
  const inTranscript = new Set(shown.flatMap(i => (i.kind === "question" ? [i.text] : [])))
  const live: QuestionItem[] = (question?.questions ?? []).filter(q => !inTranscript.has(q.question))
    .map(q => ({ key: `${question!.id}-${q.question}`, kind: "question", text: q.question, options: q.options, isMulti: !!q.multiSelect, answer: null }))
  const permission = session?.askKind === "permission" ? (session.bridge?.permission ?? null) : null
  const choices = session?.column === "asking" && !waiting.length ? (session.choices ?? []) : []

  // Follows the bottom while you are there; what arrives while you read
  // further up raises "New messages".
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [hasNew, setHasNew] = useState(false)
  const lastKey = shown.at(-1)?.key
  const prevLast = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    if (stick.current) el.scrollTop = el.scrollHeight
    else if (prevLast.current && lastKey !== prevLast.current) setHasNew(true)
    prevLast.current = lastKey
  }, [lastKey, shown, waiting.length, isLoaded, writing])
  const onScroll = () => {
    const el = box.current!
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (stick.current) setHasNew(false)
  }
  // Earlier messages go on top; what you were reading stays in place.
  const earlier = async () => {
    const el = box.current!
    const before = el.scrollHeight
    await loadEarlier()
    requestAnimationFrame(() => (el.scrollTop += el.scrollHeight - before))
  }
  const toBottom = () => {
    stick.current = true
    setHasNew(false)
    box.current!.scrollTop = box.current!.scrollHeight
  }

  return (
    <SessionOf.Provider value={sessionId}>
      <div ref={box} onScroll={onScroll} className="relative flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-[18px] pb-3 max-[860px]:px-3.5 max-[860px]:pt-3.5 max-[860px]:pb-2.5">
        {!isLoaded && !error && (
          <div className="flex flex-col gap-3">
            <i className="skeleton block h-[52px] rounded-[9px]" /><i className="skeleton block h-9 w-[70%] self-end rounded-[9px]" /><i className="skeleton block h-[52px] rounded-[9px]" />
          </div>
        )}
        {error && <p className="text-center text-text-muted">{error}</p>}
        {hasMore && <Button variant="ghost" className="self-center" onClick={earlier}>Load earlier messages</Button>}
        {shown.map(item => <ShownItem key={item.key} item={item} sessionId={sessionId} asked={asked} suggested={suggested} onFork={setForking} />)}
        {writing && <Markdown isStreaming>{writing}</Markdown>}
        {choices.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {choices.map((c, i) => (
              <button key={i} title={c.message} onClick={() => reply(sessionId, c.message || c.label)}
                className={cn("h-[26px] rounded-[13px] border px-2.5 text-xs font-semibold transition-[transform,background-color,filter] duration-[120ms] ease-(--ease-out) active:scale-[0.96]",
                  i === 0 ? "border-ask bg-ask text-surface hover:brightness-108" : "border-[color-mix(in_srgb,var(--ask)_45%,transparent)] bg-ask-soft text-ask hover:bg-[color-mix(in_srgb,var(--ask)_22%,transparent)]")}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {waiting.map(p => <PendingMessage key={p.id} p={p} sessionId={sessionId} bridge={bridge} isWorking={session?.column === "working"} />)}
        {live.map(q => <Question key={q.key} item={q} sessionId={sessionId} canAnswer picked={picks[q.text]} onPick={asked.onPick} />)}
        {permission && <PermissionCard key={permission.id} sessionId={sessionId} permission={permission} />}
        <RunningNow sessionId={sessionId} />
        {hasNew && (
          <button onClick={toBottom} className="sticky bottom-1 inline-flex h-7 shrink-0 items-center gap-1.5 self-center rounded-[14px] bg-text px-3 text-xs font-semibold text-bg shadow-pop">
            <ArrowDown className="size-[13px]" />New messages
          </button>
        )}
      </div>
      {forking && <ForkDialog sessionId={sessionId} item={forking} onClose={() => setForking(null)} />}
    </SessionOf.Provider>
  )
}
