// What the reply box and "New session" add to the prompt: the paperclip and
// the files picked (pasted and dropped ones join too), and the microphone.
import { FileText, Paperclip, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { usePromptInputAttachments, usePromptInputController } from "@/components/ai-elements/prompt-input"
import { Spinner } from "@/components/ui/spinner"
import { canDictate, canRecord, dictate, hasWhisper, recordVoice, type Recording } from "./voice"
import { Anim } from "@/components/icons/animated"
import { MicVoiceRippleIcon } from "@/components/icona/mic-voice-ripple"
import { Once } from "@/components/icona/moment"

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
          <img src={f.url} alt="" className="block size-16 rounded-lg border border-line object-cover" />
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

const BARS = 34

type MicState =
  | { kind: "idle" }
  | { kind: "recording"; rec: Recording }
  | { kind: "transcribing" }
  | { kind: "dictating"; stop: () => void }

// Whisper while it records: a live wave of the microphone's level and the
// time; a click or Enter writes the text, Esc drops it. Without Whisper, the
// browser's dictation writes as you speak.
export function MicButton() {
  const { textInput } = usePromptInputController()
  const [isWhisper, setWhisper] = useState(false)
  const [mic, setMic] = useState<MicState>({ kind: "idle" })
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const [, tick] = useState(0)
  const micNow = useRef(mic)
  micNow.current = mic
  useEffect(() => void hasWhisper().then(ok => setWhisper(ok && canRecord)), [])
  // Gone mid-recording (the panel or the dialog closed): the microphone stops too.
  useEffect(() => () => {
    const m = micNow.current
    if (m.kind === "recording") m.rec.cancel()
    if (m.kind === "dictating") m.stop()
  }, [])

  const add = (heard: string, base = textInput.value) => textInput.setInput(base ? `${base.trimEnd()} ${heard}` : heard)
  const finish = async (rec: Recording) => {
    setMic({ kind: "transcribing" })
    try {
      const heard = await rec.stop()
      if (heard) add(heard)
    } catch (err) {
      toast.error((err as Error).message)
    }
    setMic({ kind: "idle" })
  }

  const rec = mic.kind === "recording" ? mic.rec : null
  // The level, sampled into bars that scroll left.
  useEffect(() => {
    if (!rec) return
    const audio = new AudioContext()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 512
    audio.createMediaStreamSource(rec.stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const v of samples) sum += ((v - 128) / 128) ** 2
      setLevels(l => [...l.slice(1), Math.min(1, Math.sqrt(sum / samples.length) * 4.5)])
      tick(n => n + 1)
    }, 60)
    return () => (clearInterval(timer), void audio.close())
  }, [rec])
  // Enter writes, Esc drops: caught before the field, so Enter does not send.
  useEffect(() => {
    if (!rec) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) (e.preventDefault(), e.stopImmediatePropagation(), void finish(rec))
      else if (e.key === "Escape") (e.preventDefault(), e.stopImmediatePropagation(), rec.cancel(), setMic({ kind: "idle" }))
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  if (!isWhisper && !canDictate) return null
  const pill = "pill-open inline-flex h-[30px] shrink-0 items-center gap-2 rounded-[15px] pr-2.5 pl-[9px] text-xs font-semibold tabular-nums"
  if (mic.kind === "transcribing") return <span className={cn(pill, "bg-brand-soft text-brand")}><Spinner className="size-3" />Transcribing…</span>
  if (mic.kind === "recording") {
    const s = Math.floor((Date.now() - mic.rec.startedAt) / 1000)
    return (
      <button type="button" onClick={() => finish(mic.rec)} title="Stop and write (↵) · discard (Esc)"
        className={cn(pill, "cursor-pointer border border-[color-mix(in_srgb,var(--bad)_35%,transparent)] bg-bad-soft text-bad hover:bg-[color-mix(in_srgb,var(--bad)_22%,transparent)]")}>
        <Once icon={MicVoiceRippleIcon} size={14} isLoop />
        <span className="flex h-5 w-[102px] items-center gap-px">{levels.map((l, i) => <i key={i} className="w-0.5 shrink-0 rounded-full bg-current" style={{ height: `${Math.max(10, l * 100)}%`, opacity: 0.3 + 0.7 * (i / BARS) }} />)}</span>
        <span>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>
        <Square className="size-[11px] fill-current" />
      </button>
    )
  }
  if (mic.kind === "dictating") return <button type="button" className={cn(toolIcon, "text-bad hover:text-bad")} onClick={mic.stop} title="Stop dictation (Chrome uses Google's servers)"><Once icon={MicVoiceRippleIcon} size={15} isLoop /></button>

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
  return <button type="button" className={toolIcon} onClick={start} title={isWhisper ? "Dictate (Whisper on this Mac)" : "Dictate"} aria-label="Dictate"><Anim.Mic size={15} /></button>
}
