// Dictation. Whisper on this Mac first (lib/transcribe.ts): the audio goes to
// the local server in pieces while you speak, cut at pauses, and the text
// grows in the box. Without it, the browser's own
// speech recognition, which may send the audio to Google.

import { createStore } from "@/lib/store"
import { FRAME_MS, cutAt, isSilent, rmsOf, thresholdOf, wavOf } from "./segments"

// The microphone while you dictate, for the composer's voice glow: its
// stream while Whisper records (the glow follows your voice), on without one
// while the browser dictates (it breathes), and since when Whisper writes
// what you said (the glow, gathered, sweeps along the box).
// form: the one the microphone writes into, so only its own field glows (the
// New session dialog has one too, over a conversation's).
export type MicLive = { isOn: boolean; stream: MediaStream | null; writingSince: number | null; form: HTMLFormElement | null }
export const micLive = createStore<MicLive>({ isOn: false, stream: null, writingSince: null, form: null })

let whisperReady: Promise<boolean> | null = null
export const hasWhisper = () =>
  (whisperReady ??= fetch("/api/transcribe").then(r => r.json()).then(r => !!r.ready, () => false))

export const canRecord = !!navigator.mediaDevices && typeof window.AudioWorkletNode === "function"

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null }
const Recognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition
export const canDictate = !!Recognition

export type Recording = { stream: MediaStream; startedAt: number; stop(): Promise<string>; cancel(): void }

const RATE = 16_000 // what Whisper hears
const FRAME = (RATE * FRAME_MS) / 1000
const NOISE_FRAMES = 3000 // the last minute, for the room's noise
// Hands each block of the microphone's sound to the page, as it comes.
const TAP = `class Tap extends AudioWorkletProcessor { process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true } } registerProcessor("tap", Tap)`

const joined = (frames: Float32Array[]) => {
  const out = new Float32Array(frames.length * FRAME)
  frames.forEach((f, i) => out.set(f, i * FRAME))
  return out
}

async function written(wav: Uint8Array<ArrayBuffer>, before: string) {
  const res = await fetch(`/api/transcribe?prompt=${encodeURIComponent(before.slice(-200))}`, { method: "POST", headers: { "content-type": "audio/wav", "x-agent-center": "1" }, body: wav })
  const body = await res.json().catch(() => ({}))
  if (!body.ok) throw new Error(body.error || "Could not transcribe")
  return String(body.text ?? "").trim()
}

// Records the microphone and writes it in pieces while you speak: a piece is
// cut at a pause (segments.ts) and goes to Whisper at once, with the text
// before it, so `onText` gets the text so far as it grows and `stop()` waits
// only for the last piece. `cancel()` drops it all.
export async function recordVoice(onText: (text: string) => void = () => {}): Promise<Recording> {
  // An empty piece: the server loads the model while you start speaking.
  void fetch("/api/transcribe", { method: "POST", headers: { "x-agent-center": "1" } }).catch(() => {})
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  const context = new AudioContext({ sampleRate: RATE })
  const tapUrl = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }))
  await context.audioWorklet.addModule(tapUrl)
  URL.revokeObjectURL(tapUrl)
  const tap = new AudioWorkletNode(context, "tap")
  context.createMediaStreamSource(stream).connect(tap)
  tap.connect(context.destination) // pulled by the graph, so it runs; it writes nothing out

  let frames: Float32Array[] = []
  let levels: number[] = []
  const heard: number[] = [] // every frame's level, for the room's noise
  let threshold = 0.004
  let partial = new Float32Array(0)
  let text = ""
  let failure: Error | null = null
  let isCancelled = false
  let writing: Promise<void> = Promise.resolve()

  const send = (count: number) => {
    const piece = frames.slice(0, count)
    const pieceLevels = levels.slice(0, count)
    frames = frames.slice(count)
    levels = levels.slice(count)
    if (!piece.length || isSilent(pieceLevels, threshold)) return
    const wav = wavOf(joined(piece), RATE)
    writing = writing.then(async () => {
      if (isCancelled) return
      try {
        const words = await written(wav, text)
        if (words && !isCancelled) onText((text = text ? `${text} ${words}` : words))
      } catch (err) {
        failure ??= err as Error
      }
    })
  }

  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const all = new Float32Array(partial.length + e.data.length)
    all.set(partial)
    all.set(e.data, partial.length)
    let at = 0
    for (; at + FRAME <= all.length; at += FRAME) {
      const frame = all.slice(at, at + FRAME)
      const level = rmsOf(frame)
      frames.push(frame)
      levels.push(level)
      heard.push(level)
      if (heard.length > NOISE_FRAMES) heard.shift()
      if (heard.length % 50 === 0) threshold = thresholdOf(heard)
      const cut = cutAt(levels, threshold)
      if (cut !== null) send(cut)
    }
    partial = all.slice(at)
  }

  const release = () => {
    tap.port.onmessage = null
    stream.getTracks().forEach(t => t.stop())
    void context.close()
  }
  return {
    stream,
    startedAt: Date.now(),
    async stop() {
      release()
      send(frames.length)
      await writing
      if (!text && failure) throw failure
      return text
    },
    cancel() {
      isCancelled = true
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
