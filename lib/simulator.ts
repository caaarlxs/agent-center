// The iOS simulators running on this Mac, seen and touched from the board.
// They are Xcode's own (CoreSimulator): the one Claude desktop boots for a
// session is one of them, so what you tap here its agent sees, and what the
// agent does you see. Nothing here boots or shuts one down.
//
// The picture is AXe's stream (github.com/cameroncooke/AXe, from Homebrew):
// JPEGs at half size, six a second at most, passed on as they come and
// only while a page asks for them: the stream's process ends with the
// request. Touches and keys go through one `axe serve` per simulator, kept
// while it is used (each command would otherwise take seconds to start) and
// closed two minutes after the last one.

import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec } from "./proc"
import type { Step } from "./setup"

export type Simulator = { udid: string; name: string; os: string }
export type Screen = { width: number; height: number } // in points, as taps are

const UDID = /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/
export const isUdid = (v: unknown): v is string => typeof v === "string" && UDID.test(v)

const BREW_PATH = `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`
const axe = () => Bun.which("axe", { PATH: BREW_PATH })

/** The booted iOS simulators in `simctl list devices -j`. */
export function bootedOf(list: any): Simulator[] {
  const out: Simulator[] = []
  for (const [runtime, devices] of Object.entries(list?.devices ?? {})) {
    const os = runtime.match(/SimRuntime\.iOS-([\d-]+)$/)?.[1]
    if (!os || !Array.isArray(devices)) continue
    for (const d of devices) if (d?.state === "Booted" && isUdid(d.udid)) out.push({ udid: d.udid, name: String(d.name ?? "iPhone").slice(0, 80), os: `iOS ${os.replaceAll("-", ".")}` })
  }
  return out
}

/** The simulators running, and whether AXe is here to show them. */
export async function simulators(): Promise<{ hasTool: boolean; devices: Simulator[] }> {
  const { code, stdout } = await exec(["/usr/bin/xcrun", "simctl", "list", "devices", "booted", "-j"], { timeoutMs: 10_000 })
  let list: unknown = null
  try {
    list = code === 0 ? JSON.parse(stdout) : null
  } catch {}
  return { hasTool: !!axe(), devices: bootedOf(list) }
}

// ---------- what this Mac needs (a step of Setup, lib/setup.ts) ----------
//
// Xcode (with its license accepted and an iOS runtime) only the person can
// install; AXe the board installs from Homebrew, in the background.

type Xcode = "ok" | "missing" | "license"
type Job = { phase: "brew" | "error"; error?: string }
let job: Job | null = null

/** The step as Setup shows it, from what this Mac has. */
export function simulatorStep(o: { xcode: Xcode; hasRuntime: boolean; hasAxe: boolean; job: Job | null }): Step {
  if (o.xcode === "missing") return { id: "simulator", state: "unavailable", detail: "no-xcode" }
  if (o.xcode === "license") return { id: "simulator", state: "unavailable", detail: "license" }
  if (!o.hasRuntime) return { id: "simulator", state: "unavailable", detail: "no-runtime" }
  if (o.hasAxe) return { id: "simulator", state: "done" }
  if (o.job?.phase === "brew") return { id: "simulator", state: "working", detail: "brew" }
  return o.job?.error ? { id: "simulator", state: "missing", detail: o.job.error } : { id: "simulator", state: "missing" }
}

// simctl answers 69 until the Xcode license is accepted.
async function xcodeState(): Promise<Xcode> {
  const { code } = await exec(["/usr/bin/xcrun", "simctl", "help"], { timeoutMs: 10_000 })
  return code === 0 ? "ok" : code === 69 ? "license" : "missing"
}

async function hasIosRuntime() {
  const { code, stdout } = await exec(["/usr/bin/xcrun", "simctl", "list", "runtimes", "-j"], { timeoutMs: 10_000 })
  try {
    return code === 0 && (JSON.parse(stdout).runtimes ?? []).some((r: any) => r?.isAvailable && /\.iOS-/.test(String(r.identifier)))
  } catch {
    return false
  }
}

