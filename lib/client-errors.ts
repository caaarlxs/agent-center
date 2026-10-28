// What breaks in the page (a view that throws while it draws), written where
// the server's own logs are, so it can be read after the fact. Capped: past
// MAX_BYTES the file starts again.

import { appendFile, mkdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { LOGS_DIR } from "./config"

const PATH = join(LOGS_DIR, "client-errors.log")
const MAX_BYTES = 1024 * 1024
const text = (v: unknown, max: number) => String(v ?? "").slice(0, max)

export async function logClientError(body: Record<string, unknown>) {
  await mkdir(LOGS_DIR, { recursive: true })
  const size = (await stat(PATH).catch(() => null))?.size ?? 0
  if (size > MAX_BYTES) await writeFile(PATH, "")
  const where = text(body.where, 40).replace(/[^\w-]/g, "") || "page"
  await appendFile(PATH, `${new Date().toISOString()} [${where}] ${text(body.message, 1000)}\n${text(body.stack, 6000)}\n${text(body.componentStack, 4000)}\n\n`)
}
