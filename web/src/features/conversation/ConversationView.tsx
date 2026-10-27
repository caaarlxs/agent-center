// A session's conversation, drawn with AI Elements: your messages (with the
// files you sent), Claude's answers (Markdown), the tools it ran as one folded
// run, its task list, the questions it asked (answered here while it waits),
// the "next step" box with its reply buttons, the approval it asks for, and
// your messages it has not received yet, each with Undo.
import { ArrowUpRight, Check, CircleDot, Circle, FileText, ListTodo, Wrench } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"
import type { Bridge, Card, Permission } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { fileName, sentFiles } from "@/features/prompt/files"
import { answer, permit } from "@/features/session/actions"
import type { Shown } from "./items"
import { type Pending, deliveredOf, dropPending, stampOf, takenBack, usePending, waitingOf } from "./pending"
import { sendMessage, takeBack } from "./send"
import { useConversation } from "./useConversation"

const openInClaude = (id: string) => post(`/api/sessions/${encodeURIComponent(id)}/open`).catch((err: Error) => toast.error(err.message))
const PASTE_RE = /<pasted[_-]?content\b[^>]*>([\s\S]*?)(?:<\/pasted[_-]?content>|$)/gi

// What you typed, pasted blocks folded away; the files you sent as pictures
// and named files, without the line that names them for Claude.
function UserText({ text: raw }: { text: string }) {
  const { text, images, files } = sentFiles(raw)
  const parts: ({ typed: string } | { pasted: string })[] = []
  let last = 0
  for (const m of text.matchAll(PASTE_RE)) {
    if (m.index > last) parts.push({ typed: text.slice(last, m.index) })
    parts.push({ pasted: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ typed: text.slice(last) })
  return (
    <div className="space-y-2 whitespace-pre-wrap">
      {parts.map((p, i) => "typed" in p
        ? p.typed.trim() && <span key={i}>{p.typed.trim()}</span>
        : <details key={i} className="text-xs"><summary className="cursor-pointer text-muted-foreground">Pasted text · {p.pasted.split("\n").length} lines</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap">{p.pasted}</pre></details>)}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(rel => <a key={rel} href={`/api/uploads/${rel}`} target="_blank" rel="noreferrer"><img src={`/api/uploads/${rel}`} alt={fileName(rel)} loading="lazy" className="max-h-40 rounded-md" /></a>)}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map(rel => <a key={rel} href={`/api/uploads/${rel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border bg-background/40 px-2 py-1 text-xs"><FileText className="size-3" />{fileName(rel)}</a>)}
        </div>
      )}
    </div>
  )
}

function AnswerInClaude({ sessionId }: { sessionId: string }) {
  return <Button size="sm" variant="outline" onClick={() => openInClaude(sessionId)}>Answer in Claude<ArrowUpRight /></Button>
}

type QuestionItem = Extract<Shown, { kind: "question" }>
// A question with options. While the session waits for it (`canAnswer`), a
// click answers (several, then Send, when it takes several), or your own text.
function Question({ item, sessionId, canAnswer, picked, onPick }: { item: QuestionItem; sessionId: string; canAnswer: boolean; picked?: string; onPick: (text: string, value: string) => void }) {
  const [several, setSeveral] = useState<string[]>([])
  const [own, setOwn] = useState("")
  const shown = item.answer ?? picked ?? null
  const isOpen = canAnswer && !item.answer
  const chosen = isOpen && item.isMulti ? several : (shown ?? "").split(",").map(a => a.trim())
  const labels = item.options.map(o => o.label)
  // The app always adds a free "Other": an answer outside the options is that.
  const free = shown && !labels.some(l => shown.includes(l)) ? shown : null
  const choose = (label: string) => {
    if (!isOpen) return
    if (item.isMulti) setSeveral(list => (list.includes(label) ? list.filter(l => l !== label) : [...list, label]))
    else onPick(item.text, label)
  }
  const sendSeveral = () => onPick(item.text, [...several, ...(own.trim() ? [own.trim()] : [])].join(", "))
  const hint = (o: QuestionItem["options"][number]) => (o.description && o.description.trim().toLowerCase() !== o.label.trim().toLowerCase() ? o.description : null)
  return (
    <div className={cn("space-y-2 rounded-xl border p-3 text-sm", isOpen ? "border-amber-400/40 bg-amber-400/5" : "bg-card/50")}>
      <p className="font-medium">{item.text}</p>
      <div className="space-y-1">
        {item.options.map(o => {
          const isChosen = chosen.includes(o.label)
          return (
            <button key={o.label} disabled={!isOpen} onClick={() => choose(o.label)}
              className={cn("flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left disabled:cursor-default", isOpen && "hover:bg-accent", isChosen && "border-emerald-400/50 bg-emerald-400/5")}>
              <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center border", item.isMulti ? "rounded" : "rounded-full", isChosen && "border-emerald-400 bg-emerald-400 text-black")}>{isChosen && <Check className="size-3" />}</span>
              <span><b className="font-medium">{o.label}</b>{hint(o) && <span className="block text-xs text-muted-foreground">{hint(o)}</span>}</span>
            </button>
          )
        })}
        {free && <p className="rounded-lg border border-emerald-400/50 px-3 py-2">{free}</p>}
      </div>
      {isOpen ? (
        <form className="flex gap-2" onSubmit={e => (e.preventDefault(), item.isMulti ? sendSeveral() : own.trim() && onPick(item.text, own.trim()))}>
          <Input value={own} onChange={e => setOwn(e.target.value)} placeholder="Another answer…" className="h-8" />
          <Button size="sm" disabled={item.isMulti ? !several.length && !own.trim() : !own.trim()}>Send</Button>
        </form>
      ) : !shown && <AnswerInClaude sessionId={sessionId} />}
    </div>
  )
}

