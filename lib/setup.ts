// Setting this Mac up for the board, one step at a time and only with the
// person's yes (the setup dialog asks; install.sh only starts the server).
// Each step answers its state and, where the board can do it, does it:
//
//   claude     Claude desktop is installed                    (checked only)
//   hook       hooks/session-inbox.py in ~/.claude/hooks and its entries in
//              ~/.claude/settings.json                         (required)
//   bridge     the bridge mod, from this folder's marketplace (required)
//   uploads    Claude may read the files sent from the board  (recommended)
//   whisper    dictation on this Mac: whisper-cpp, ffmpeg and the model
//   organizer  tasks: ~/organizer/organizer.py and a note in ~/.claude/CLAUDE.md
//   github     the gh CLI, signed in, for PRs                 (checked only)
//
// settings.json is backed up once before the first change, and every change
// can be undone (undoAll, for uninstall.sh).

import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { APP_DIR, CLAUDE_DIR, HOME, MODELS_DIR, SETTINGS_PATH, settings, type Settings } from "./config"
import { readJson, writeJsonAtomic } from "./files"
import { claudeBinary } from "./launch"
import { exec } from "./proc"

export type StepState = "done" | "missing" | "outdated" | "working" | "unavailable"
export type Step = { id: string; state: StepState; detail?: string; progress?: number }

