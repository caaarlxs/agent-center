// What changes in an open session, told as it happens (server-sent events),
// so its conversation reads only then instead of asking every two seconds:
//   messages  its transcript grew
//   bridge    its mod wrote for it: a message taken or refused, a question,
//             an approval, a settings answer, or a beat that changes whether
//             a turn runs (a beat alone changes nothing the page shows)
//   stream    the answer as the model writes it (mod v10), sent along:
//             { turnId, step, text, done, at }
// Folders are watched, not files: a write that replaces a file (atomic, as
// the mod's and this server's) would leave a watch on the old one.

import { watch, type FSWatcher } from "node:fs"
import { mkdir, readFile, stat } from "node:fs/promises"
import { basename, dirname, join, relative, sep } from "node:path"
import { CENTER_DIR } from "./config"
import { transcriptPath } from "./transcript"

type Kind = "messages" | "bridge" | "stream"
const SETTLE_MS = 60 // a burst of writes is told once
const PING_MS = 20_000 // keeps the connection open through idle proxies

// From a path under the bridge's folder, the session it is about:
// "acks/<id>.json", "alive/<id>.json", "outbox/<id>/<msg>.json".
function sessionOf(path: string) {
  const [folder, name] = path.split(sep)
  return folder === "outbox" ? name : name?.replace(/\.json$/, "")
}

export async function sessionEvents(ids: string[], lead: string): Promise<Response> {
  const mine = new Set(ids)
  const transcript = await transcriptPath(lead)
  await mkdir(CENTER_DIR, { recursive: true }) // watched before the mod first writes
  const watchers: FSWatcher[] = []
  const timers = new Map<Kind, ReturnType<typeof setTimeout>>()
  let send: (text: string) => void = () => {}
  let lastBusy: string | null = null

  // `data`, read when the burst settles: what the event carries (the stream's text).
  const tell = (kind: Kind, data: () => Promise<string> = async () => String(Date.now())) => {
    if (timers.has(kind)) return
    timers.set(kind, setTimeout(async () => (timers.delete(kind), send(`event: ${kind}\ndata: ${await data()}\n\n`)), SETTLE_MS))
  }
  const streamOf = (id: string) => () => readFile(join(CENTER_DIR, "stream", `${id}.json`), "utf8").then(t => t.replace(/\n/g, " "), () => "null")
  // A beat: told only when whether a turn runs changed.
  const beat = async (id: string) => {
    const busy = await readFile(join(CENTER_DIR, "alive", `${id}.json`), "utf8").then(t => String(JSON.parse(t).busy), () => null)
    if (busy !== lastBusy) (lastBusy = busy), tell("bridge")
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      send = text => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {} // closed meanwhile
      }
      send(": open\n\n")
      // Where the answer stands now, for a page that opens mid-turn.
      void stat(join(CENTER_DIR, "stream", `${lead}.json`)).then(() => tell("stream", streamOf(lead)), () => {})
      if (transcript) {
        const name = basename(transcript)
        watchers.push(watch(dirname(transcript), (_, file) => file === name && tell("messages")))
      }
      watchers.push(
        watch(CENTER_DIR, { recursive: true }, (_, file) => {
          if (!file) return
          const path = relative(CENTER_DIR, join(CENTER_DIR, String(file)))
          const id = sessionOf(path)
          if (!id || !mine.has(id)) return
          if (path.startsWith(`alive${sep}`)) void beat(id)
          else if (path.startsWith(`stream${sep}`)) tell("stream", streamOf(id))
          else tell("bridge")
        }),
      )
      const ping = setInterval(() => send(": ping\n\n"), PING_MS)
      watchers.push({ close: () => clearInterval(ping) } as FSWatcher)
    },
    cancel() {
      for (const w of watchers) w.close()
      for (const t of timers.values()) clearTimeout(t)
    },
  })
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } })
}
