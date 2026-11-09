// Other ways to read an answer, set in settings.json. A local tool draws an
// answer at several levels; the chat shows a switch over each long answer
// and, on a level, that tool's page in place of the text:
//   "responseViews": {
//     "url": "http://127.0.0.1:7790/view?session={session}&message={message}&level={level}&embed=1",
//     "levels": [{ "id": "concept", "label": "High level" }, { "id": "complete", "label": "Complete" }],
//     "minChars": 1500
//   }
// The page runs sandboxed. It may tell its height ({ height }) and a reply
// the person pressed ({ reply }), which goes to the session as their message.

export type ResponseViews = { url: string; levels: { id: string; label: string }[]; minChars: number }

const isLevel = (l: unknown): l is { id: string; label: string } => {
  if (!l || typeof l !== "object") return false
  const { id, label } = l as Record<string, unknown>
  return typeof id === "string" && /^[a-z0-9_-]{1,24}$/.test(id) && typeof label === "string" && label.trim().length > 0 && label.length <= 24
}

export function responseViews(raw: unknown): ResponseViews | null {
  if (!raw || typeof raw !== "object") return null
  const { url, levels, minChars } = raw as Record<string, unknown>
  if (typeof url !== "string" || !/^https?:\/\//.test(url) || !url.includes("{level}")) return null
  const ok = Array.isArray(levels) ? levels.filter(isLevel).slice(0, 4).map(l => ({ id: l.id, label: l.label.trim() })) : []
  if (ok.length === 0) return null
  return { url, levels: ok, minChars: typeof minChars === "number" && minChars >= 0 ? minChars : 0 }
}