const CLAUDE_SETTINGS = join(CLAUDE_DIR, "settings.json")
const HOOK_SOURCE = join(APP_DIR, "hooks", "session-inbox.py")
const HOOK_PATH = join(CLAUDE_DIR, "hooks", "session-inbox.py")
const HOOK_COMMAND = `python3 "${HOOK_PATH}"`
const HOOK_EVENTS = ["UserPromptSubmit", "Stop", "Notification", "SessionEnd"]
// The tools that hold the turn until the person answers in the app.
const WAITING_TOOLS = "AskUserQuestion|ExitPlanMode|mcp__ccd_directory__propose_branch|mcp__ccd_directory__change_directory|mcp__ccd_directory__request_directory|mcp__ccd_session__start_session"
const UPLOADS_RULE = "Read(~/.claude/agent-center/uploads/**)"
const PLUGIN = "agent-center-bridge@agent-center"
const MODEL = "ggml-large-v3-turbo-q5_0.bin"
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL}`
const ORGANIZER_DIR = join(HOME, "organizer")
const ORGANIZER = join(ORGANIZER_DIR, "organizer.py")
const ORGANIZER_RULE = "Bash(python3 ~/organizer/organizer.py:*)"
const MEMORY_PATH = join(CLAUDE_DIR, "CLAUDE.md")
const NOTE_START = "<!-- agent-center:organizer -->"
const NOTE_END = "<!-- /agent-center:organizer -->"

const exists = (path: string) => stat(path).then(() => true, () => false)
const brewPath = `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`
const which = (name: string) => Bun.which(name, { PATH: brewPath })

// ---------- ~/.claude/settings.json ----------

type ClaudeSettings = {
  hooks?: Record<string, { matcher?: string; hooks: { type: string; command: string }[] }[]>
  permissions?: { allow?: string[] }
  [key: string]: unknown
}

async function readClaudeSettings(): Promise<ClaudeSettings> {
  try {
    return await readJson(CLAUDE_SETTINGS)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw new Error("~/.claude/settings.json is not valid JSON: fix it before you continue")
  }
}

// Backed up once, the first time the board changes it.
async function writeClaudeSettings(value: ClaudeSettings) {
  const backup = `${CLAUDE_SETTINGS}.before-agent-center`
  if ((await exists(CLAUDE_SETTINGS)) && !(await exists(backup))) await copyFile(CLAUDE_SETTINGS, backup)
  await writeJsonAtomic(CLAUDE_SETTINGS, value, { pretty: true })
}

const isOurHook = (command: string) => command.includes("session-inbox.py")

function hookEntriesMissing(s: ClaudeSettings) {
  const has = (event: string) => (s.hooks?.[event] ?? []).some(group => group.hooks.some(h => isOurHook(h.command)))
  return [...HOOK_EVENTS, "PreToolUse", "PostToolUse"].filter(event => !has(event))
}

// Installed, and the same as this repository's copy (a `git pull` can bring
// a newer one: then "outdated").
export async function hookState(s?: ClaudeSettings): Promise<StepState> {
  const mine = s ?? (await readClaudeSettings().catch(() => ({}) as ClaudeSettings))
  if (!(await exists(HOOK_PATH)) || hookEntriesMissing(mine).length > 0) return "missing"
  const [source, copy] = await Promise.all([readFile(HOOK_SOURCE, "utf8"), readFile(HOOK_PATH, "utf8")])
  return source === copy ? "done" : "outdated"
}

async function installHook() {
  await mkdir(join(CLAUDE_DIR, "hooks"), { recursive: true })
  await copyFile(HOOK_SOURCE, HOOK_PATH)
  const s = await readClaudeSettings()
  s.hooks ??= {}
  for (const event of hookEntriesMissing(s)) {
    const matcher = event === "PreToolUse" || event === "PostToolUse" ? WAITING_TOOLS : ""
    ;(s.hooks[event] ??= []).push({ matcher, hooks: [{ type: "command", command: HOOK_COMMAND }] })
  }
  await writeClaudeSettings(s)
}

async function allow(rule: string) {
  const s = await readClaudeSettings()
  s.permissions ??= {}
  s.permissions.allow ??= []
  if (!s.permissions.allow.includes(rule)) s.permissions.allow.push(rule)
  await writeClaudeSettings(s)
}

// ---------- the bridge mod ----------

async function pluginVersions() {
  const wanted = (await readJson(join(APP_DIR, "bridge", ".claude-plugin", "plugin.json"))).version as string
  let installed: string | null = null
  try {
    const all = await readJson(join(CLAUDE_DIR, "plugins", "installed_plugins.json"))
    installed = all.plugins?.[PLUGIN]?.[0]?.version ?? null
  } catch {}
  return { wanted, installed }
}

export async function bridgeState(): Promise<StepState> {
  const { wanted, installed } = await pluginVersions()
  return !installed ? "missing" : Bun.semver.order(installed, wanted) < 0 ? "outdated" : "done"
}

async function claude(args: string[]) {
  const { code, stdout, stderr } = await exec([await claudeBinary(), ...args], { timeoutMs: 120_000 })
  if (code !== 0) throw new Error((stderr || stdout).trim().split("\n").at(-1) || `claude ${args.join(" ")} failed`)
}

async function installBridge() {
  const { installed } = await pluginVersions()
  // The marketplace is this folder: adding it again is harmless, and an update
  // reads the files as they are now.
  await claude(["plugin", "marketplace", "add", APP_DIR]).catch(() => claude(["plugin", "marketplace", "update", "agent-center"]))
  await claude(["plugin", "marketplace", "update", "agent-center"])
  await claude(installed ? ["plugin", "update", PLUGIN] : ["plugin", "install", PLUGIN])
}

// ---------- Whisper ----------

let whisperJob: { error?: string; progress?: number; phase: string } | null = null

async function downloadModel() {
  await mkdir(MODELS_DIR, { recursive: true })
  const res = await fetch(MODEL_URL)
  if (!res.ok || !res.body) throw new Error(`could not download the model (${res.status})`)
  const total = Number(res.headers.get("content-length")) || 0
  const tmp = join(MODELS_DIR, `${MODEL}.download`)
  const out = Bun.file(tmp).writer()
  let got = 0
  for await (const chunk of res.body) {
    out.write(chunk)
    got += chunk.length
    if (total && whisperJob) whisperJob.progress = got / total
  }
  await out.end()
  await rename(tmp, join(MODELS_DIR, MODEL))
}

// In the background: Homebrew takes minutes and the model is 550 MB.
function installWhisper() {
  if (whisperJob && !whisperJob.error) return
  whisperJob = { phase: "brew" }
  void (async () => {
    try {
      if (!which("whisper-cli") || !which("ffmpeg")) {
        const brew = which("brew")
        if (!brew) throw new Error("Homebrew (brew.sh) is needed to install whisper-cpp and ffmpeg")
        const { code, stderr } = await exec([brew, "install", "whisper-cpp", "ffmpeg"], { timeoutMs: 30 * 60_000 })
        if (code !== 0) throw new Error(stderr.trim().split("\n").at(-1) || "brew install failed")
      }
      whisperJob = { phase: "model", progress: 0 }
      if (!(await exists(join(MODELS_DIR, MODEL)))) await downloadModel()
      whisperJob = null
    } catch (err) {
      whisperJob = { phase: "error", error: (err as Error).message }
    }
  })()
}

// ---------- organizer ----------

const ORGANIZER_NOTE = `${NOTE_START}
## Tasks (Agent Center)

Keep a task list with \`python3 ~/organizer/organizer.py\`. When the conversation leaves real pending work (a TODO, something deferred, a bug found and not fixed), add it: \`python3 ~/organizer/organizer.py add "<short text>"\` (\`--inbox\` when it belongs to no project). When a tracked task is done, close it: find it with \`python3 ~/organizer/organizer.py list --all\`, then \`python3 ~/organizer/organizer.py done <project>:<idx>\`. Mention each in one line. Be conservative: skip hypotheticals and anything finished in the same turn.
${NOTE_END}`

async function hasOrganizerNote() {
  const text = await readFile(MEMORY_PATH, "utf8").catch(() => "")
  return text.includes(NOTE_START) || text.includes("organizer.py")
}

