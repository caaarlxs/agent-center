// The session's open tasks (the organizer's TASKS.md files): tick one to
// close it; it comes back with Undo.
import { Calendar } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { get, post } from "@/lib/api"
import { cn } from "@/lib/utils"

type Task = { file: string; line: number; text: string; priority: "high" | "med" | "low" | null; due: string | null; project: string }

const PRIORITY = { high: "text-rose-400", med: "text-amber-400", low: "text-muted-foreground" }

export function Tasks({ id }: { id: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const read = useCallback(() => get<{ tasks: Task[] }>(`/api/sessions/${encodeURIComponent(id)}/tasks`).then(r => setTasks(r.tasks), (err: Error) => toast.error(err.message)), [id])
  useEffect(() => void read(), [read])
  const close = async (t: Task) => {
    const task = { file: t.file, line: t.line, text: t.text }
    await post("/api/tasks/close", task).catch((err: Error) => toast.error(err.message))
    read()
    toast("Task closed", { action: { label: "Undo", onClick: () => void post("/api/tasks/reopen", task).then(read) } })
  }
  if (!tasks) return <p className="p-6 text-sm text-muted-foreground">Reading the tasks…</p>
  if (!tasks.length) return <p className="p-6 text-sm text-muted-foreground">No open task for this session.</p>
  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-auto p-3">
      {tasks.map(t => (
        <li key={`${t.file}:${t.line}`} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent/50">
          <Checkbox className="mt-0.5" onCheckedChange={() => close(t)} aria-label="Close the task" />
          <div className="min-w-0 flex-1 text-sm">
            <p className={cn(t.priority && PRIORITY[t.priority])}>{t.text}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">{t.project}{t.due && <span className="inline-flex items-center gap-1"><Calendar className="size-3" />{t.due}</span>}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
