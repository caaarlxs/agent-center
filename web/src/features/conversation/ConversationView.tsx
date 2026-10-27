// A session's conversation, drawn with AI Elements: your messages, Claude's
// answers (Markdown), the tools it ran as one folded run, its task list, the
// questions it asked and the "next step" box with its reply buttons.
import { Check, CircleDot, Circle, FileText, ListTodo, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { sendText } from "@/features/session/actions"
import type { Shown } from "./items"
import { useConversation } from "./useConversation"

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
  const reply = (text: string) => sendText(sessionId, text).then(() => toast("Reply sent"), (err: Error) => toast.error(err.message))
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

function ShownItem({ item, sessionId }: { item: Shown; sessionId: string }) {
  switch (item.kind) {
    case "user":
      return <Message from="user"><MessageContent>{item.text}</MessageContent></Message>
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
      return (
        <div className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm">
          <p className="font-medium">{item.text}</p>
          <div className="flex flex-wrap gap-1.5">{item.options.map(o => <span key={o.label} className={cn("rounded-md border px-2 py-1 text-xs", item.answer === o.label && "border-emerald-400/50 text-emerald-300")}>{o.label}</span>)}</div>
        </div>
      )
    case "dialog":
      return <div className="rounded-xl border p-3 text-sm"><p className="font-medium">{item.label}</p>{item.detail && <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-muted-foreground">{item.detail}</p>}{item.answer && <p className="mt-2 text-xs text-emerald-300">{item.answer}</p>}</div>
    case "files":
      return <div className="flex flex-wrap gap-1.5">{item.paths.map(p => <span key={p} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"><FileText className="size-3" />{p.split("/").pop()}</span>)}</div>
    case "artifact":
      return item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-sky-400 underline">{item.path?.split("/").pop() ?? "Published page"}</a> : null
  }
}

export function ConversationView({ sessionId }: { sessionId: string }) {
  const { shown, isLoaded, error, hasMore, loadEarlier } = useConversation(sessionId)
  if (error) return <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>
  if (!isLoaded) return <div className="space-y-3 p-5"><Skeleton className="ml-auto h-10 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-16 w-4/5" /></div>
  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="gap-4">
        {hasMore && <Button variant="ghost" size="sm" className="self-center" onClick={loadEarlier}>Load earlier messages</Button>}
        {shown.map(item => <ShownItem key={item.key} item={item} sessionId={sessionId} />)}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
