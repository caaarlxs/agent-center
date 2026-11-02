// The "Trace" tab (lib/trace.ts): a turn of the session on one timeline. On
// top, the turn you look at (the last, or one you pick), how long it took,
// its model calls, tools, errors and tokens, and its slowest step. Below, a
// bar per step where it sat in time: Claude (the model), a tool, a subagent,
// a wait for you; the failed in red, the one still running pulsing. A click
// on a step shows what it ran. Asked again every few seconds while it runs.
import { Bot, Clock, Hand, Sparkles, Wrench } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { get } from "@/lib/api"
import { useLive } from "@/lib/live"
import { cn } from "@/lib/utils"
import { clock } from "@/lib/format"
import type { Span, SpanKind, Turn, TurnSummary } from "@server/trace"

const KIND: Record<SpanKind, { label: string; bar: string; icon: ReactNode }> = {
  model: { label: "Claude", bar: "bg-brand", icon: <Sparkles className="size-3.5" /> },
  tool: { label: "Tool", bar: "bg-work", icon: <Wrench className="size-3.5" /> },
  agent: { label: "Subagent", bar: "bg-[#8b5cf6]", icon: <Bot className="size-3.5" /> },
  wait: { label: "Waiting for you", bar: "bg-ask", icon: <Hand className="size-3.5" /> },
}
const FOLLOW_MS = 4000