// The tool approval Claude asks for now.
function PermissionCard({ sessionId, permission }: { sessionId: string; permission: Permission }) {
  const { command, file_path, url, description } = permission.input as Record<string, string | undefined>
  const what = command ?? file_path ?? url
  const decide = (d: "allow" | "deny") => permit(sessionId, permission.id, d).then(() => toast(d === "allow" ? "Allowed" : "Denied"), (err: Error) => toast.error(err.message))
  return (
    <div className="space-y-2 rounded-xl border border-rose-400/40 bg-rose-400/5 p-3 text-sm">
      <p className="font-medium">Allow Claude to use {permission.tool}?</p>
      {description && <p className="text-muted-foreground">{description}</p>}
      {what && <pre className="max-h-40 overflow-auto rounded bg-black/30 p-2 font-mono text-xs whitespace-pre-wrap">{what}</pre>}
      <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => decide("deny")}>Deny</Button><Button size="sm" onClick={() => decide("allow")}>Allow</Button></div>
    </div>
  )
}

function PendingMessage({ p, sessionId, bridge, isWorking }: { p: Pending; sessionId: string; bridge: Bridge | null; isWorking: boolean }) {
  const stamp = stampOf(p, bridge, isWorking)
  return (
    <Message from="user" className="opacity-70">
      <MessageContent><UserText text={p.text} /></MessageContent>
      <div className={cn("flex items-center justify-end gap-2 text-xs", stamp.isBad ? "text-rose-300" : "text-muted-foreground")}>
        {stamp.text}
        {stamp.isBad && <button className="underline-offset-2 hover:underline" onClick={() => openInClaude(sessionId)}>Open in Claude</button>}
        <button className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => takeBack(sessionId, p)}>Undo</button>
      </div>
    </Message>
  )
}

function Tools({ lines }: { lines: string[] }) {
  return (
    <Task defaultOpen={false}>
      <TaskTrigger title={lines.length === 1 ? lines[0] : `${lines.length} actions · ${lines.at(-1)}`} />
      <TaskContent>
        {lines.map((l, i) => <TaskItem key={i} className="font-mono text-xs"><Wrench className="mr-1.5 inline size-3" />{l}</TaskItem>)}
      </TaskContent>
    </Task>
  )
}

function Plan({ steps }: { steps: Extract<Shown, { kind: "plan" }>["steps"] }) {
  const done = steps.filter(s => s.status === "completed").length
  return (
    <div className="rounded-xl border bg-card/50 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><ListTodo className="size-3.5" />Plan<span className="ml-auto tabular-nums">{done}/{steps.length}</span></div>
      <ul className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className={cn("flex items-start gap-2", s.status === "completed" && "text-muted-foreground line-through")}>
            {s.status === "completed" ? <Check className="mt-0.5 size-3.5 text-emerald-400" /> : s.status === "in_progress" ? <CircleDot className="mt-0.5 size-3.5 text-amber-400" /> : <Circle className="mt-0.5 size-3.5 text-muted-foreground" />}
            {s.content}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Next({ item, sessionId }: { item: Extract<Shown, { kind: "next" }>; sessionId: string }) {
  const reply = (text: string) => sendMessage(sessionId, text, "Reply sent").catch((err: Error) => toast.error(err.message))
  return (
    <div className="space-y-2 rounded-xl border bg-card/50 p-3 text-sm">
      {item.recap && <p className="text-muted-foreground">{item.recap}</p>}
      {item.ask && <p className="font-medium">{item.ask}</p>}
      {item.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.actions.map((a, i) => (
            <Button key={a.label} size="sm" variant={item.picked === a.label ? "secondary" : i === 0 && !item.picked ? "default" : "outline"}
              disabled={!!item.picked} onClick={() => reply(a.message || a.label)}>{item.picked === a.label && <Check />}{a.label}</Button>
          ))}
        </div>
      )}
    </div>
  )
}

