// Calls to the board's API. A change of state needs the x-agent-center
// header (server.ts refuses it otherwise, so another site cannot make one).
// Each call answers its body, or throws an ApiError with the server's reason.

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function answer<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `The server answered ${res.status}`, res.status)
  return body as T
}

export async function get<T>(path: string): Promise<T> {
  return answer<T>(await fetch(path))
}

export async function post<T = { ok: boolean }>(path: string, body: unknown = {}): Promise<T> {
  return answer<T>(await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-agent-center": "1" }, body: JSON.stringify(body) }))
}

// A file's bytes as the body (an image, a recording): its type says what it is.
export async function postFile<T = { ok: boolean }>(path: string, file: Blob): Promise<T> {
  return answer<T>(await fetch(path, { method: "POST", headers: { "content-type": file.type || "application/octet-stream", "x-agent-center": "1" }, body: file }))
}

// A session's file as the server gives it: what it is (fileinfo), its bytes
// to show (file, filepreview) or to save (download).
export const sessionFileUrl = (id: string, what: string, path: string) => `/api/sessions/${encodeURIComponent(id)}/${what}?path=${encodeURIComponent(path)}`
