// Dictation. Whisper on this Mac first (lib/transcribe.ts): the audio goes to
// the local server, which writes the text. Without it, the browser's own
// speech recognition, which may send the audio to Google.

let whisperReady: Promise<boolean> | null = null
export const hasWhisper = () =>
  (whisperReady ??= fetch("/api/transcribe").then(r => r.json()).then(r => !!r.ready, () => false))

export const canRecord = !!navigator.mediaDevices && typeof window.MediaRecorder === "function"

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null }
const Recognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition
export const canDictate = !!Recognition

export type Recording = { stream: MediaStream; startedAt: number; stop(): Promise<string>; cancel(): void }

// Records the microphone: `stop()` resolves the text, `cancel()` drops it.
export async function recordVoice(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t))
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = e => void (e.data.size && chunks.push(e.data))
  const ended = new Promise(resolve => (recorder.onstop = resolve))
  recorder.start()
  const release = () => stream.getTracks().forEach(t => t.stop())
  return {
    stream,
    startedAt: Date.now(),
    async stop() {
      recorder.stop()
      await ended
      release()
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
      const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": blob.type, "x-agent-center": "1" }, body: blob })
      const body = await res.json().catch(() => ({}))
      if (!body.ok) throw new Error(body.error || "Could not transcribe")
      return body.text as string
    },
    cancel() {
      recorder.onstop = null
      if (recorder.state !== "inactive") recorder.stop()
      release()
    },
  }
}

// The browser's recognition: `onText` gets all heard so far, `stop()` ends it;
// `onEnd` gets the reason when it stopped on an error ("not-allowed"…).
export function dictate(onText: (heard: string) => void, onEnd: (error?: string) => void) {
  const rec = new Recognition!()
  rec.lang = navigator.language || "en-US"
  rec.continuous = true
  rec.interimResults = true
  let heard = ""
  rec.onresult = e => {
    let interim = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) heard += r[0].transcript
      else interim += r[0].transcript
    }
    onText(heard + interim)
  }
  let error: string | undefined
  rec.onerror = (e: { error?: string }) => void (error = e.error)
  rec.onend = () => onEnd(error)
  rec.start()
  return { stop: () => rec.stop() }
}
