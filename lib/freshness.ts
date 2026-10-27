// After a `git pull`: what still runs older code than the repository holds.
// The server reads its own files once, as it starts, so it is stale when they
// change on disk. The page (web/, built into web/dist) is stale when one of
// its sources is newer than its build, and an open page compares the print
// of the build with the one it loaded. The hook and the bridge mod are
// Setup's own steps ("outdated"). "Update" (POST /api/update) builds the
// page, brings the rest up to date and restarts the server.

import { stat } from "node:fs/promises"
import { join } from "node:path"
import { APP_DIR } from "./config"
import { bridgeState, hookState, runStep } from "./setup"

const SERVER = ["server.ts", "package.json", "lib/**/*.ts", "routes/**/*.ts"]
const PAGE = ["web/dist/**/*"]
const WEB_SOURCES = ["web/src/**/*", "web/public/**/*", "web/index.html", "web/package.json", "web/bun.lock", "web/vite.config.ts", "web/tsconfig*.json", "lib/**/*.ts"]
const CACHE_MS = 5000 // the snapshot asks every second
const LABEL = "local.agent-center" // install.sh's launchd job, which starts it again

export type Freshness = { server: boolean; web: WebState; page: string; hook: boolean; bridge: boolean }
export type WebState = "fresh" | "stale" | "missing"

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

// The page's build against its sources (lib/ too: the page imports its types).
export async function webState(root: string): Promise<WebState> {
  const built = await stat(join(root, "web", "dist", "index.html")).catch(() => null)
  if (!built) return "missing"
  for (const pattern of WEB_SOURCES)
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true })) {
      const info = await stat(join(root, path)).catch(() => null)
      if (info && info.mtimeMs > built.mtimeMs) return "stale"
    }
  return "fresh"
}

// Builds the page: its packages first (the first time, or after a pull that
// changed them), then the bundle. Throws with the tool's last words.
async function buildWeb() {
  const run = async (cmd: string[]) => {
    const proc = Bun.spawn(cmd, { cwd: join(APP_DIR, "web"), stdout: "pipe", stderr: "pipe" })
    const [code, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    if (code !== 0) throw new Error(`${cmd.join(" ")} failed: ${(err || out).trim().split("\n").slice(-6).join("\n")}`)
  }
  await run([process.execPath, "install", "--frozen-lockfile"])
  await run([process.execPath, "x", "--bun", "vite", "build"])
}

const atStart = printOf(APP_DIR, SERVER)
let cached: { at: number; value: Freshness } | null = null

export async function freshness({ fresh = false } = {}): Promise<Freshness> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value
  const [server, web, page, hook, bridge] = await Promise.all([printOf(APP_DIR, SERVER), webState(APP_DIR), printOf(APP_DIR, PAGE), hookState(), bridgeState()])
  const value = { server: server !== (await atStart), web, page, hook: hook === "outdated", bridge: bridge === "outdated" }
  cached = { at: Date.now(), value }
  return value
}

// Everything stale brought up to date; the server starts again under launchd
// (anywhere else it says it needs a restart). The page reloads itself.
export async function update() {
  const now = await freshness({ fresh: true })
  if (now.web !== "fresh") await buildWeb()
  if (now.hook) await runStep("hook")
  if (now.bridge) await runStep("bridge")
  const isRestarting = now.server && process.env.XPC_SERVICE_NAME === LABEL
  if (isRestarting) setTimeout(() => process.exit(0), 300) // after the answer; launchd's KeepAlive starts it again
  cached = null
  return { ok: true, isRestarting, needsRestart: now.server && !isRestarting }
}