type Asked = { canAnswer: (text: string) => boolean; picks: Record<string, string>; onPick: (text: string, value: string) => void }

function ShownItem({ item, sessionId, asked }: { item: Shown; sessionId: string; asked: Asked }) {
  switch (item.kind) {
    case "user":
      return <Message from="user"><MessageContent><UserText text={item.text} /></MessageContent></Message>
    case "assistant":
      return <Message from="assistant"><MessageContent><MessageResponse>{item.text}</MessageResponse></MessageContent></Message>
    case "tools":
      return <Tools lines={item.lines} />
    case "plan":
      return <Plan steps={item.steps} />
    case "next":
      return <Next item={item} sessionId={sessionId} />
    case "chapter":
      return <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground"><span className="h-px flex-1 bg-border" />{item.title}<span className="h-px flex-1 bg-border" /></div>
    case "question":
      return <Question item={item} sessionId={sessionId} canAnswer={asked.canAnswer(item.text)} picked={asked.picks[item.text]} onPick={asked.onPick} />
    case "dialog":
      return (
        <div className="space-y-2 rounded-xl border p-3 text-sm">
          <p className="font-medium">{item.label}</p>
          {item.detail && <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">{item.detail}</p>}
          {item.answer ? <p className="text-xs text-emerald-300">{item.answer}</p> : <AnswerInClaude sessionId={sessionId} />}
        </div>
      )
    case "files":
      return <div className="flex flex-wrap gap-1.5">{item.paths.map(p => <span key={p} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"><FileText className="size-3" />{p.split("/").pop()}</span>)}</div>
    case "artifact":
      return item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-sky-400 underline">{item.path?.split("/").pop() ?? "Published page"}</a> : null
  }
}

export function ConversationView({ sessionId, card, bridge }: { sessionId: string; card: Card | undefined; bridge: Bridge | null }) {
  const { shown, isLoaded, error, hasMore, loadEarlier, refresh } = useConversation(sessionId)
  const mine = usePending(sessionId)
  const gone = takenBack.use()
  const waiting = useMemo(() => waitingOf(mine, bridge?.queued ?? [], gone), [mine, bridge?.queued, gone])

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
      await answer(sessionId, question.id, next).then(() => toast("Answer sent"), (err: Error) => (setPicks(picks), toast.error(err.message)))
    },
  }

  // The question it asks now, before the transcript has it. The approval
  // comes from the card: the board decides there whether it still waits.
  const inTranscript = new Set(shown.flatMap(i => (i.kind === "question" ? [i.text] : [])))
  const live: QuestionItem[] = (question?.questions ?? []).filter(q => !inTranscript.has(q.question))
    .map(q => ({ key: `${question!.id}-${q.question}`, kind: "question", text: q.question, options: q.options, isMulti: !!q.multiSelect, answer: null }))
  const permission = card?.askKind === "permission" ? (card.bridge?.permission ?? null) : null

  if (error) return <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>
  if (!isLoaded) return <div className="space-y-3 p-5"><Skeleton className="ml-auto h-10 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-16 w-4/5" /></div>
  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="gap-4">
        {hasMore && <Button variant="ghost" size="sm" className="self-center" onClick={loadEarlier}>Load earlier messages</Button>}
        {shown.map(item => <ShownItem key={item.key} item={item} sessionId={sessionId} asked={asked} />)}
        {waiting.map(p => <PendingMessage key={p.id} p={p} sessionId={sessionId} bridge={bridge} isWorking={card?.column === "working"} />)}
        {live.map(q => <Question key={q.key} item={q} sessionId={sessionId} canAnswer picked={picks[q.text]} onPick={asked.onPick} />)}
        {permission && <PermissionCard key={permission.id} sessionId={sessionId} permission={permission} />}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
