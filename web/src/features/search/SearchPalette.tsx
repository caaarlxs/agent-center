// Search every conversation (⌘K, / or the search field), as the classic board
// and Claude desktop do it (search.js): a window over the board with the query,
// the tabs All / Sessions / Archived and what it finds: the title and a quote of
// where the words are, both marked. Empty, it lists the latest sessions.
// ↑↓ choose, ↵ opens the conversation (and goes to its card), ⌘↵ or ⌘-click
// opens it in Claude, Tab / ⇧Tab change the tab, Esc closes. No animation: it
// opens and closes many times a day.
import { Archive, MessageSquare, Search } from "lucide-react"
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Kbd } from "@/components/ui/kbd"
import { get } from "@/lib/api"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { focusCard } from "@/app/view-state"
import { launch } from "@/features/session/actions"
import { openedResult } from "@/features/session/SessionPanel"
import { StateIcon } from "@/features/session/StateIcon"
import { ago } from "@/features/session/state"
import { markedParts, plain, quoteOf, termsOf } from "./match"
import { Anim } from "@/components/icons/animated"

type Result = { id: string; title: string; repo: string | null; updatedAt: number; snippet: string; isArchived: boolean; isOnBoard?: boolean }

const TABS = [
  ["all", "All", () => true],
  ["sessions", "Sessions", (r: Result) => !r.isArchived],
  ["archived", "Archived", (r: Result) => r.isArchived],
] as const
type TabKey = (typeof TABS)[number][0]

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return <>{markedParts(text, terms).map((part, i) => (i % 2 ? <mark key={i} className="bg-transparent font-bold text-brand">{part}</mark> : <Fragment key={i}>{part}</Fragment>))}</>
}

