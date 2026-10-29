// Comments left on a session's changes, line by line, sent back as one
// message. Pure: tested on its own.

export type LineComment = { path: string; side: "old" | "new"; no: number; code: string; text: string }

export const keyOf = (c: Pick<LineComment, "path" | "side" | "no">) => `${c.path}:${c.side}:${c.no}`

export function reviewMessage(comments: LineComment[], branch: string | null): string {
  const list = [...comments].sort((a, b) => a.path.localeCompare(b.path) || a.no - b.no)
  const body = list
    .map((c, i) => `${i + 1}. \`${c.path}:${c.no}\`${c.side === "old" ? " (deleted line)" : ""}\n   > ${c.code.trim() || "(empty line)"}\n   ${c.text.trim().replace(/\n/g, "\n   ")}`)
    .join("\n\n")
  return `Comments on your changes${branch ? ` (branch ${branch})` : ""}:\n\n${body}\n\nApply these comments and tell me what you changed.`
}

// The changed file a path from the conversation names: the path itself, or one
// that ends with it (the conversation's paths are absolute, the diff's relative).
export const changeFor = <F extends { path: string }>(files: F[], path: string): F | undefined =>
  files.find(f => f.path === path || path.endsWith(`/${f.path}`))
