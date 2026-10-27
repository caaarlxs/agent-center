// After a `git pull`: what still runs older code than the repository holds.
// The server reads its own files once, as it starts, so it is stale when they
// change on disk. The page compares the print of its files with the one it
// loaded. The hook and the bridge mod are Setup's own steps ("outdated").
// "Update" (POST /api/update) brings each up to date and restarts the server.

import { stat } from "node:fs/promises"
import { join } from "node:path"
import { APP_DIR } from "./config"
import { bridgeState, hookState, runStep } from "./setup"

const SERVER = ["server.ts", "package.json", "lib/**/*.ts", "routes/**/*.ts"]
const PAGE = ["public/**/*"]
const CACHE_MS = 5000 // the snapshot asks every second
const LABEL = "local.agent-center" // install.sh's launchd job, which starts it again

export type Freshness = { server: boolean; page: string; hook: boolean; bridge: boolean }

// The files under `root` that `patterns` name, by path, time and size.
export async function printOf(root: string, patterns: string[]) {
  const rows: string[] = []
  for (const pattern of patterns)
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true })) {
      const info = await stat(join(root, path)).catch(() => null)
      if (info) rows.push(`${path}:${info.mtimeMs}:${info.size}`)
    }
  return Bun.hash(rows.sort().join("\n")).toString(36)
}

const atStart = printOf(APP_DIR, SERVER)
let cached: { at: number; value: Freshness } | null = null

export async function freshness({ fresh = false } = {}): Promise<Freshness> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value
  const [server, page, hook, bridge] = await Promise.all([printOf(APP_DIR, SERVER), printOf(APP_DIR, PAGE), hookState(), bridgeState()])
  const value = { server: server !== (await atStart), page, hook: hook === "outdated", bridge: bridge === "outdated" }
  cached = { at: Date.now(), value }
  return value
}

// Everything stale brought up to date; the server starts again under launchd
// (anywhere else it says it needs a restart). The page reloads itself.
export async function update() {
  const now = await freshness({ fresh: true })
  if (now.hook) await runStep("hook")
  if (now.bridge) await runStep("bridge")
  const isRestarting = now.server && process.env.XPC_SERVICE_NAME === LABEL
  if (isRestarting) setTimeout(() => process.exit(0), 300) // after the answer; launchd's KeepAlive starts it again
  cached = null
  return { ok: true, isRestarting, needsRestart: now.server && !isRestarting }
}
