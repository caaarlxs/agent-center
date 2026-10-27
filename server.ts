// Agent Center: a local board of every Claude Code session and what it waits for.
//
// Sources:
//   ~/.claude/session-inbox/<id>.json  automatic state, written only by the hook
//                                      hooks/session-inbox.py (lib/sessions.ts)
//   data/board.json                    the person's own state (pins, parks, done,
//                                      canvas), written only here (lib/board.ts)
//   Claude desktop session records     titles, archived, starred (read-only, lib/desktop.ts)
//   ~/.claude/projects/*.jsonl         conversations (lib/transcript.ts, lib/search.ts)
//   ~/.claude/agent-center             messages and answers to sessions, delivered by
//                                      the bridge mod in bridge/ (lib/bridge.ts)
//   ~/organizer                        tasks, optional (lib/organizer.ts, lib/task-links.ts)
//
// The routes are in routes/; this file guards them, serves the page and starts
// the background work. Run: bun run server.ts (./install.sh puts it under launchd).

import { watch } from "node:fs"
import { mkdir } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { loadBoard } from "./lib/board"
import { activate } from "./lib/client"
import { HOSTS, ORIGINS, PORT, PUBLIC_DIR, SESSIONS_DIR } from "./lib/config"
import { json } from "./lib/http"
import { refreshSoon, startLive } from "./lib/live"
import { monacoFile } from "./lib/monaco"
import { stopAllCommands } from "./lib/commands"
import { stopAll as stopRuns } from "./lib/runner"
import { MAX_UPLOAD_BYTES } from "./lib/uploads"
import { deliverHere } from "./lib/deliver"
import { startWaking } from "./lib/wake"
import { handleRead } from "./routes/read"
import { handleSession } from "./routes/session"
import { handleUpload, handleWrite } from "./routes/write"

const forbidden = () => json({ error: "forbidden" }, 403)

// Who may call. The server listens on 127.0.0.1 only; on top of that:
// - Host must be this server's own name, so a page on another name that
//   resolves here (DNS rebinding) reads nothing.
// - On the API, a request another site starts (Origin, Sec-Fetch-Site) is
//   refused, and anything that changes state needs the x-agent-center header,
//   which a page on another site cannot add without a preflight never answered.
function isAllowed(req: Request, path: string) {
  if (!HOSTS.has(req.headers.get("host") ?? "")) return false
  if (!path.startsWith("/api/")) return true
  const origin = req.headers.get("origin")
  if (origin && !ORIGINS.has(origin)) return false
  const site = req.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") return false
  return req.method === "GET" || req.headers.get("x-agent-center") === "1"
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  if (!isAllowed(req, path)) return forbidden()

  if (path.startsWith("/api/")) {
    if (req.method === "GET") return (await handleRead(url)) ?? json({ error: "not found" }, 404)
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405)
    const raw = await handleUpload(req, path)
    if (raw) return raw
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const global = await handleWrite(path, body)
    if (global) return global
    const session = path.match(/^\/api\/sessions\/([\w-]+)\/(\w+)$/)
    return session ? handleSession(session[1]!, session[2]!, body) : json({ error: "not found" }, 404)
  }

  // The code editor, downloaded on first use (lib/monaco.ts).
  if (path.startsWith("/vendor/monaco/")) {
    const asset = await monacoFile(path.slice("/vendor/monaco".length))
    return asset ? new Response(asset, { headers: { "cache-control": "max-age=86400" } }) : new Response("Not found", { status: 404 })
  }

  // The page itself. no-cache: every load asks for the current files (they are local and small).
  const file = resolve(PUBLIC_DIR, `.${path === "/" ? "/index.html" : decodeURIComponent(path)}`)
  if (!file.startsWith(PUBLIC_DIR + sep)) return new Response("Not found", { status: 404 })
  const asset = Bun.file(file)
  return (await asset.exists()) ? new Response(asset, { headers: { "cache-control": "no-cache" } }) : new Response("Not found", { status: 404 })
}

await loadBoard()
await mkdir(SESSIONS_DIR, { recursive: true })
watch(SESSIONS_DIR, refreshSoon)
startLive()
startWaking(activate, deliverHere)

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 0, // the SSE stream stays open
  maxRequestBodySize: MAX_UPLOAD_BYTES + 1024 * 1024, // a file sent from the board
  fetch: route,
  error(err) {
    console.error(err)
    return json({ error: "internal error" }, 500)
  },
})

// Going down (launchd stop, Ctrl-C): the projects started with "Run" and the
// commands started with "▶" go too.
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => void Promise.all([stopRuns(), stopAllCommands()]).finally(() => process.exit(0)))

console.log(`agent-center on http://localhost:${PORT}`)
