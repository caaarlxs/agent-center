// The reply box: text, files (picked, pasted or dropped) and dictation go to
// the session through the bridge mod; a draft stays for three days. The mode
// and model change in the session (it asks for approval when a mode asks
// less); the effort only shows, as the app sends its own with every message.
// Under it, what the session can do with a message now.
import { Gauge, Square } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputProvider, PromptInputSelect, PromptInputSelectContent, PromptInputSelectItem,
  PromptInputSelectTrigger, PromptInputSelectValue, PromptInputSubmit, PromptInputTextarea, PromptInputTools, usePromptInputController,
} from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import { post } from "@/lib/api"
import type { Bridge, Card } from "@/lib/api-types"
import { persistedStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { AttachButton, MicButton, PickedFiles, fileErrors } from "@/features/prompt/PromptExtras"
import { MAX_BYTES, MAX_FILES, messageWith } from "@/features/prompt/files"
import { stop, wake } from "@/features/session/actions"
import { composerFill, sendMessage } from "./send"

export const MODES = [["default", "Ask"], ["acceptEdits", "Accept edits"], ["plan", "Plan"], ["auto", "Auto"], ["bypassPermissions", "Bypass"]] as const
export const MODELS = [["claude-fable-5-1", "Fable 5.1"], ["claude-opus-5-5", "Opus 5.5"], ["claude-sonnet-5-5", "Sonnet 5.5"], ["claude-haiku-5-5", "Haiku 5.5"]] as const
export const EFFORTS = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra high"], ["max", "Max"]] as const

const DRAFT_MS = 3 * 24 * 60 * 60_000
const drafts = persistedStore<Record<string, { text: string; at: number }>>("drafts", {})
const draftOf = (id: string) => {
  const d = drafts.get()[id]
  return d && Date.now() - d.at < DRAFT_MS ? d.text : ""
}
function keepDraft(id: string, text: string) {
  const all = Object.fromEntries(Object.entries(drafts.get()).filter(([key, d]) => key !== id && Date.now() - d.at < DRAFT_MS))
  drafts.set(text.trim() ? { ...all, [id]: { text, at: Date.now() } } : all)
}

export function Pick({ value, options, placeholder, onPick }: { value: string | undefined; options: readonly (readonly [string, string])[]; placeholder: string; onPick: (v: string) => void }) {
  return (
    <PromptInputSelect value={value} onValueChange={onPick}>
      <PromptInputSelectTrigger className="h-8 w-auto gap-1 border-0 px-2 text-xs shadow-none"><PromptInputSelectValue placeholder={placeholder} /></PromptInputSelectTrigger>
      <PromptInputSelectContent>{options.map(([v, label]) => <PromptInputSelectItem key={v} value={v}>{label}</PromptInputSelectItem>)}</PromptInputSelectContent>
    </PromptInputSelect>
  )
}

// What a message would meet now. The mod's heartbeat pauses while a tool
// runs: a recent beat with a turn running means busy.
type Reach = { tone: "on" | "busy" | "bad" | "off"; text: string; fix?: "open" | "wake" }
export function reachOf(bridge: Bridge | null, isWorking: boolean): Reach {
  if (!bridge) return { tone: "off", text: "Checking the session…" }
  if (bridge.isArchived) return { tone: "bad", text: "Archived in Claude: unarchive it there to write", fix: "open" }
  if (bridge.wake?.untrusted) return { tone: "bad", text: "Claude does not trust this folder: open it in Claude and accept", fix: "open" }
  if (bridge.stuck.length) return { tone: "bad", text: "The session did not wake", fix: "open" }
  if (bridge.isOpen) return { tone: "on", text: "Open" }
  if (isWorking && bridge.lastSeen && Date.now() - bridge.lastSeen < 15 * 60_000) return { tone: "busy", text: "Busy: delivered when the turn ends" }
  if (bridge.pending) return { tone: "busy", text: "Waking in the background…" }
  return { tone: "off", text: "Asleep: it wakes when you send", fix: "wake" }
}
const DOT = { on: "bg-emerald-400", busy: "bg-amber-400", bad: "bg-rose-400", off: "bg-zinc-500" }

function Box({ card, bridge }: { card: Card; bridge: Bridge | null }) {
  const { textInput } = usePromptInputController()
  const fill = composerFill.use()
  useEffect(() => {
    if (fill?.id !== card.id) return
    textInput.setInput(fill.text)
    composerFill.set(null)
  }, [fill, card.id, textInput])
  useEffect(() => {
    const timer = setTimeout(() => keepDraft(card.id, textInput.value), 300)
    return () => clearTimeout(timer)
  }, [card.id, textInput.value])

  // A change goes to the mod, which answers in the bridge: told when it does.
  const [asked, setAsked] = useState<string | null>(null)
  const settled = bridge?.settings?.id === asked ? bridge?.settings : null
  useEffect(() => {
    if (!settled) return
    const failed = Object.values(settled.results).filter(r => r !== "ok")
    if (failed.length) toast.error(`Could not change: ${failed.join(" · ")}`)
    else toast("Change applied")
    setAsked(null)
  }, [settled])
  const change = (key: "mode" | "model", value: string) =>
    post<{ requestId: string; isOpen: boolean }>(`/api/sessions/${encodeURIComponent(card.id)}/settings`, { [key]: value }).then(
      res => (setAsked(res.requestId), toast(res.isOpen ? "Change sent" : "Change saved: it applies when the session opens")),
      (err: Error) => toast.error(err.message),
    )
  const fail = (err: Error) => toast.error(err.message)
  const isWorking = card.column === "working"
  const reach = reachOf(bridge, isWorking)
  const effort = EFFORTS.find(([e]) => e === card.effort)?.[1]
  const model = MODELS.find(([m]) => card.usage?.model?.startsWith(m))?.[0]
  return (
    <div className="space-y-1.5">
      <PromptInput
        className="rounded-xl" multiple maxFiles={MAX_FILES} maxFileSize={MAX_BYTES} onError={fileErrors}
        onSubmit={async ({ text, files }) => {
          if (!text.trim() && !files.length) return
          if (bridge?.isArchived) return void toast.error("Archived in Claude: unarchive it there (Open in Claude), then write")
          try {
            await sendMessage(card.id, await messageWith(card.id, text.trim(), files))
          } catch (err) {
            fail(err as Error)
            throw err // keeps what was typed
          }
        }}
      >
        <PickedFiles />
        <PromptInputBody>
          <PromptInputTextarea placeholder={card.column === "asking" ? "Answer…" : "Reply…"} />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <AttachButton />
            <MicButton />
            <Pick value={card.mode ?? undefined} options={MODES} placeholder="Mode" onPick={v => change("mode", v)} />
            <Pick value={model} options={MODELS} placeholder="Model" onPick={v => change("model", v)} />
            {effort && <span className="inline-flex h-8 items-center gap-1 px-2 text-xs text-muted-foreground" title="Effort (read-only). Change it in Claude desktop: it sends its own with every message"><Gauge className="size-3.5" />{effort}</span>}
          </PromptInputTools>
          <span className="flex items-center gap-1">
            {isWorking && <Button type="button" variant="ghost" size="sm" onClick={() => stop(card.id).then(() => toast("Stopping…"), fail)}><Square />Stop</Button>}
            <PromptInputSubmit disabled={!!bridge?.isArchived} />
          </span>
        </PromptInputFooter>
      </PromptInput>
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <i className={cn("size-1.5 rounded-full", DOT[reach.tone])} />
        <span className={cn(reach.tone === "bad" && "text-rose-300")}>{reach.text}</span>
        {reach.fix === "wake" && <button className="underline-offset-2 hover:underline" onClick={() => wake(card.id).then(() => toast("Waking the session"), fail)}>Wake</button>}
        {reach.fix === "open" && <button className="underline-offset-2 hover:underline" onClick={() => post(`/api/sessions/${encodeURIComponent(card.id)}/open`).catch(fail)}>Open in Claude</button>}
      </div>
    </div>
  )
}

export function Composer({ card, bridge }: { card: Card; bridge: Bridge | null }) {
  return (
    <PromptInputProvider key={card.id} initialInput={draftOf(card.id)}>
      <Box card={card} bridge={bridge} />
    </PromptInputProvider>
  )
}
