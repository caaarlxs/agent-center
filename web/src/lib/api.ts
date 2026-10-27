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
