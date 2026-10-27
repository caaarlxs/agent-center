// The panel of one session, over the canvas: its state, repo and branch on
// one row with its buttons, its title under them, its views in a row, and the
// view. Changes, Code and Files are workspaces: the panel takes the whole
// width. Esc goes back to the conversation from a workspace, then closes.
import { ArrowUpRight, GitBranch, X } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { post } from "@/lib/api"
import { useLive } from "@/lib/live"
import { cn } from "@/lib/utils"
import { type Tab, WORKSPACES, openSession, showTab } from "@/app/open-session"
import { Changes } from "@/features/changes/Changes"
import { CodeWorkspace } from "@/features/code/CodeWorkspace"
import { Files } from "@/features/files/Files"
import { Chat } from "@/features/conversation/Chat"
import { Prs } from "@/features/prs/Prs"
import { Tasks } from "@/features/tasks/Tasks"
import { StateIcon, TONE } from "./StateIcon"
import { STATE_LABEL, repoDot, stateOf } from "./state"

const TABS: [Tab, string][] = [["chat", "Conversation"], ["changes", "Changes"], ["code", "Code"], ["files", "Files"], ["prs", "PRs"], ["tasks", "Tasks"]]

export function SessionPanel({ id, tab }: { id: string; tab: Tab }) {
  const card = useLive(l => l.snapshot?.cards.find(c => c.id === id))
  const isWorkspace = WORKSPACES.has(tab)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (isWorkspace) showTab("chat")
      else openSession(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isWorkspace])
  const openInClaude = () => post(`/api/sessions/${encodeURIComponent(id)}/open`).catch((err: Error) => toast.error(err.message))
  const state = card ? stateOf(card) : null
  const counts: Partial<Record<Tab, number>> = { prs: card?.prs?.length ?? 0, tasks: card?.taskCount ?? 0 }
  return (
    <aside aria-label="Session"
      className={cn("flex h-full flex-col border-l bg-card shadow-2xl transition-[width] duration-300 ease-out", isWorkspace ? "w-[calc(100vw-var(--side-w,0px))]" : "w-[min(680px,46vw)] min-w-[420px]")}>
      <header className="flex flex-col gap-1.5 border-b px-5 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {card && state && <><StateIcon card={card} size={18} /><span className={TONE[state].split(" ")[0]}>{STATE_LABEL[state]}</span></>}
          {card && <span className="inline-flex items-center gap-1.5"><i className="size-[7px] rounded-[2px]" style={{ background: repoDot(card.repo) }} />{card.repo}</span>}
          {card?.branch && <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono"><GitBranch className="size-3 shrink-0" />{card.branch}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <Button size="sm" className="bg-orange-500 text-white hover:bg-orange-500/90" onClick={openInClaude}>Open in Claude<ArrowUpRight /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => openSession(null)} aria-label="Close"><X /></Button>
          </span>
        </div>
        <h2 className="line-clamp-2 text-base font-semibold leading-snug">{card?.title ?? "Conversation"}</h2>
        <Tabs value={tab} onValueChange={v => showTab(v as Tab)} className="-mb-px">
          <TabsList variant="line" className="h-9">
            {TABS.map(([key, label]) => (
              <TabsTrigger key={key} value={key}>{label}{(counts[key] ?? 0) > 0 && <span className="text-muted-foreground">{counts[key]}</span>}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>
      {tab === "chat" && <Chat key={id} id={id} card={card} />}
      {tab === "changes" && <Changes key={id} id={id} />}
      {tab === "prs" && <Prs key={id} id={id} />}
      {tab === "tasks" && <Tasks key={id} id={id} />}
      {tab === "code" && <CodeWorkspace key={id} id={id} />}
      {tab === "files" && <Files key={id} id={id} />}
    </aside>
  )
}