export async function simulatorSetup(): Promise<Step> {
  const xcode = await xcodeState()
  return simulatorStep({ xcode, hasRuntime: xcode === "ok" && (await hasIosRuntime()), hasAxe: !!axe(), job })
}

/** AXe from Homebrew, in the background: Setup reads how it goes. */
export function installAxe() {
  if (job?.phase === "brew") return
  job = { phase: "brew" }
  void (async () => {
    try {
      const brew = Bun.which("brew", { PATH: BREW_PATH })
      if (!brew) throw new Error("Homebrew (brew.sh) is needed to install AXe")
      const { code, stderr } = await exec([brew, "install", "cameroncooke/axe/axe"], { timeoutMs: 15 * 60_000 })
      if (code !== 0) throw new Error(stderr.trim().split("\n").at(-1) || "brew install failed")
      job = null
    } catch (err) {
      job = { phase: "error", error: (err as Error).message }
    }
  })()
}

// ---------- what you do on the picture ----------

const KEYS: Record<string, number> = { enter: 40, escape: 41, backspace: 42, tab: 43, space: 44, right: 79, left: 80, down: 81, up: 82 } // HID
const BUTTONS = new Set(["home", "lock", "siri"])
const MAX_POINT = 5000
const point = (v: unknown) => (typeof v === "number" && v >= 0 && v <= MAX_POINT ? Math.round(v) : null)
const seconds = (v: unknown, min: number, max: number, fallback: number) => Math.round(Math.min(max, Math.max(min, typeof v === "number" && Number.isFinite(v) ? v : fallback)) * 100) / 100

/** One action from the page as the line `axe serve` reads, or null when it is not one (text goes apart: typeText). */
export function commandFor(action: any): string | null {
  const [x, y] = [point(action?.x), point(action?.y)]
  switch (action?.kind) {
    case "tap": return x === null || y === null ? null : `tap -x ${x} -y ${y}`
    case "hold": return x === null || y === null ? null : `tap -x ${x} -y ${y} --hold ${seconds(action.seconds, 0.5, 5, 1)}`
    case "swipe": {
      const [toX, toY] = [point(action.toX), point(action.toY)]
      return x === null || y === null || toX === null || toY === null ? null : `swipe --start-x ${x} --start-y ${y} --end-x ${toX} --end-y ${toY} --duration ${seconds(action.seconds, 0.1, 3, 0.3)}`
    }
    case "key": return Object.hasOwn(KEYS, action.name) ? `key ${KEYS[action.name]}` : null
    case "button": return BUTTONS.has(action.name) ? `button ${action.name}` : null
    default: return null
  }
}

// ---------- one `axe serve` per simulator ----------

const IDLE_MS = 120_000
const ANSWER_MS = 20_000
const MAX_TEXT = 2000

type Serve = { proc: ReturnType<typeof Bun.spawn>; waiting: ((line: string) => void)[]; idle: ReturnType<typeof setTimeout> | null; screen: Promise<Screen | null> | null }
const serving = new Map<string, Serve>()

function close(udid: string) {
  const s = serving.get(udid)
  if (!s) return
  serving.delete(udid)
  if (s.idle) clearTimeout(s.idle)
  s.proc.kill()
  for (const answer of s.waiting) answer("")
}

async function readAnswers(udid: string, s: Serve) {
  const decoder = new TextDecoder()
  let rest = ""
  for await (const chunk of s.proc.stdout as ReadableStream<Uint8Array>) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n")
    rest = lines.pop() ?? ""
    for (const line of lines) s.waiting.shift()?.(line)
  }
  if (serving.get(udid) === s) close(udid) // it ended on its own (the simulator shut down)
}

function serveOf(udid: string): Serve | null {
  const known = serving.get(udid)
  if (known) return known
  const bin = axe()
  if (!bin) return null
  const proc = Bun.spawn([bin, "serve", "--udid", udid], { stdin: "pipe", stdout: "pipe", stderr: "ignore" })
  const s: Serve = { proc, waiting: [() => {}], idle: null, screen: null } // the first line it prints: ready
  serving.set(udid, s)
  void readAnswers(udid, s)
  return s
}

