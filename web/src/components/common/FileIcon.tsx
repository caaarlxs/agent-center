// A file's type as a small coloured label, as VS Code's icon themes do: by
// its whole name first (package.json, Dockerfile…), then its extension.
import { File, Image, Lock } from "lucide-react"

const BY_NAME: [RegExp, string, string, "lock"?][] = [
  [/^package(-lock)?\.json$/, "npm", "#cb3837"],
  [/^tsconfig.*\.json$/, "TS", "#3178c6"],
  [/^(dockerfile|containerfile)$|\.dockerfile$|^docker-compose.*\.ya?ml$/i, "DK", "#2496ed"],
  [/^\.git(ignore|attributes|modules)$/, "GIT", "#f14e32"],
  [/^\.env(\..*)?$/, "ENV", "#c9a400"],
  [/^readme(\..*)?$/i, "i", "#519aba"],
  [/^(license|licence|copying)(\..*)?$/i, "©", "#c9a400"],
  [/\.lock$|^(bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|uv\.lock|poetry\.lock|cargo\.lock)$/i, "", "#8a8a8a", "lock"],
]
const BY_EXT: Record<string, [string, string]> = {
  ts: ["TS", "#3178c6"], tsx: ["TSX", "#3178c6"], js: ["JS", "#c9a400"], jsx: ["JSX", "#c9a400"], mjs: ["JS", "#c9a400"],
  py: ["PY", "#3572a5"], rb: ["RB", "#cc342d"], go: ["GO", "#00add8"], rs: ["RS", "#c4772b"], java: ["J", "#b07219"],
  kt: ["KT", "#a97bff"], swift: ["SW", "#f05138"], php: ["PHP", "#777bb4"], cs: ["C#", "#178600"], c: ["C", "#6d8086"], cpp: ["C++", "#f34b7d"],
  json: ["{}", "#c9a400"], yml: ["YML", "#cb171e"], yaml: ["YML", "#cb171e"], toml: ["TML", "#9c4221"], xml: ["XML", "#e37933"],
  md: ["MD", "#519aba"], txt: ["TXT", "#8a8a8a"], csv: ["CSV", "#21a366"], html: ["<>", "#e34c26"], css: ["#", "#563d7c"],
  scss: ["#", "#c6538c"], vue: ["V", "#41b883"], svelte: ["S", "#ff3e00"], sh: ["$", "#4eaa25"], zsh: ["$", "#4eaa25"],
  sql: ["SQL", "#e38c00"], graphql: ["GQL", "#e10098"], tf: ["TF", "#7b42bc"], svg: ["SVG", "#ffb13b"], pdf: ["PDF", "#d93831"],
}
const IMAGES = /^(png|jpe?g|gif|webp|avif|ico|bmp)$/

export function FileIcon({ path }: { path: string }) {
  const name = path.split("/").pop() ?? path
  const byName = BY_NAME.find(([re]) => re.test(name))
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase()
  const [label, color, glyph] = byName ? [byName[1], byName[2], byName[3]] : IMAGES.test(ext) ? ["", "#a074c4", "image"] : (BY_EXT[ext] ?? ["", ""])
  if (glyph === "lock") return <Lock className="size-3.5 shrink-0" style={{ color }} />
  if (glyph === "image") return <Image className="size-3.5 shrink-0" style={{ color }} />
  if (!label) return <File className="size-3.5 shrink-0 text-muted-foreground" />
  return (
    <span className="inline-grid h-3.5 min-w-[18px] shrink-0 place-items-center rounded-[3px] px-0.5 font-mono text-[8.5px] font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 20%, transparent)` }}>{label}</span>
  )
}
