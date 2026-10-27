// What the reply box and "New session" add to the prompt: the paperclip and
// the files picked (pasted and dropped ones join too), and the microphone.
import { Mic, Paperclip, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Attachment, AttachmentInfo, AttachmentPreview, AttachmentRemove, Attachments } from "@/components/ai-elements/attachments"
import { PromptInputButton, usePromptInputAttachments, usePromptInputController } from "@/components/ai-elements/prompt-input"
import { Spinner } from "@/components/ui/spinner"
import { canDictate, canRecord, dictate, hasWhisper, recordVoice, type Recording } from "./voice"

export const fileErrors = (err: { code: string }) =>
  toast.error(err.code === "max_files" ? "Up to 10 files per message" : "Each file can be up to 500 MB")

export function PickedFiles() {
  const { files, remove } = usePromptInputAttachments()
  if (!files.length) return null
  return (
    <Attachments variant="inline" className="w-full px-3 pt-3">
      {files.map(f => (
        <Attachment key={f.id} data={f} onRemove={() => remove(f.id)}>
          <AttachmentPreview /><AttachmentInfo /><AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  )
}

export function AttachButton() {
  const { openFileDialog } = usePromptInputAttachments()
  return <PromptInputButton onClick={openFileDialog} tooltip="Attach files (or paste or drop them)" aria-label="Attach files"><Paperclip /></PromptInputButton>
}

const BARS = 24

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
  if (mic.kind === "transcribing") return <PromptInputButton size="sm" disabled><Spinner />Transcribing…</PromptInputButton>
  if (mic.kind === "recording") {
    const s = Math.floor((Date.now() - mic.rec.startedAt) / 1000)
    return (
      <PromptInputButton size="sm" className="gap-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" onClick={() => finish(mic.rec)} tooltip="Write it (↵) · drop it (Esc)">
        <i className="size-2 animate-pulse rounded-full bg-rose-500" />
        <span className="flex h-4 items-center gap-px">{levels.map((l, i) => <i key={i} className="w-0.5 rounded-full bg-current" style={{ height: `${Math.max(12, l * 100)}%`, opacity: 0.35 + 0.65 * (i / BARS) }} />)}</span>
        <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>
      </PromptInputButton>
    )
  }
  if (mic.kind === "dictating") return <PromptInputButton className="text-rose-400" onClick={mic.stop} tooltip="Stop dictating"><Square /></PromptInputButton>

  const start = async () => {
    if (!isWhisper) {
      const base = textInput.value
      const d = dictate(heard => add(heard, base), () => setMic({ kind: "idle" }))
      return setMic({ kind: "dictating", stop: d.stop })
    }
    try {
      setMic({ kind: "recording", rec: await recordVoice() })
    } catch (err) {
      toast.error((err as Error)?.name === "NotAllowedError" ? "The browser has no permission to use the microphone" : "Could not start recording")
    }
  }
  return <PromptInputButton onClick={start} tooltip={isWhisper ? "Dictate (Whisper on this Mac)" : "Dictate (the browser's recognition)"} aria-label="Dictate"><Mic /></PromptInputButton>
}