// One command, answered in its turn: AXe's JSON line, or null when it failed or never came.
function ask(udid: string, command: string): Promise<any | null> {
  const s = serveOf(udid)
  if (!s) return Promise.resolve(null)
  if (s.idle) clearTimeout(s.idle)
  s.idle = setTimeout(() => close(udid), IDLE_MS)
  return new Promise(resolve => {
    const late = setTimeout(() => (close(udid), resolve(null)), ANSWER_MS)
    s.waiting.push(line => {
      clearTimeout(late)
      let answer: any = null
      try {
        answer = JSON.parse(line)
      } catch {}
      resolve(answer && !answer.didError ? answer : null)
    })
    const stdin = s.proc.stdin as import("bun").FileSink
    stdin.write(`${command}\n`)
    stdin.flush()
  })
}

// The first frame in AXe's accessibility tree: the whole screen, in points.
function frameIn(node: any): Screen | null {
  if (!node || typeof node !== "object") return null
  const f = node.frame
  if (f && typeof f.width === "number" && typeof f.height === "number" && f.width > 0 && f.height > 0) return { width: f.width, height: f.height }
  for (const child of Array.isArray(node) ? node : Object.values(node)) {
    const found = frameIn(child)
    if (found) return found
  }
  return null
}

/** The screen's size in points (what a tap's x and y count in), read once per `axe serve`. */
export function screenOf(udid: string): Promise<Screen | null> {
  const s = serveOf(udid)
  if (!s) return Promise.resolve(null)
  return (s.screen ??= ask(udid, "describe-ui").then(frameIn))
}

async function typeText(udid: string, text: string) {
  // Through a file: no quoting to get wrong, whatever the text holds.
  const file = join(tmpdir(), `agent-center-type-${udid}.txt`)
  await Bun.write(file, text)
  return ask(udid, `type --file ${file}`)
}

/** One action from the page, done on the simulator; an error's text when it could not be. */
export async function act(udid: string, action: any): Promise<string | null> {
  if (!axe()) return "AXe is not installed: Settings → Setup → iOS simulator"
  if (action?.kind === "text") {
    if (typeof action.text !== "string" || !action.text || action.text.length > MAX_TEXT) return "No text to type"
    return (await typeText(udid, action.text)) ? null : "The simulator did not take the text (is a field focused?)"
  }
  const command = commandFor(action)
  if (!command) return "Not something a simulator does"
  return (await ask(udid, command)) ? null : "The simulator did not answer"
}

// ---------- the picture ----------

const HEADERS_END = [13, 10, 13, 10] // \r\n\r\n

/** AXe's stream without the HTTP answer it starts with; null while that answer is not whole. */
export function withoutPreamble(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 72 /* H */) return bytes
  for (let i = 0; i + 3 < bytes.length; i++) if (HEADERS_END.every((b, k) => bytes[i + k] === b)) return bytes.subarray(i + 4)
  return null
}

/** The simulator's screen as it changes (multipart JPEG), until the page stops reading: its process ends with it. */
export function stream(udid: string): Response {
  const bin = axe()
  if (!bin) return new Response("AXe is not installed", { status: 503 })
  const proc = Bun.spawn([bin, "stream-video", "--udid", udid, "--format", "mjpeg", "--fps", "6", "--scale", "0.5", "--quality", "70"], { stdout: "pipe", stderr: "ignore" })
  const stop = () => proc.kill()
  let head: Uint8Array | null = new Uint8Array(0) // until the preamble is past
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
          if (!head) {
            controller.enqueue(chunk)
            continue
          }
          const joined = new Uint8Array(head.length + chunk.length)
          joined.set(head)
          joined.set(chunk, head.length)
          const rest = withoutPreamble(joined)
          head = rest ? null : joined
          if (rest?.length) controller.enqueue(rest)
        }
      } catch {}
      stop()
      try {
        controller.close()
      } catch {}
    },
    cancel: stop,
  })
  return new Response(body, { headers: { "content-type": "multipart/x-mixed-replace; boundary=mjpegstream", "cache-control": "no-store" } })
}
