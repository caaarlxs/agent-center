// Search every conversation (⌘K or /): the server's search (titles first,
// then what was said), as Claude desktop's palette. Empty, it lists the
// latest sessions. ↵ opens the conversation and goes to its card.
import { Archive, MessageSquare } from "lucide-react"
import { useEffect, useState } from "react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { get } from "@/lib/api"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { openSession } from "@/app/open-session"
import { openedResult } from "@/features/session/SessionPanel"
import { focusCard } from "@/app/view-state"
import { StateIcon } from "@/features/session/StateIcon"
import { ago } from "@/features/session/state"

type Result = { id: string; title: string; repo: string | null; updatedAt: number; snippet: string; isArchived: boolean; isOnBoard: boolean }

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const now = useNow()
  const cards = useLive(l => l.snapshot?.cards) ?? []
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[] | null>(null)
  useEffect(() => {
    if (!query.trim()) return setResults(null)
    let alive = true
    const timer = setTimeout(() => {
      get<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(query.trim())}`).then(r => alive && setResults(r.results), () => alive && setResults([]))
    }, 150)
    return () => ((alive = false), clearTimeout(timer))
  }, [query])
  useEffect(() => void (open || setQuery("")), [open])

  const go = (id: string) => {
    const r = shown.find(x => x.id === id)
    if (r && !byId.has(id)) openedResult.set({ id, title: r.title, repo: r.repo ?? null })
    onOpenChange(false)
    openSession(id)
    focusCard(id)
  }
  const byId = new Map(cards.map(c => [c.id, c]))
  const recent = [...cards].sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0)).slice(0, 8)
  const shown = results ?? recent.map(c => ({ id: c.id, title: c.title, repo: c.repo, updatedAt: c.lastActivity ?? c.updatedAt, snippet: "", isArchived: false, isOnBoard: true }))
  const groups: [string, Result[]][] = results
    ? [["Sessions", shown.filter(r => !r.isArchived)], ["Archived", shown.filter(r => r.isArchived)]]
    : [["Recent", shown]]

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search every conversation" className="sm:max-w-2xl">
      <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search every conversation…" />
      <CommandList className="max-h-[60vh]">
        {query.trim() && results === null ? <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p> : <CommandEmpty>Nothing found.</CommandEmpty>}
        {groups.filter(([, list]) => list.length).map(([heading, list]) => (
          <CommandGroup key={heading} heading={heading}>
            {list.map(r => {
              const card = byId.get(r.id)
              return (
                <CommandItem key={r.id} value={r.id} onSelect={() => go(r.id)} className="items-start gap-3 py-2">
                  <span className="mt-0.5">{card ? <StateIcon card={card} size={18} /> : r.isArchived ? <Archive className="size-4" /> : <MessageSquare className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    {r.snippet && <span className="line-clamp-1 text-xs text-muted-foreground">“{r.snippet.replace(/^…|…$/g, "")}”</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.repo && `${r.repo} · `}{r.updatedAt ? ago(r.updatedAt, now) : ""}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
