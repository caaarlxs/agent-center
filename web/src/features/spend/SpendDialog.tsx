// Where it goes: what the account spent in the last hour, 5 hours (the
// plan's window), day, week or month (lib/spend.ts), at API prices: what kind of tokens it paid for, where
// the sessions ran, in which projects, with which models, and each session
// with its share, its context and what one more step of it costs. A session
// that re-reads too much each step is marked: starting it fresh saves most.
import { useEffect, useMemo, useState } from "react"
import type { SpendSummary } from "@server/spend"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { get } from "@/lib/api"
import { useLive } from "@/lib/live"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { isExpensive, money, tokens } from "./spend"

type Window = "1h" | "5h" | "24h" | "7d" | "30d"
const SPANS: [Window, string, string][] = [["1h", "Hour", "the last hour"], ["5h", "5 hours", "the last 5 hours"], ["24h", "Day", "the last 24 hours"], ["7d", "Week", "the last 7 days"], ["30d", "Month", "the last 30 days"]]
const KIND: { key: keyof SpendSummary["byKind"]; label: string; color: string; why: string }[] = [
  { key: "cacheRead", label: "Re-reading the conversation", color: "#3d8bfd", why: "Every step reads the whole conversation again, from the cache" },
  { key: "cacheWrite", label: "Saving it to the cache", color: "#a66cff", why: "What is new in the conversation, and all of it again when the cache expired" },
  { key: "output", label: "Claude writing", color: "var(--work)", why: "Answers, code and the tool calls Claude writes" },
  { key: "input", label: "Your new words", color: "var(--text-muted)", why: "What you write, outside the cache" },
]
const ORIGIN: Record<string, string> = { yours: "Your conversations", pipeline: "Pipeline", terminal: "Terminal", helpers: "Board helpers" }
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0)

