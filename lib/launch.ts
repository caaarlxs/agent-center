// New sessions started from the board with their first message already sent:
// the first turn runs headless (`claude -p`) in the chosen folder, shows up on
// the board through the hooks, and then moves into the desktop app
// (claude://resume?session=<id> imports it there, keeping its id).

import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { DESKTOP_DIR } from "./config"
import { claudeEnv } from "./proc"

const APP_CLI = join(DESKTOP_DIR, "claude-code")
const ID_TIMEOUT_MS = 30_000

// Sessions whose headless first turn still runs: opening them in the app now
// would put two processes on one transcript.
export const running = new Set<string>()

// The newest Claude Code the desktop app ships (it loads the bridge mod).
export async function claudeBinary() {
  if (process.env.AGENT_CENTER_CLAUDE) return process.env.AGENT_CENTER_CLAUDE
  const versions = (await readdir(APP_CLI).catch(() => [] as string[]))
    .filter(v => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  for (const version of versions.reverse()) {
    for (const build of await readdir(join(APP_CLI, version)).catch(() => [] as string[])) {
      const bin = join(APP_CLI, version, build, "claude.app", "Contents", "MacOS", "claude")
      if (await Bun.file(bin).exists()) return bin
    }
  }
  return "claude"
}

// Starts the session and resolves its id as soon as Claude Code reports it.
// `onDone(id)` runs when the first turn ends well.
// `extraArgs`: more flags for Claude Code (a fork's --resume …). `mode`: the
// permission mode the turn runs in.
export async function launch(folder: string, prompt: string, onDone?: (id: string) => void, extraArgs: string[] = [], mode = "auto"): Promise<string> {
  // The prompt goes after "--", so one that starts with "-" is never a flag.
  const proc = Bun.spawn(
    [await claudeBinary(), "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", mode, ...extraArgs, "--", prompt],
    { cwd: folder, env: claudeEnv({ AGENT_CENTER_LAUNCH: "1" }), stdout: "pipe", stderr: "ignore", stdin: "ignore" },
  )
  return new Promise((resolve, reject) => {
    let id: string | null = null
    // No id in time: the process is stuck, so it goes too.
    const timer = setTimeout(() => !id && (proc.kill(), reject(new Error("Claude Code did not start the session"))), ID_TIMEOUT_MS)
    ;(async () => {
      const decoder = new TextDecoder()
      let buffer = ""
      for await (const chunk of proc.stdout) {
        buffer += decoder.decode(chunk, { stream: true })
        let nl: number
        while (!id && (nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          try {
            const msg = JSON.parse(line)
            if (msg.session_id) {
              id = msg.session_id as string
              running.add(id)
              clearTimeout(timer)
              resolve(id)
            }
          } catch {}
        }
        if (id) buffer = "" // the rest is the turn itself: the transcript has it
      }
    })().catch(() => {})
    proc.exited.then(code => {
      if (id) {
        running.delete(id)
        if (code === 0) onDone?.(id)
      }
      else (clearTimeout(timer), reject(new Error(`Claude Code ended without a session (code ${code})`)))
    })
  })
}