export const duration = (ms: number) => {
  const s = ms / 1000
  if (s < 1) return `${Math.round(ms)}ms`
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${Math.round(s % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}
// An axis tick: "0", "30s", "2m", "1h".
export const tickLabel = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s === 0 ? "0" : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}` : `${Math.floor(s / 3600)}h${s % 3600 ? ` ${Math.round((s % 3600) / 60)}m` : ""}`
}
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// A model as people say it: "claude-opus-5-5" → "Opus 5.5".
export const modelName = (id: string) => {
  const [family, ...version] = id.replace(/^claude-/, "").replace(/\[.*\]$/, "").replace(/-\d{8}$/, "").split("-")
  return `${family!.charAt(0).toUpperCase()}${family!.slice(1)}${version.length ? ` ${version.join(".")}` : ""}`
}

// Ticks for the axis: a round step that gives four to six of them.
export function ticksOf(totalMs: number): number[] {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map(s => s * 1000)
  const step = steps.find(s => totalMs / s <= 6) ?? 7_200_000
  return Array.from({ length: Math.floor(totalMs / step) + 1 }, (_, i) => i * step)
}

// A step's name: the title Claude gave it, else the tool and what it acted on.
const nameOf = (s: Span) => (s.kind === "tool" && s.detail && s.name.length < 16 && !/\s/.test(s.name) ? `${s.name} · ${s.detail}` : s.name)

function Stat({ label, children, tone, title }: { label: string; children: ReactNode; tone?: string; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col" title={title}>
      <span className="text-[11px] font-semibold tracking-[0.04em] text-faint uppercase">{label}</span>
      <span className={cn("truncate text-[15px] font-semibold tabular-nums", tone)}>{children}</span>
    </div>
  )
}

function Row({ span, totalMs, isSlowest }: { span: Span; totalMs: number; isSlowest: boolean }) {
  const [isOpen, setOpen] = useState(false)
  const kind = KIND[span.kind]
  const left = (span.startMs / totalMs) * 100
  const width = Math.max((span.durationMs / totalMs) * 100, 0.4)
  return (
    <li className="min-w-0">
      <button className={cn("grid w-full grid-cols-[minmax(0,34%)_1fr_52px] items-center gap-2.5 rounded-md px-1.5 py-[3px] text-left hover:bg-hover", isSlowest && "bg-[color-mix(in_srgb,var(--ask)_9%,transparent)]")}
        onClick={() => setOpen(v => !v)} aria-expanded={isOpen} title={span.detail ?? span.name}>
        <span className={cn("flex min-w-0 items-center gap-1.5 text-[12.5px]", span.isFailed ? "text-bad" : "text-text")}>
          <span className={cn("shrink-0", span.isFailed ? "text-bad" : "text-text-muted")}>{kind.icon}</span>
          <span className={cn("min-w-0 truncate", span.kind === "tool" && !span.name.includes(" ") && "font-mono text-[11.5px]")}>{nameOf(span)}</span>
        </span>
        <span className="relative h-3.5 min-w-0">
          <span className={cn("absolute top-1/2 h-2 -translate-y-1/2 rounded-full", span.isFailed ? "bg-bad" : kind.bar, span.isRunning && "animate-pulse")}
            style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
        </span>
        <span className={cn("text-right font-mono text-[11px] tabular-nums", isSlowest ? "font-semibold text-ask" : "text-text-muted")}>{duration(span.durationMs)}</span>
      </button>
      {isOpen && (
        <div className="mx-1.5 mt-0.5 mb-1.5 flex flex-col gap-1 rounded-lg border border-line bg-side px-2.5 py-2 text-xs text-text-muted">
          <span>{kind.label}{span.model ? ` · ${modelName(span.model)}` : ""}{span.isFailed ? " · failed" : ""}{span.isRunning ? " · running" : ""} · starts at {duration(span.startMs)} · takes {duration(span.durationMs)}{span.tokensOut ? ` · ${tokens(span.tokensOut)} tokens written` : ""}</span>
          {span.detail && <pre className="m-0 max-h-48 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap text-text">{span.detail}</pre>}
        </div>
      )}
    </li>
  )
}

export function Trace({ id }: { id: string }) {
  const isWorking = useLive(l => l.snapshot?.cards.find(c => c.id === id)?.column === "working")
  const [at, setAt] = useState<number | null>(null) // null: the last turn
  const [data, setData] = useState<{ turns: TurnSummary[]; turn: Turn | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => get<{ turns: TurnSummary[]; turn: Turn | null }>(`/api/sessions/${encodeURIComponent(id)}/trace${at ? `?at=${at}` : ""}`)
      .then(r => alive && (setData(r), setError(null)), (err: Error) => alive && setError(err.message))
    void load()
    const timer = isWorking && at === null ? setInterval(load, FOLLOW_MS) : undefined
    return () => ((alive = false), clearInterval(timer))
  }, [id, at, isWorking])
  if (error && !data) return <p className="grid flex-1 place-items-center p-8 text-text-muted">{error}</p>
  if (!data) return <div className="flex flex-1 flex-col gap-2 px-5 py-4"><i className="skeleton block h-14 rounded-[9px]" /><i className="skeleton block h-64 rounded-[9px]" /></div>
  const turn = data.turn
  if (!turn) return <p className="grid flex-1 place-items-center p-8 text-text-muted">No turn to show yet.</p>
  const totalMs = Math.max(turn.durationMs, 1)
  const slowest = turn.spans.filter(s => s.kind !== "wait").reduce<Span | null>((a, s) => (!a || s.durationMs > a.durationMs ? s : a), null)
  const errors = turn.spans.filter(s => s.isFailed).length
  const tools = turn.spans.filter(s => s.kind === "tool" || s.kind === "agent").length
  const models = turn.spans.filter(s => s.kind === "model").length
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Clock className="size-3.5 shrink-0 text-text-muted" />
          <select className="h-7 min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2 text-[12.5px]" aria-label="Turn"
            value={at ?? turn.at} onChange={e => setAt(Number(e.target.value) === data.turns[0]?.at ? null : Number(e.target.value))}>
            {data.turns.map((t, i) => <option key={t.at} value={t.at}>{i === 0 ? "Last turn · " : ""}{clock(t.at)} · {t.prompt || "(no text)"} · {duration(t.durationMs)}</option>)}
          </select>
          {turn.isRunning && <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-work"><i className="run-dot size-2 rounded-full bg-work" />Running</span>}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-3">
          <Stat label="Duration">{duration(turn.durationMs)}</Stat>
          <Stat label="Claude">{models} {models === 1 ? "call" : "calls"}</Stat>
          <Stat label="Tools">{tools}</Stat>
          <Stat label="Errors" tone={errors ? "text-bad" : "text-faint"}>{errors}</Stat>
          <Stat label="Tokens" title={`${tokens(turn.tokens.output)} written · ${tokens(turn.tokens.input)} read new · ${tokens(turn.tokens.cached)} read from cache`}>{tokens(turn.tokens.output)} out</Stat>
        </div>
        {slowest && (
          <p className="m-0 min-w-0 truncate text-xs text-text-muted">
            Slowest: <b className="font-semibold text-ask">{nameOf(slowest)}</b> · {duration(slowest.durationMs)} ({Math.round((slowest.durationMs / totalMs) * 100)}% of the turn)
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5">
        <div className="sticky top-0 z-[1] grid grid-cols-[minmax(0,34%)_1fr_52px] gap-2.5 bg-bg px-1.5 pb-1.5">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-text-muted">
            {(Object.keys(KIND) as SpanKind[]).map(k => <span key={k} className="inline-flex items-center gap-1"><i className={cn("size-2 rounded-full", KIND[k].bar)} />{KIND[k].label}</span>)}
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-bad" />Failed</span>
          </span>
          <span className="relative h-4 self-end">
            {ticksOf(totalMs).map(t => (
              <span key={t} className="absolute bottom-0 -translate-x-1/2 font-mono text-[10px] text-faint" style={{ left: `${(t / totalMs) * 100}%` }}>{tickLabel(t)}</span>
            ))}
          </span>
          <span />
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {turn.spans.map(s => <Row key={s.id} span={s} totalMs={totalMs} isSlowest={s === slowest} />)}
        </ul>
      </div>
    </div>
  )
}