export function SpendDialog({ onClose }: { onClose: () => void }) {
  const [win, setWin] = useState<Window>("5h")
  const [data, setData] = useState<Partial<Record<Window, SpendSummary>>>({})
  useEffect(() => {
    let alive = true
    void get<SpendSummary>(`/api/spend?window=${win}`).then(s => alive && setData(d => ({ ...d, [win]: s })), () => {})
    return () => void (alive = false)
  }, [win])
  const s = data[win]
  const tab = (w: Window, label: string) => (
    <button className={cn("h-7 rounded-[7px] px-3 text-[12.5px] font-medium", win === w ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-text-muted hover:text-text")} onClick={() => setWin(w)}>{label}</button>
  )
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex h-[min(760px,calc(100vh-48px))] w-[min(900px,calc(100vw-32px))] max-w-none flex-col gap-4 overflow-hidden">
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="text-base font-[650]">Where it goes</DialogTitle>
          <div className="inline-flex rounded-[9px] bg-side p-0.5">{SPANS.map(([w, label]) => <span key={w}>{tab(w, label)}</span>)}</div>
          {s && <span className="ml-auto text-[13px] text-text-muted" title="At Claude API prices: the plan does not say how it weighs each token, but the shares hold">
            <b className="text-text tabular-nums">{money(s.total)}</b> in {SPANS.find(([w]) => w === win)![2]}, at API prices
          </span>}
        </div>
        {!s ? <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-text-muted"><Spinner />Reading the conversations…</div> : <Body s={s} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ s }: { s: SpendSummary }) {
  const kinds = s.byKind
  const kindTotal = Object.values(kinds).reduce((a, b) => a + b, 0)
  const costly = s.sessions.filter(r => isExpensive(r.context))
  const costlyShare = pct(costly.reduce((t, r) => t + r.cost, 0), s.total)
  if (s.total <= 0) return <p className="m-0 py-10 text-center text-[13px] text-text-muted">Nothing spent in this window.</p>
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <section className="flex flex-col gap-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-side">
          {KIND.map(k => <i key={k.key} title={`${k.label}: ${pct(kinds[k.key], kindTotal)}%`} style={{ width: `${(kinds[k.key] / kindTotal) * 100}%`, background: k.color }} />)}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
          {KIND.map(k => (
            <span key={k.key} className="inline-flex items-center gap-1.5" title={k.why}>
              <i className="size-2 rounded-full" style={{ background: k.color }} />{k.label}
              <b className="font-semibold tabular-nums">{pct(kinds[k.key], kindTotal)}%</b>
              <span className="text-faint tabular-nums">{money(kinds[k.key])}</span>
            </span>
          ))}
        </div>
        {costly.length > 0 && (
          <p className="m-0 rounded-lg bg-ask-soft px-3 py-2 text-[12.5px] text-text">
            ⚠ <b>{costly.length === 1 ? "1 conversation" : `${costly.length} conversations`}</b> re-read over {tokens(400_000)} tokens each step: <b>{costlyShare}%</b> of what was spent. Starting them fresh (the button in each) saves most of it.
          </p>
        )}
      </section>
      <section className="grid grid-cols-3 gap-3 max-[760px]:grid-cols-1">
        <Shares title="Where they ran" rows={s.byOrigin.map(r => ({ ...r, label: ORIGIN[r.key] ?? r.key }))} total={s.total} />
        <Shares title="Projects" rows={s.byProject.map(r => ({ ...r, label: r.key }))} total={s.total} />
        <Shares title="Models" rows={s.byModel.map(r => ({ ...r, label: r.key.replace(/^claude-/, "") }))} total={s.total} />
      </section>
      <Sessions s={s} />
    </div>
  )
}

function Shares({ title, rows, total }: { title: string; rows: { key: string; label: string; cost: number }[]; total: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-3">
      <b className="text-[12px] font-semibold text-text-muted">{title}</b>
      {rows.slice(0, 5).map(r => (
        <div key={r.key} className="flex flex-col gap-0.5 text-[12.5px]">
          <div className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate">{r.label}</span><span className="text-faint tabular-nums">{money(r.cost)}</span><b className="w-9 text-right font-semibold tabular-nums">{pct(r.cost, total)}%</b></div>
          <span className="h-1 overflow-hidden rounded-full bg-side"><i className="block h-full rounded-full bg-brand" style={{ width: `${pct(r.cost, total)}%` }} /></span>
        </div>
      ))}
    </div>
  )
}

function Sessions({ s }: { s: SpendSummary }) {
  const cards = useLive(l => l.snapshot?.cards) // the cards themselves: a list made in the selector would be new each time
  const onBoard = useMemo(() => new Set(cards?.map(c => c.id) ?? []), [cards])
  return (
    <section className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_130px_60px_70px_80px] gap-3 border-b border-line px-2 pb-1.5 text-[11.5px] font-semibold text-faint">
        <span>Conversation</span><span>Share</span><span className="text-right" title="What it spent in this time">Spent</span><span className="text-right" title="The context it reads again at each step, now">Context now</span><span className="text-right" title="What one more step of it costs, now">Each step</span>
      </div>
      {s.sessions.map(r => {
        const costly = isExpensive(r.context)
        const canOpen = onBoard.has(r.id)
        return (
          <button key={r.id} disabled={!canOpen} onClick={() => openSession(r.id)} title={canOpen ? "Open it" : undefined}
            className="grid grid-cols-[minmax(0,1fr)_130px_60px_70px_80px] items-center gap-3 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover disabled:hover:bg-transparent">
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-text">{r.title}</span>
              <span className="truncate text-[11px] text-faint">{r.project} · {ORIGIN[r.origin] ?? r.origin} · {r.turns} steps in this time</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-side"><i className="block h-full rounded-full bg-brand" style={{ width: `${pct(r.cost, s.total)}%` }} /></span>
              <b className="w-8 text-right font-semibold tabular-nums">{pct(r.cost, s.total)}%</b>
            </span>
            <span className="text-right tabular-nums">{money(r.cost)}</span>
            <span className={cn("text-right tabular-nums", costly && "font-semibold text-ask")} title={costly ? "Each step re-reads this much: starting fresh costs a fraction" : undefined}>{costly && "⚠ "}{tokens(r.context)}</span>
            <span className={cn("text-right tabular-nums", costly && "text-ask")}>{money(r.stepCost)}</span>
          </button>
        )
      })}
    </section>
  )
}
