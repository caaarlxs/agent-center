// What changes in an open session, told by the server as it happens
// (/api/sessions/<id>/events, lib/session-events.ts): "messages" when its
// transcript grows, "bridge" when its mod writes for it, "stream" with the
// answer the model is writing. One connection per session, shared by
// whoever listens. A reader asks again on its own only now and then
// (`every`), or often while the connection is down.
import { useEffect, useRef, useState } from "react"
import type { Doing } from "@/lib/api-types"
export type { Doing }

type Kind = "messages" | "bridge" | "stream"
type Entry = { source: EventSource; listeners: Set<(kind: Kind, data: string) => void>; isUp: boolean }
const entries = new Map<string, Entry>()

function join(id: string, listener: (kind: Kind, data: string) => void) {
  let entry = entries.get(id)
  if (!entry) {
    const source = new EventSource(`/api/sessions/${encodeURIComponent(id)}/events`)
    const made: Entry = { source, listeners: new Set(), isUp: false }
    source.onopen = () => (made.isUp = true)
    source.onerror = () => (made.isUp = false) // EventSource reconnects by itself
    for (const kind of ["messages", "bridge", "stream"] as const)
      source.addEventListener(kind, e => made.listeners.forEach(l => l(kind, (e as MessageEvent<string>).data)))
    entries.set(id, (entry = made))
  }
  entry.listeners.add(listener)
  const joined = entry
  return {
    isUp: () => joined.isUp,
    leave: () => {
      joined.listeners.delete(listener)
      if (joined.listeners.size) return
      joined.source.close()
      entries.delete(id)
    },
  }
}

// Calls `read` when the session tells `kind`, and on its own every
// `every.connected` ms (every `every.lost` while the connection is down).
export function useSessionEvents(id: string, kind: Kind, read: () => void, every: { connected: number; lost: number }) {
  const latest = useRef(read)
  latest.current = read
  useEffect(() => {
    let last = Date.now()
    const run = () => ((last = Date.now()), latest.current())
    const link = join(id, k => k === kind && run())
    const tick = setInterval(() => Date.now() - last >= (link.isUp() ? every.connected : every.lost) && run(), every.lost)
    return () => (clearInterval(tick), link.leave())
  }, [id, kind, every.connected, every.lost])
}

// The answer the model is writing in this session (mod v10), while it does:
// its text so far. Once the step ends it stays until the transcript has it
// (`itemCount` grows) or for a moment; a stream that stopped long ago (its
// session closed mid-answer) is not shown.
// v12 adds the turn's start, the tokens written so far and what it does now.
export type Live = { turnId: string; step: number; text: string; done: boolean; at: number; since?: number; tokens?: number; doing?: Doing | null }
const KEEP_DONE_MS = 2500
const STALE_MS = 60_000

// The text to show: none for a stream long stopped, nor once the transcript
// grew past where it stood when the step ended.
export function shownLive(live: Live | null, itemCount: number, countAtDone: number | null, now: number) {
  if (!live?.text || now - live.at > STALE_MS) return null
  if (live.done && countAtDone !== null && itemCount > countAtDone) return null
  return live.text
}

export function useLiveAnswer(id: string, itemCount: number) {
  const [live, setLive] = useState<Live | null>(null)
  const countAtDone = useRef<number | null>(null)
  const count = useRef(itemCount)
  count.current = itemCount
  useEffect(() => {
    setLive(null)
    const link = join(id, (kind, data) => {
      if (kind !== "stream") return
      const next = (() => {
        try {
          return JSON.parse(data) as Live | null
        } catch {
          return null
        }
      })()
      countAtDone.current = next?.done ? count.current : null
      setLive(next)
    })
    return () => link.leave()
  }, [id])
  useEffect(() => {
    if (!live?.done) return
    // The text goes; where the turn stands (v12) stays for its line.
    const timer = setTimeout(() => setLive(l => (l && l.text ? { ...l, text: "" } : l)), KEEP_DONE_MS)
    return () => clearTimeout(timer)
  }, [live])
  return { text: shownLive(live, itemCount, countAtDone.current, Date.now()), live }
}

// The line the app shows while a turn runs: "5s · 29 tokens" and what it
// does now. A tool that says what it does (Bash's description, an agent's)
// says only that; another, its name and its file or pattern.
const SAYS_ITSELF = new Set(["Bash", "Agent", "Task"])
const toolName = (name: string) => (name.startsWith("mcp__") ? name.split("__").slice(2).join("__") : name)
function doingText(d: Doing | null | undefined) {
  if (!d) return null
  if (d.kind !== "tool") return d.kind === "thinking" ? "Thinking" : "Writing"
  const name = toolName(d.tool ?? "tool")
  if (!d.label) return name
  return SAYS_ITSELF.has(name) ? d.label : `${name} · ${d.label}`
}
const timeText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
const tokensText = (n: number) => `${n < 1000 ? n : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`} tokens`

export function turnLine(live: Live | null, now: number) {
  if (!live?.since) return null
  return { time: timeText(now - live.since), tokens: tokensText(live.tokens ?? 0), doing: doingText(live.doing) }
}

// The orb (thinking-orbs) the turn line shows, by what the turn does:
// thinking solves, writing composes, a tool that reads or looks something up
// searches, an agent weaves, another connector's tool connects, the rest works.
export type Orb = "breathing" | "solving" | "composing" | "searching" | "weaving" | "connecting" | "working"
const LOOKS = /^(Read|Grep|Glob|WebSearch|WebFetch|LS|NotebookRead)$/
const LOOKS_UP = /search|get|list|read|fetch|find|query/i
export function orbOf(d: Doing | null | undefined): Orb {
  if (!d) return "breathing"
  if (d.kind !== "tool") return d.kind === "thinking" ? "solving" : "composing"
  const tool = d.tool ?? ""
  if (LOOKS.test(tool)) return "searching"
  if (tool === "Agent" || tool === "Task") return "weaving"
  if (tool.startsWith("mcp__")) return LOOKS_UP.test(toolName(tool)) ? "searching" : "connecting"
  return "working"
}
