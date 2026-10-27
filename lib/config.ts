// Where everything lives, in one place. The code stays where it was cloned;
// the server's own state (board, logs, the Whisper model, settings) lives in
// ~/Library/Application Support/Agent Center; Claude Code's files are read
// where Claude Code keeps them.
//
// Environment overrides: AGENT_CENTER_HOME (the state folder),
// AGENT_CENTER_DATA (its data/ alone; the tests use it), AGENT_CENTER_PORT,
// AGENT_CENTER_CLAUDE (the Claude Code to run headless; the tests give a stand-in).

import { readFileSync } from "node:fs"
import { join } from "node:path"

export const HOME = process.env.HOME ?? ""
export const APP_DIR = join(import.meta.dir, "..")
export const PUBLIC_DIR = join(APP_DIR, "public")

export const STATE_DIR = process.env.AGENT_CENTER_HOME || join(HOME, "Library", "Application Support", "Agent Center")
export const DATA_DIR = process.env.AGENT_CENTER_DATA || join(STATE_DIR, "data")
export const LOGS_DIR = join(STATE_DIR, "logs")
export const MODELS_DIR = join(STATE_DIR, "models")
export const SETTINGS_PATH = join(STATE_DIR, "settings.json")

export const CLAUDE_DIR = join(HOME, ".claude")
export const PROJECTS_DIR = join(CLAUDE_DIR, "projects") // transcripts
export const SESSIONS_DIR = join(CLAUDE_DIR, "session-inbox") // written by hooks/session-inbox.py
export const CENTER_DIR = join(CLAUDE_DIR, "agent-center") // shared with the bridge mod
export const DESKTOP_DIR = join(HOME, "Library", "Application Support", "Claude") // Claude desktop's own data
export const DESKTOP_LOG = join(HOME, "Library", "Logs", "Claude", "main.log")

// The person's choices, made in the setup dialog (lib/setup.ts writes them).
// voiceLanguage: what Whisper listens for ("auto", "en", "es"…).
// runCommands: "▶" on the shell blocks of a conversation (lib/commands.ts).
export type Settings = { voiceLanguage?: string; organizer?: boolean; runCommands?: boolean }
function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"))
  } catch {
    return {}
  }
}
export const settings: Settings = readSettings()

// Set at install (./install.sh writes it into the launchd agent).
export const PORT = Number(process.env.AGENT_CENTER_PORT || 7777)
export const ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`])
export const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`])

// The permission modes and effort levels Claude Code takes.
export const MODES = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"]
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"]