async function installOrganizer() {
  await mkdir(ORGANIZER_DIR, { recursive: true })
  if (!(await exists(ORGANIZER))) await copyFile(join(APP_DIR, "extras", "organizer", "organizer.py"), ORGANIZER)
  if (!(await exists(join(ORGANIZER_DIR, "config.json")))) await writeFile(join(ORGANIZER_DIR, "config.json"), JSON.stringify({ projects: [] }, null, 2))
  if (!(await exists(join(ORGANIZER_DIR, "inbox.md")))) await writeFile(join(ORGANIZER_DIR, "inbox.md"), "# Inbox\n\n")
  if (!(await hasOrganizerNote())) {
    const before = await readFile(MEMORY_PATH, "utf8").catch(() => "")
    if (before && !(await exists(`${MEMORY_PATH}.before-agent-center`))) await writeFile(`${MEMORY_PATH}.before-agent-center`, before)
    await writeFile(MEMORY_PATH, `${before.trimEnd()}${before ? "\n\n" : ""}${ORGANIZER_NOTE}\n`)
  }
  await allow(ORGANIZER_RULE)
  await saveSettings({ organizer: true })
}

export async function isOrganizerOn() {
  return settings.organizer !== false && (await exists(ORGANIZER))
}

// ---------- the person's choices ----------

export async function saveSettings(change: Partial<Settings>) {
  Object.assign(settings, change)
  await writeJsonAtomic(SETTINGS_PATH, settings, { pretty: true })
}

// ---------- status and actions ----------

export async function setupStatus(): Promise<{ steps: Step[]; isReady: boolean; voiceLanguage: string; organizerNote: string }> {
  const s = await readClaudeSettings().catch(() => ({}) as ClaudeSettings)
  const { installed } = await pluginVersions()
  const ghAuth = which("gh") ? (await exec([which("gh")!, "auth", "status"], { timeoutMs: 8000 })).code === 0 : false
  const whisperReady = !!which("whisper-cli") && !!which("ffmpeg") && (await exists(join(MODELS_DIR, MODEL)))
  const steps: Step[] = [
    { id: "claude", state: (await exists("/Applications/Claude.app")) ? "done" : "unavailable" },
    { id: "hook", state: await hookState(s) },
    { id: "bridge", state: await bridgeState(), detail: installed ?? undefined },
    { id: "uploads", state: s.permissions?.allow?.includes(UPLOADS_RULE) ? "done" : "missing" },
    whisperJob
      ? { id: "whisper", state: whisperJob.error ? "missing" : "working", detail: whisperJob.error ?? whisperJob.phase, progress: whisperJob.progress }
      : { id: "whisper", state: whisperReady ? "done" : "missing" },
    { id: "organizer", state: (await isOrganizerOn()) ? "done" : "missing", detail: (await exists(ORGANIZER)) ? "found" : undefined },
    { id: "commands", state: settings.runCommands === true ? "done" : "missing" },
    { id: "github", state: ghAuth ? "done" : which("gh") ? "missing" : "unavailable", detail: ghAuth ? undefined : which("gh") ? "signed-out" : "not-installed" },
  ]
  const isReady = steps.filter(x => ["hook", "bridge"].includes(x.id)).every(x => x.state === "done")
  const organizerNote = ORGANIZER_NOTE.replace(NOTE_START, "").replace(NOTE_END, "").trim()
  return { steps, isReady, voiceLanguage: settings.voiceLanguage ?? "auto", organizerNote }
}

export async function runStep(id: string, options: Record<string, unknown> = {}) {
  switch (id) {
    case "hook":
      return installHook()
    case "bridge":
      return installBridge()
    case "uploads":
      return allow(UPLOADS_RULE)
    case "whisper":
      if (typeof options.voiceLanguage === "string" && /^(auto|[a-z]{2})$/.test(options.voiceLanguage))
        await saveSettings({ voiceLanguage: options.voiceLanguage })
      return installWhisper()
    case "organizer":
      return options.off ? saveSettings({ organizer: false }) : installOrganizer()
    case "commands":
      return saveSettings({ runCommands: !options.off })
  }
  throw new Error(`unknown step: ${id}`)
}

// Everything installHook, allow and installBridge added, taken out again
// (uninstall.sh). The organizer, its tasks and the note stay: they are the
// person's now. The Whisper tools stay too (Homebrew owns them).
export async function undoAll() {
  const s = await readClaudeSettings()
  for (const [event, groups] of Object.entries(s.hooks ?? {})) {
    const kept = groups.map(g => ({ ...g, hooks: g.hooks.filter(h => !isOurHook(h.command)) })).filter(g => g.hooks.length)
    if (kept.length) s.hooks![event] = kept
    else delete s.hooks![event]
  }
  if (s.permissions?.allow) s.permissions.allow = s.permissions.allow.filter(rule => rule !== UPLOADS_RULE)
  await writeClaudeSettings(s)
  await claude(["plugin", "uninstall", PLUGIN]).catch(() => {})
  await claude(["plugin", "marketplace", "remove", "agent-center"]).catch(() => {})
}
