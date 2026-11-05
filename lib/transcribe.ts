// Dictation with Whisper on this Mac: the board records the voice in the
// browser (any browser: Chrome, Firefox…), sends the audio here and
// whisper.cpp writes the text. Nothing leaves the Mac.
//
// The page sends it in pieces while you speak (16 kHz WAV, cut at pauses,
// web/src/features/prompt/voice.ts), each with the end of the text before it
// (`prompt`) so Whisper keeps the thread: when you stop, only the last piece
// is left to write. whisper-server keeps the model loaded while you dictate
// and goes after IDLE_MS, so its memory is not held all day. Other audio (an
// older page) goes through ffmpeg and whisper-cli, as before.
//
//   whisper-cli, whisper-server   brew install whisper-cpp
//   model         models/ggml-large-v3-turbo-q5_0.bin (from huggingface.co/ggerganov/whisper.cpp)

import type { Subprocess } from "bun"
import { mkdir, rm } from "node:fs/promises"
import { availableParallelism, tmpdir } from "node:os"
import { join } from "node:path"
import { MODELS_DIR, settings } from "./config"
import { exec as execResult } from "./proc"

const MODEL = join(MODELS_DIR, "ggml-large-v3-turbo-q5_0.bin")
const MAX_BYTES = 25 * 1024 * 1024
const TIMEOUT_MS = 120_000
// "auto" lets Whisper find the language; the setup (or AGENT_CENTER_VOICE_LANG) pins one ("es", "en"…).
// Read at each recording: a change in the setup applies at once.
const language = () => process.env.AGENT_CENTER_VOICE_LANG || settings.voiceLanguage || "auto"
const THREADS = String(Math.max(1, Math.min(8, availableParallelism())))

// Homebrew installs to /opt/homebrew (Apple silicon) or /usr/local (Intel).
const tool = (name: string) => Bun.which(name, { PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin` })

export async function isReady() {
  return !!tool("whisper-cli") && !!tool("ffmpeg") && (await Bun.file(MODEL).exists())
}

async function exec(cmd: string[]) {
  const { code, stdout, stderr } = await execResult(cmd, { timeoutMs: TIMEOUT_MS })
  if (code !== 0) throw new Error(stderr.trim().split("\n").at(-1) || `${cmd[0]} ended with code ${code}`)
  return stdout
}

let queue: Promise<unknown> = Promise.resolve()

// ---------- whisper-server, while you dictate ----------

const IDLE_MS = 120_000
const PROMPT_CHARS = 200 // of the text before: enough for the thread, short for Whisper
let running: { proc: Subprocess; port: number; lang: string; ready: Promise<boolean> } | null = null
let idle: ReturnType<typeof setTimeout> | undefined

function stopServer() {
  clearTimeout(idle)
  running?.proc.kill()
  running = null
}
process.on("exit", stopServer) // the server going down takes it along

function freePort() {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const { port } = probe
  probe.stop(true)
  return port
}

async function isUp(port: number) {
  for (let i = 0; i < 100; i++) {
    if (await fetch(`http://127.0.0.1:${port}/`).then(r => r.ok, () => false)) return true
    await Bun.sleep(150)
  }
  return false
}

// The server for this language, started (and the model loaded) if it is not;
// null without whisper-server.
async function server(lang: string) {
  const bin = tool("whisper-server")
  if (!bin) return null
  if (running && (running.lang !== lang || running.proc.exitCode !== null)) stopServer()
  if (!running) {
    const port = freePort()
    const proc = Bun.spawn([bin, "-m", MODEL, "-l", lang, "-t", THREADS, "-nt", "--host", "127.0.0.1", "--port", String(port)], { stdout: "ignore", stderr: "ignore" })
    running = { proc, port, lang, ready: isUp(port) }
  }
  const mine = running
  clearTimeout(idle)
  idle = setTimeout(stopServer, IDLE_MS)
  return (await mine.ready) ? mine : (stopServer(), null)
}

const isWav = (bytes: ArrayBuffer) => bytes.byteLength > 44 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
const clean = (text: string) => text.split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim()

async function byServer(bytes: ArrayBuffer, prompt: string) {
  const lang = language()
  const at = await server(lang)
  if (!at) return null
  const form = new FormData()
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "voice.wav")
  form.append("response_format", "text")
  form.append("temperature", "0")
  form.append("language", lang)
  if (prompt) form.append("prompt", prompt.slice(-PROMPT_CHARS))
  const res = await fetch(`http://127.0.0.1:${at.port}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`whisper-server answered ${res.status}`)
  return clean(await res.text())
}

// One recording (or piece of one) at a time: the model uses every core while
// it runs. `prompt`: the text before it, for a piece.
export function transcribe(bytes: ArrayBuffer, prompt = ""): Promise<string> {
  // Nothing to write: the page starts recording, so the model loads meanwhile.
  if (bytes.byteLength === 0) return server(language()).then(() => "", () => "")
  const job = queue.then(async () => {
    if (bytes.byteLength > MAX_BYTES) throw new Error("the recording is too long")
    if (isWav(bytes)) {
      const text = await byServer(bytes, prompt).catch(() => null)
      if (text !== null) return text
    }
    const dir = join(tmpdir(), "agent-center-voice", crypto.randomUUID())
    await mkdir(dir, { recursive: true })
    try {
      const input = join(dir, "voice")
      const wav = join(dir, "voice.wav")
      await Bun.write(input, bytes)
      await exec([tool("ffmpeg")!, "-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav])
      const out = await exec([tool("whisper-cli")!, "-m", MODEL, "-f", wav, "-l", language(), "-nt", "-np", "-t", THREADS, ...(prompt ? ["--prompt", prompt.slice(-PROMPT_CHARS)] : [])])
      return clean(out)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  queue = job.catch(() => {})
  return job
}
