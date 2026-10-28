// The reply box (composer.js): text, files (picked, pasted or dropped) and
// dictation go to the session through the bridge mod. The draft stays for
// three days (the files while the page is open). The mode and model change in
// the session; the effort only shows, as the app sends its own with every
// message. Under it, what a message would meet now and how full the context is.
import { Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FileUIPart } from "ai"
import { toast } from "sonner"
import { PromptInput, PromptInputBody, PromptInputProvider, PromptInputTextarea, usePromptInputController } from "@/components/ai-elements/prompt-input"
import { post } from "@/lib/api"
import type { Bridge, Card } from "@/lib/api-types"
import { persistedStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { AttachButton, MicButton, PickedFiles, fileErrors } from "@/features/prompt/PromptExtras"
import { EFFORTS, MODELS, MODES, Pick, ReadOnly, modelKey } from "@/features/prompt/Settings"
import { MAX_BYTES, MAX_FILES, messageWith } from "@/features/prompt/files"
import { launch, stopTurn, wake } from "@/features/session/actions"
import { UsageMeter } from "@/features/session/UsageMeter"
import { isBusyNow, isStuckNow, reachOf } from "./reach"
import { composerFill, composerFocus, sendMessage } from "./send"
import { Anim } from "@/components/icons/animated"
import { SendMark, useSendMoment } from "@/components/icona/marks"

export { EFFORTS, MODELS, MODES, Pick } // New session uses them too

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
// The files picked, per session, while the page stays open.
const draftFiles = new Map<string, (FileUIPart & { id: string })[]>()

const DOT = { on: "bg-work shadow-[0_0_0_3px_var(--work-soft)]", busy: "bg-ask shadow-[0_0_0_3px_var(--ask-soft)]", bad: "bg-bad", off: "bg-faint" }
const subtle = "inline-flex h-[30px] shrink-0 items-center gap-[5px] rounded-md px-2.5 text-[13px] font-medium text-text-muted transition-[background-color,color,transform] duration-[120ms] hover:bg-hover active:scale-[0.97] [&_svg]:size-3"

// Mode and model, changed through the bridge mod (v4); the effort shows.
function Settings({ card, bridge }: { card: Card; bridge: Bridge | null }) {
  const [asked, setAsked] = useState<{ requestId: string; key: "mode" | "model"; value: string } | null>(null)
  useEffect(() => {
    if (!asked || bridge?.settings?.id !== asked.requestId) return
    const failed = Object.values(bridge.settings.results).filter(r => r !== "ok")
    toast(failed.length ? `Could not change: ${failed.join(" · ")}` : "Change applied")
    setAsked(null)
  }, [bridge?.settings?.id])
  const change = (key: "mode" | "model", value: string) =>
    post<{ requestId: string; isOpen: boolean; messageId?: string }>(`/api/sessions/${encodeURIComponent(card.id)}/settings`, { [key]: value }).then(
      res => {
        // A session in Auto changes its mode when the conversation asks: sent as a message.
        if (res.messageId) return void toast("Sent as a message: in Auto, Claude changes the mode when the conversation asks")
        setAsked({ requestId: res.requestId, key, value })
        toast(res.isOpen ? "Change sent: it applies as soon as the session is free" : "Change saved: it applies when the session opens")
      },
      (err: Error) => toast(err.message || "Could not request the change"),
    )
  const isOld = !!bridge && bridge.version < 4
  const valueOf = (key: "mode" | "model", current: string | null | undefined) => (asked?.key === key ? asked.value : current ?? "")
  const old = "This session started with an older bridge mod: close it and open it again"
  const effort = EFFORTS.find(([e]) => e === card.effort)?.[1]
  return (
    <div className="flex min-w-0 flex-nowrap gap-0.5">
      <Pick icon="mode" value={valueOf("mode", card.mode)} options={MODES} isDisabled={!bridge || isOld} isWaiting={asked?.key === "mode"}
        title={isOld ? old : "Permission mode"} onPick={v => change("mode", v)} />
      <Pick icon="model" value={valueOf("model", modelKey(card.usage?.model))} options={MODELS} isDisabled={!bridge || isOld} isWaiting={asked?.key === "model"}
        title={isOld ? old : "Model. Claude desktop still shows the previous one in its picker, but the session uses this one"} onPick={v => change("model", v)} />
      {effort && <ReadOnly icon="effort" value={effort} title="Effort (read-only). Change it in Claude desktop: it sends its own with every message" />}
    </div>
  )
}

function Box({ id, card, bridge }: { id: string; card: Card | undefined; bridge: Bridge | null }) {
  const { textInput } = usePromptInputController()
  const fill = composerFill.use()
  const focus = composerFocus.use()
  const box = useRef<HTMLDivElement>(null)
  const [isDrop, setDrop] = useState(false)
  const [isWaking, setWaking] = useState(false)
  const sent = useSendMoment() // the paper plane when the message leaves
  const cursorAtEnd = () => {
    const el = box.current?.querySelector("textarea")
    if (el) (el.focus({ preventScroll: true }), el.setSelectionRange(el.value.length, el.value.length))
  }
  // A template reply or Undo fills it; a click that opened it, Next up or R
  // asks for the cursor (at the end of the text).
  useEffect(() => {
    if (fill?.id !== id) return
    textInput.setInput(fill.text)
    composerFill.set(null)
    requestAnimationFrame(cursorAtEnd)
  }, [fill, id, textInput])
  useEffect(() => void (focus?.id === id && cursorAtEnd()), [focus, id])
  // The draft: kept as you type, and once more when the chat closes.
  const latest = useRef(textInput.value)
  latest.current = textInput.value
  useEffect(() => {
    const timer = setTimeout(() => keepDraft(id, textInput.value), 300)
    return () => clearTimeout(timer)
  }, [id, textInput.value])
  useEffect(() => () => keepDraft(id, latest.current), [id])
  const alive = useRef(true)
  useEffect(() => () => void (alive.current = false), [])

  const isWorking = card?.column === "working"
  const reach = reachOf(bridge, isWorking, isWaking)
  const isStuck = isStuckNow(bridge)
  const isBusy = isBusyNow(bridge, isWorking)
  const canWake = !!bridge && !bridge.isOpen && !isBusy && !isWaking && !bridge.pending
  const startWake = () => {
    setWaking(true)
    wake(id).catch((err: Error) => toast(err.message || "Could not wake the session"))
    setTimeout(() => alive.current && setWaking(false), 8000)
  }
  return (
    <div ref={box} className={cn("composer-box shrink-0 border-t border-line bg-surface px-3.5 py-2.5 max-[860px]:px-3 max-[860px]:pt-2 max-[860px]:pb-3", isDrop && "drop")}
      onDragEnter={e => e.dataTransfer.types.includes("Files") && setDrop(true)}
      onDragLeave={e => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(false)}
      onDrop={() => setDrop(false)}>
      <PromptInput
        multiple maxFiles={MAX_FILES} maxFileSize={MAX_BYTES} onError={fileErrors}
        onSubmit={async ({ text, files }) => {
          if (!text.trim() && !files.length) return
          if (bridge?.isArchived) return void toast("Archived in Claude: unarchive it there (Open in Claude), then write")
          try {
            await sendMessage(id, await messageWith(id, text.trim(), files))
            sent.play()
          } catch (err) {
            toast((err as Error).message || "Could not send")
            throw err // keeps what was typed
          }
        }}
      >
        <PickedFiles />
        <PromptInputBody>
          <PromptInputTextarea placeholder="Reply… (paste or drag images and files)" />
        </PromptInputBody>
        <div data-align="block-end" className="order-last flex w-full min-w-0 items-center gap-0.5 pt-1 pr-1.5 pb-1.5 pl-2">
          <AttachButton />
          <MicButton />
          {card && <><span className="mx-1.5 h-[18px] w-px shrink-0 bg-line" /><Settings card={card} bridge={bridge} /></>}
          <span className="flex-1" />
          {isWorking && card && (
            <button type="button" className={cn(subtle, "hover:text-bad")} onClick={() => stopTurn(card)} title="Stops the running turn, like Esc in Claude desktop (S)"><Square />Stop</button>
          )}
          {isStuck ? <button type="button" className={subtle} onClick={() => launch(id)} title="Opens the session in Claude desktop">Open in Claude</button>
            : canWake && <button type="button" className={subtle} onClick={startWake} title="Starts the session in Claude, in the background, so it gets messages">Wake</button>}
          <button type="submit" disabled={!!bridge?.isArchived}
            title={bridge?.isArchived ? "Archived in Claude: unarchive it there to write" : "Send (↵) · new line (⇧↵)"}
            className="ml-1 inline-grid size-8 shrink-0 place-items-center rounded-[10px] border border-brand bg-brand text-brand-text transition-[filter,transform] duration-[120ms] hover:brightness-106 active:scale-[0.97] disabled:opacity-45">
            <SendMark moment={sent} size={14} idle={<Anim.ArrowUp size={14} />} />
          </button>
        </div>
      </PromptInput>
      <div className="flex min-w-0 items-center justify-between gap-3 px-1 pt-[7px]">
        <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-text-muted", reach.tone === "bad" && "text-bad")}>
          <i className={cn("size-[7px] shrink-0 rounded-full", DOT[reach.tone])} /><span className="truncate">{reach.text}</span>
        </span>
        {card?.usage && <UsageMeter usage={card.usage} isWide />}
      </div>
    </div>
  )
}

// card: the session on the board; without one (opened from the search) the
// box still writes to it, without the mode and model.
export function Composer({ id, card, bridge }: { id: string; card: Card | undefined; bridge: Bridge | null }) {
  return (
    <PromptInputProvider key={id} initialInput={draftOf(id)} initialFiles={draftFiles.get(id)}
      onFilesChange={files => void (files.length ? draftFiles.set(id, files) : draftFiles.delete(id))}>
      <Box id={id} card={card} bridge={bridge} />
    </PromptInputProvider>
  )
}
