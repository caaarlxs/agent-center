// What the reply box and "New session" add to the prompt: the paperclip and
// the files picked (pasted and dropped ones join too), and the microphone.
import { FileText, Paperclip, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { usePromptInputAttachments, usePromptInputController } from "@/components/ai-elements/prompt-input"
import { canDictate, canRecord, dictate, hasWhisper, micLive, recordVoice, type Recording } from "./voice"
import { handOff } from "./voice-handoff"
import { joinText } from "@/features/conversation/drafts"
import { Anim } from "@/components/icons/animated"
import { Elapsed } from "./VoiceWave"
import { showImage } from "@/components/common/Lightbox"
import { ThinkingOrb } from "thinking-orbs"

export const fileErrors = (err: { code: string }) =>
  toast(err.code === "max_files" ? "Up to 10 files per message" : "Each file can be up to 500 MB (and cannot be empty)")

// The files picked for the message (attachments.js): 64px pictures and file
// chips, each with a round × to remove it.
const remover = "absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full bg-black/75 text-white opacity-90 hover:opacity-100 [&_svg]:size-[11px]"
export function PickedFiles() {
  const { files, remove } = usePromptInputAttachments()
  if (!files.length) return null
  return (
    <div className="flex w-full flex-wrap gap-2 px-3 pt-2.5">
      {files.map(f => f.mediaType?.startsWith("image/") ? (
        <span key={f.id} className="relative">
          <button type="button" onClick={() => f.url && showImage(f.url)} title="See it large" className="block cursor-pointer">
            <img src={f.url} alt="" className="block size-16 rounded-lg border border-line object-cover" />
          </button>
          <button type="button" className={remover} onClick={() => remove(f.id)} title="Remove the image"><Anim.X size={11} /></button>
        </span>
      ) : (
        <span key={f.id} className="relative inline-flex h-16 max-w-[260px] items-center gap-1.5 rounded-lg border border-line bg-side pr-3 pl-2.5 text-[12.5px]">
          <FileText className="size-3.5 shrink-0 text-text-muted" /><span className="truncate">{f.filename}</span>
          <button type="button" className={remover} onClick={() => remove(f.id)} title="Remove the file"><Anim.X size={11} /></button>
        </span>
      ))}
    </div>
  )
}

export function AttachButton() {
  const { openFileDialog } = usePromptInputAttachments()
  return <button type="button" className={toolIcon} onClick={openFileDialog} title="Attach images, PDFs or any file (you can also paste or drag them)" aria-label="Attach files"><Paperclip /></button>
}

// A toolbar icon of the reply box (.composer-tools .icon-btn): 30px, muted.
export const toolIcon = "inline-grid size-[30px] shrink-0 place-items-center rounded-md text-text-muted transition-[background-color,color,transform] duration-[120ms] ease-(--ease-out) hover:bg-hover hover:text-text active:scale-[0.92] [&_svg]:size-[15px]"

type MicState =
  | { kind: "idle" }
  | { kind: "recording"; rec: Recording }
  | { kind: "transcribing" }
  | { kind: "dictating"; stop: () => void }

// Whisper while it records: a live wave of the microphone's level and the
// time; Enter writes the text and sends it, a click only writes it (to
// change it first), Esc drops it. Leave the box while it records or writes
// and nothing is lost: it finishes on its own and is sent to the session
// `owner` (voice-handoff.ts); if Whisper fails, the audio stays and
// the toast tries again. Either way the field
// takes the focus back, the caret at the end, so the next Enter sends.
// Without Whisper, the browser's dictation writes as you speak.
// Submits the form once its field holds `text`, waiting up to about a second.
function submitWhenShown(form: HTMLFormElement | null, text: string, frames = 30) {
  const field = form?.querySelector("textarea")
  if (!form || !field) return
  if (field.value.includes(text)) return void form.requestSubmit()
  if (frames > 0) setTimeout(() => submitWhenShown(form, text, frames - 1), 30)
}

export function MicButton({ owner }: { owner?: string }) {
  const { textInput } = usePromptInputController()
  const [isWhisper, setWhisper] = useState(false)
  const [mic, setMic] = useState<MicState>({ kind: "idle" })
  const [, tick] = useState(0)
  const micNow = useRef(mic)
  micNow.current = mic
  const button = useRef<HTMLElement>(null) // whichever shows: the field is in its form
  const backToField = () =>
    setTimeout(() => {
      const field = button.current?.closest("form")?.querySelector("textarea")
      if (!field) return
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    }, 0)
  useEffect(() => void hasWhisper().then(ok => setWhisper(ok && canRecord)), [])
  const isMounted = useRef(true)
  const add = (heard: string, base = textInput.value) => textInput.setInput(joinText(base, heard))
  // Its text: into this box while it is on the page; else handed to its session.
  const land = (heard: string, isSend: boolean, form: HTMLFormElement | null) => {
    if (!heard) return
    if (!isMounted.current) return void handOff(owner, heard) // left the box: sent once written
    add(heard)
    // Sent as the box's own Enter would, once the box shows the text (sent
    // before, it would go empty and the text be lost).
    if (isSend) submitWhenShown(form, heard)
  }
  const finish = async (rec: Recording, isSend = false) => {
    const form = button.current?.closest("form") ?? null
    if (isMounted.current) setMic({ kind: "transcribing" })
    const attempt = (retry: () => Promise<string>) =>
      retry().then(heard => land(heard, isSend, form), (err: Error & { retry?: () => Promise<string> }) => {
        const again = err.retry
        toast.error(err.message, again ? { duration: 60_000, action: { label: "Try again", onClick: () => void attempt(again) } } : undefined)
      })
    await attempt(() => rec.stop())
    if (!isMounted.current) return
    setMic({ kind: "idle" })
    backToField()
  }
  const finishNow = useRef(finish)
  finishNow.current = finish
  // Gone mid-recording (the panel or the dialog closed): it stops and writes
  // what it heard all the same; browser dictation just stops.
  useEffect(() => {
    isMounted.current = true
    return () => {
    isMounted.current = false
    const m = micNow.current
    if (m.kind === "recording") void finishNow.current(m.rec)
    if (m.kind === "dictating") m.stop()
    }
  }, [])

  const rec = mic.kind === "recording" ? mic.rec : null
  // The composer's glow: on while you speak, off once it writes.
  useEffect(() => {
    const form = button.current?.closest("form") ?? null
    micLive.set({ isOn: mic.kind !== "idle", stream: rec?.stream ?? null, writingSince: mic.kind === "transcribing" ? Date.now() : null, form })
    return () => micLive.set({ isOn: false, stream: null, writingSince: null, form: null })
  }, [mic.kind, rec])
  // The clock in the pill, each second while it records.
  useEffect(() => {
    if (!rec) return
    const timer = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(timer)
  }, [rec])
  // Enter writes, Esc drops: caught before the field, so Enter does not send.
  useEffect(() => {
    if (!rec) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) (e.preventDefault(), e.stopImmediatePropagation(), void finish(rec, true))
      else if (e.key === "Escape") (e.preventDefault(), e.stopImmediatePropagation(), rec.cancel(), setMic({ kind: "idle" }), backToField())
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  if (!isWhisper && !canDictate) return null
  const pill = "pill-open inline-flex h-[30px] shrink-0 items-center gap-2 rounded-[15px] pr-2.5 pl-[9px] text-xs font-semibold tabular-nums"
  const quiet = "border border-line bg-hover text-text-muted"
  const orb = (state: "listening" | "composing") => <ThinkingOrb state={state} size={20} className="size-4 shrink-0" aria-hidden />
  if (mic.kind === "transcribing") return <span ref={button} className={cn(pill, quiet)}>{orb("composing")}Transcribing…</span>
  if (mic.kind === "recording") {
    const s = Math.floor((Date.now() - mic.rec.startedAt) / 1000)
    return (
      <button ref={button as React.RefObject<HTMLButtonElement>} type="button" onClick={() => finish(mic.rec)} title="Stop and write · send (↵) · discard (Esc)"
        className={cn(pill, quiet, "cursor-pointer hover:bg-press hover:text-text")}>
        {orb("listening")}
        <Elapsed seconds={s} />
        <Square className="size-[11px] fill-current" />
      </button>
    )
  }
  if (mic.kind === "dictating") return <button ref={button as React.RefObject<HTMLButtonElement>} type="button" className={toolIcon} onClick={() => (mic.stop(), backToField())} title="Stop dictation (Chrome uses Google's servers)">{orb("listening")}</button>

  const start = async () => {
    if (!isWhisper) {
      const base = textInput.value
      try {
        const d = dictate(heard => add(heard, base), error => {
          setMic({ kind: "idle" })
          if (error === "not-allowed") toast("Chrome has no permission to use the microphone")
          else if (error && error !== "no-speech" && error !== "aborted") toast(`Dictation stopped: ${error}`)
        })
        return setMic({ kind: "dictating", stop: d.stop })
      } catch {
        return void toast("Could not start dictation")
      }
    }
    try {
      setMic({ kind: "recording", rec: await recordVoice() })
    } catch (err) {
      toast((err as Error)?.name === "NotAllowedError" ? "The browser has no permission to use the microphone" : "Could not start recording")
    }
  }
  return <button ref={button as React.RefObject<HTMLButtonElement>} type="button" className={toolIcon} onClick={start} title={isWhisper ? "Dictate (Whisper on this Mac)" : "Dictate"} aria-label="Dictate"><Anim.Mic size={15} /></button>
}
