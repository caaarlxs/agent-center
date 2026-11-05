// Dictation with Whisper on this Mac: the board records the voice in the
// browser (any browser: Chrome, Firefox…), sends the audio here, ffmpeg turns
// it into 16 kHz WAV and whisper.cpp writes the text. Nothing leaves the Mac.
//
//   whisper-cli   brew install whisper-cpp
//   model         models/ggml-large-v3-turbo-q5_0.bin (from huggingface.co/ggerganov/whisper.cpp)

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

// One recording at a time: the model uses every core while it runs.
export function transcribe(bytes: ArrayBuffer): Promise<string> {
  const job = queue.then(async () => {
    if (bytes.byteLength === 0) return ""
    if (bytes.byteLength > MAX_BYTES) throw new Error("the recording is too long")
    const dir = join(tmpdir(), "agent-center-voice", crypto.randomUUID())
    await mkdir(dir, { recursive: true })
    try {
      const input = join(dir, "voice")
      const wav = join(dir, "voice.wav")
      await Bun.write(input, bytes)
      await exec([tool("ffmpeg")!, "-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav])
      const out = await exec([tool("whisper-cli")!, "-m", MODEL, "-f", wav, "-l", language(), "-nt", "-np", "-t", THREADS])
      return out.split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  queue = job.catch(() => {})
  return job
}
