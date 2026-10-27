// What kind of file a name is, for the viewer, and CSV/TSV read as rows.
// Pure: tested on their own.

export type Kind = "markdown" | "code" | "image" | "video" | "audio" | "pdf" | "page" | "document" | "table" | "other"

const KINDS: [RegExp, Kind][] = [
  [/^(md|markdown|mdx)$/, "markdown"],
  [/^(csv|tsv)$/, "table"],
  [/^(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/, "image"],
  [/^(mp4|mov|webm)$/, "video"],
  [/^(mp3|wav)$/, "audio"],
  [/^pdf$/, "pdf"],
  [/^html?$/, "page"],
  [/^(docx|doc|rtf|rtfd|odt|xlsx|xlsm)$/, "document"], // the server makes a page of them (lib/office.ts)
  [/^(txt|log|json|jsonl|ya?ml|toml|ini|env|xml|sql|sh|zsh|bash|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|js|jsx|ts|tsx|mjs|cjs|css|scss|vue|svelte|astro|graphql|proto|tf|lock)$/, "code"],
]

export function kindOf(name: string): Kind {
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase()
  return KINDS.find(([re]) => re.test(ext))?.[1] ?? (/^(dockerfile|makefile|\.\w+rc)$/i.test(name) ? "code" : "other")
}

// Rows of a CSV or TSV, quotes understood ("a, b" is one cell; "" is a quote).
export function parseDelimited(text: string, sep: string, max: number): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length && rows.length < max; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === "") quoted = true
    else if (ch === sep) (row.push(cell), (cell = ""))
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if ((cell || row.length) && rows.length < max) rows.push([...row, cell])
  return rows
}
