// The "Tasks" tab (tasks.js): the organizer's tasks created in this
// conversation, to tick off (with Undo, also Z) or add to. They reload with
// each live update.
import { Check } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { get, post } from "@/lib/api"
import { useLive } from "@/lib/live"
import { undoable } from "@/lib/toast"
import { cn } from "@/lib/utils"

type Task = { file: string; line: number; text: string; priority: "high" | "med" | "low" | null; due: string | null; project: string }

export function Tasks({ id }: { id: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [draft, setDraft] = useState("")
  const signal = useLive(l => l.snapshot)
  const read = useCallback(() => get<{ tasks: Task[] }>(`/api/sessions/${encodeURIComponent(id)}/tasks`).then(r => setTasks(r.tasks), () => setTasks(t => t ?? [])), [id])
  useEffect(() => void read(), [read, signal])
  const close = async (t: Task) => {
    const task = { file: t.file, line: t.line, text: t.text }
    setTasks(ts => ts?.filter(x => x !== t) ?? null)
    try {
      await post("/api/tasks/close", task)
    } catch (err) {
      toast((err as Error).message || "Could not close the task")
      return void read()
    }
    undoable(`Task done: ${t.text}`, () => void post("/api/tasks/reopen", task).then(read, read))
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft("")
    await post("/api/tasks/add", { text, session: id }).catch((err: Error) => toast(err.message || "Could not add the task"))
    read()
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
      <p className="m-0 text-xs text-text-muted">Tasks from your organizer created in this conversation.</p>
      {!tasks && <div className="flex flex-col gap-3"><i className="skeleton block h-[52px] rounded-[9px]" /><i className="skeleton block h-9 rounded-[9px]" /></div>}
      {tasks?.length === 0 && <p className="m-0 py-3 text-center text-text-muted">This conversation has no open tasks.</p>}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {tasks?.map(t => (
          <li key={`${t.file}:${t.line}`} className="grid grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-0.5 rounded-lg p-2 hover:bg-hover">
            <button title="Mark as done" onClick={() => close(t)}
              className="mt-px inline-flex size-[17px] items-center justify-center rounded-[5px] border-[1.5px] border-line-strong text-transparent transition-colors duration-[120ms] hover:border-work hover:bg-work-soft hover:text-work">
              <Check className="size-[11px]" strokeWidth={3} />
            </button>
            <span className={cn(t.priority === "high" && "font-semibold text-bad")}>{t.text}</span>
            <span className="col-start-2 text-[11.5px] text-text-muted">{[t.project, t.due && `@${t.due}`].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <input className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-[7px] text-[13.5px] focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] focus:outline-none"
          placeholder="New task, Enter to save" value={draft} onChange={e => setDraft(e.target.value)} />
      </form>
    </div>
  )
}