function Palette({ onClose }: { onClose: () => void }) {
  const now = useNow()
  const cards = useLive(l => l.snapshot?.cards) ?? []
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[] | null>(null) // null: searching (or nothing typed)
  const [tab, setTab] = useState<TabKey>("all")
  const [index, setIndex] = useState(0)
  const field = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => field.current?.focus(), [])
  useEffect(() => {
    setIndex(0)
    if (!query.trim()) return setResults(null)
    let alive = true
    const timer = setTimeout(() => {
      get<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(query.trim())}`).then(r => alive && setResults(r.results), () => alive && setResults([]))
    }, 150)
    return () => ((alive = false), clearTimeout(timer))
  }, [query])

  const terms = termsOf(query)
  const byId = new Map(cards.map(c => [c.id, c]))
  // Nothing typed: the latest sessions, to jump to one.
  const recent: Result[] = [...cards].sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0)).slice(0, 8)
    .map(c => ({ id: c.id, title: c.title, repo: c.repo, updatedAt: c.lastActivity ?? c.updatedAt, isArchived: false, snippet: "" }))
  const all = query.trim() ? (results ?? []) : recent
  const counts = Object.fromEntries(TABS.map(([key, , keep]) => [key, all.filter(keep).length]))
  const rows = all.filter(TABS.find(([key]) => key === tab)![2])
  const chosen = rows[Math.min(index, rows.length - 1)]
  useEffect(() => list.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" }), [index, tab])

  const open = (r: Result | undefined, inClaude = false) => {
    if (!r) return
    onClose()
    if (inClaude) return void launch(r.id)
    if (!byId.has(r.id)) openedResult.set({ id: r.id, title: plain(r.title), repo: r.repo ?? null })
    openSession(r.id)
    focusCard(r.id)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setIndex(i => Math.min(i + 1, rows.length - 1)))
    else if (e.key === "ArrowUp") (e.preventDefault(), setIndex(i => Math.max(i - 1, 0)))
    else if (e.key === "Enter") (e.preventDefault(), open(chosen, e.metaKey || e.ctrlKey))
    else if (e.key === "Tab") {
      e.preventDefault()
      const i = TABS.findIndex(([key]) => key === tab)
      setTab(TABS[(i + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length][0])
      setIndex(0)
    } else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), onClose())
  }

  return createPortal(
    <div data-scrim className="fixed inset-0 z-[90] flex items-start justify-center bg-black/28 pt-[14vh]" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Search conversations" onKeyDown={onKey}
        className="flex max-h-[min(560px,72vh)] w-[min(680px,calc(100vw-32px))] flex-col overflow-hidden rounded-[14px] border border-line bg-raised shadow-pop">
        <div className="flex items-center gap-2.5 pt-3.5 pr-3.5 pb-2.5 pl-[18px] text-text-muted">
          <Search className="size-4 shrink-0" />
          <input ref={field} value={query} placeholder="Search every conversation…" spellCheck={false} aria-label="Search"
            className="min-w-0 flex-1 border-0 bg-transparent text-base text-text outline-none placeholder:text-faint" onChange={e => setQuery(e.target.value)} />
          <button className="inline-grid size-7 place-items-center rounded-[7px] text-text-muted hover:bg-press hover:text-text active:scale-[0.92]" title="Close (Esc)" onClick={onClose}><Anim.X size={15} /></button>
        </div>
        <div role="tablist" className="flex gap-1 border-b border-line px-3 pb-2.5">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => (setTab(key), setIndex(0), field.current?.focus())}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] text-text-muted", tab === key ? "bg-hover font-semibold text-text" : "hover:text-text")}>
              {label}{counts[key] > 0 && <span className="text-[11px] font-normal text-faint tabular-nums">{counts[key]}</span>}
            </button>
          ))}
        </div>
        <div ref={list} role="listbox" className="min-h-0 flex-1 overflow-auto p-1.5">
          {!query.trim() && <p className="mx-2.5 mt-1 mb-1.5 text-[11px] font-bold tracking-[0.05em] text-faint uppercase">Recent</p>}
          {query.trim() && results === null && <p className="mx-3 my-3.5 text-[13px] text-text-muted">Searching…</p>}
          {query.trim() && results !== null && !rows.length && <p className="mx-3 my-3.5 text-[13px] text-text-muted">Nothing found{tab !== "all" ? " in this tab" : ""}.</p>}
          {rows.map((r, i) => {
            const card = byId.get(r.id)
            return (
              <button key={r.id} role="option" aria-selected={r === chosen} onPointerMove={() => i !== index && setIndex(i)} onClick={e => open(r, e.metaKey || e.ctrlKey)}
                className={cn("flex h-[38px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-text", r === chosen && "bg-select")}>
                <span className="inline-flex w-[22px] shrink-0 justify-center text-text-muted">
                  {card ? <StateIcon card={card} size={20} /> : r.isArchived ? <Archive className="size-[15px]" /> : <MessageSquare className="size-[15px]" />}
                </span>
                <span className="max-w-[48%] shrink-0 truncate font-[550]"><Marked text={plain(r.title)} terms={terms} /></span>
                {r.snippet && <span className="min-w-0 flex-1 truncate text-[12.5px] text-faint">“<Marked text={quoteOf(r.snippet, terms)} terms={terms} />”</span>}
                {r.isArchived && <span className="shrink-0 rounded-md bg-hover px-1.5 py-px text-[11px] font-medium text-text-muted">archived</span>}
                <span className="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap text-faint">{r.updatedAt ? ago(r.updatedAt, now) : ""}</span>
              </button>
            )
          })}
        </div>
        <footer className="flex shrink-0 flex-wrap gap-3.5 border-t border-line px-3.5 py-2 text-[11.5px] text-faint [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> choose</span><span><Kbd>↵</Kbd> open</span><span><Kbd>⌘↵</Kbd> open in Claude</span>
          <span><Kbd>Tab</Kbd> tab</span><span><Kbd>Esc</Kbd> close</span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return open ? <Palette onClose={() => onOpenChange(false)} /> : null
}
