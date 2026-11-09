// Buttons under each finished answer, set in settings.json:
//   "responseActions": [{ "label": "Open as view", "url": "http://127.0.0.1:7790/view?session={session}&message={message}" }]
// {session} and {message} become the session's id and the answer's message id,
// so a local tool can find that answer in the transcript. A link only opens a
// page: nothing runs here. Bad entries are left out.

export type ResponseAction = { label: string; url: string }

const MAX = 4

const isAction = (a: unknown): a is ResponseAction => {
  if (!a || typeof a !== "object") return false
  const { label, url } = a as Record<string, unknown>
  return typeof label === "string" && label.trim().length > 0 && label.length <= 40 && typeof url === "string" && /^https?:\/\//.test(url)
}

export function responseActions(raw: unknown): ResponseAction[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isAction).slice(0, MAX).map(a => ({ label: a.label.trim(), url: a.url }))
}
