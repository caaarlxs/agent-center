// Files sent with a message. The bridge can only send text: each file is
// saved on this Mac first (lib/uploads.ts), and the message names its path for
// Claude to open. A change to these lines must also go in the conversation's
// ATTACH_LINES, which hides them again when the message is shown.
import type { FileUIPart } from "ai"

export const MAX_FILES = 10
export const MAX_BYTES = 500 * 1024 * 1024 // as lib/uploads.ts
const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp)$/i

export function withFiles(text: string, paths: string[]) {
  if (!paths.length) return text
  const what = paths.every(p => IMAGE_FILE.test(p)) ? ["image", "images"] : ["file", "files"]
  const list = paths.length === 1
    ? `Attached ${what[0]} (open it with Read): ${paths[0]}`
    : `Attached ${what[1]} (open them with Read):\n${paths.map(p => `- ${p}`).join("\n")}`
  return text ? `${text}\n\n${list}` : list
}

// `folder`: a session's id, or "new-<uuid>" for a session not started yet.
export async function uploadFile(folder: string, file: FileUIPart) {
  const name = file.filename ?? "file"
  try {
    const body = await (await fetch(file.url)).blob()
    const res = await fetch(`/api/sessions/${encodeURIComponent(folder)}/upload`, {
      method: "POST",
      headers: { "content-type": file.mediaType || "application/octet-stream", "x-file-name": encodeURIComponent(name), "x-agent-center": "1" },
      body,
    })
    const answer = await res.json()
    if (!answer.ok) throw new Error(answer.error)
    return answer.path as string
  } catch (err) {
    throw new Error(`${name}: ${(err as Error).message || "could not save it"}`)
  }
}

// The message to send: its text, then the line that names the saved files.
export async function messageWith(folder: string, text: string, files: FileUIPart[]) {
  const paths: string[] = []
  for (const f of files) paths.push(await uploadFile(folder, f))
  return withFiles(text, paths)
}
