// Live updates: one snapshot of the board, pushed to every open window over
// server-sent events whenever it changes. Recomputed every second while a
// window listens, and soon after anything the server itself changes. A window
// gets the whole board when it connects, then only what changed ("patch":
// the cards that changed, lib/live-patch.ts), so it redraws only those.

import { patchOf, piecesOf, type Pieces } from "./live-patch"
import { snapshot, type Snapshot } from "./snapshot"

const encoder = new TextEncoder()
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>()
let latest = "" // the last snapshot, as sent
let pieces: Pieces | null = null // the same, card by card
let computing: Promise<void> | null = null
let again = false

function broadcast(chunk: string) {
  const bytes = encoder.encode(chunk)
  for (const client of clients) {
    try {
      client.enqueue(bytes)
    } catch {
      clients.delete(client)
    }
  }
}

// Recomputes the board and pushes it when it changed. Calls that arrive
// while one runs fold into a single follow-up run.
export function refresh(): Promise<void> {
  if (computing) {
    again = true
    return computing
  }
  computing = (async () => {
    try {
      const board = await snapshot()
      const body = JSON.stringify(board)
      if (body !== latest) {
        const next = piecesOf(board as unknown as Parameters<typeof piecesOf>[0])
        const patch = pieces && patchOf(pieces, next)
        latest = body
        pieces = next
        if (patch) broadcast(`event: patch\ndata: ${JSON.stringify(patch)}\n\n`)
        else broadcast(`data: ${body}\n\n`)
      }
    } catch (err) {
      console.error("snapshot failed", err)
    }
  })().finally(() => {
    computing = null
    if (again) {
      again = false
      void refresh()
    }
  })
  return computing
}

let soon: ReturnType<typeof setTimeout> | undefined
export function refreshSoon() {
  clearTimeout(soon)
  soon = setTimeout(() => void refresh(), 80)
}

// The last snapshot as JSON text, computed first if there is none yet; null
// when it cannot be computed.
export async function latestJson() {
  if (!latest) await refresh()
  return latest || null
}

export async function latestState(): Promise<Snapshot | null> {
  const text = await latestJson()
  return text ? (JSON.parse(text) as Snapshot) : null
}

export function stream() {
  let self: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      self = controller
      clients.add(controller)
      const text = await latestJson()
      if (text) controller.enqueue(encoder.encode(`data: ${text}\n\n`))
    },
    cancel() {
      clients.delete(self)
    },
  })
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } })
}

export function startLive() {
  setInterval(() => clients.size && void refresh(), 1000)
  setInterval(() => clients.size && broadcast(": ping\n\n"), 15_000)
}
