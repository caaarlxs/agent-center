// File and folder icons as VS Code draws them, from Material Icon Theme (MIT,
// github.com/material-extensions/vscode-material-icon-theme): its manifest maps a
// file's name, its extension or a folder's name to an icon, and each icon is an
// SVG of its own. Both load the first time an icon shows (a chunk of their own,
// each SVG a file the browser caches), not with the page.
import { createStore } from "./store"
import { theme } from "./theme"

type Manifest = {
  file: string; folder: string; folderExpanded: string
  fileExtensions: Record<string, string>; fileNames: Record<string, string>; languageIds: Record<string, string>
  folderNames: Record<string, string>; folderNamesExpanded: Record<string, string>
  light?: Partial<Pick<Manifest, "fileExtensions" | "fileNames" | "folderNames" | "folderNamesExpanded">>
}
export type IconSet = { manifest: Manifest; urls: Record<string, string> }

// Null until the set has loaded; components draw a plain icon meanwhile.
export const iconSet = createStore<IconSet | null>(null)
let loading: Promise<void> | null = null
export function loadIcons() {
  loading ??= import("./file-icons-data").then(m => iconSet.set(m.ICON_SET), () => void (loading = null))
  return loading
}

const isLight = () => theme.get() === "light"

// Some languages the manifest maps by VS Code's language id, not by extension.
const LANGUAGE_OF: Record<string, string> = { ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact", py: "python", sh: "shellscript", md: "markdown" }

// The icon's URL for a file: its whole name first (package.json, Dockerfile),
// then its longest extension (foo.test.ts: "test.ts", then "ts"), else the plain file.
export function fileIconUrl(set: IconSet, path: string): string | undefined {
  const { manifest: m, urls } = set
  const light = isLight() ? m.light : undefined
  const name = (path.split("/").pop() ?? path).toLowerCase()
  const pick = (key: string, maps: (Record<string, string> | undefined)[]) => maps.map(map => map?.[key]).find(Boolean)
  let icon = pick(name, [light?.fileNames, m.fileNames])
  const parts = name.split(".")
  for (let i = 1; !icon && i < parts.length; i++) {
    const ext = parts.slice(i).join(".")
    icon = pick(ext, [light?.fileExtensions, m.fileExtensions]) ?? (LANGUAGE_OF[ext] && m.languageIds[LANGUAGE_OF[ext]])
  }
  return urls[icon ?? m.file] ?? urls[m.file]
}

// The icon's URL for a folder by its name (src, tests, node_modules…), open or closed.
export function folderIconUrl(set: IconSet, path: string, isOpen: boolean): string | undefined {
  const { manifest: m, urls } = set
  const light = isLight() ? m.light : undefined
  const name = (path.replace(/\/+$/, "").split("/").pop() ?? path).toLowerCase()
  const icon = isOpen
    ? (light?.folderNamesExpanded?.[name] ?? m.folderNamesExpanded[name] ?? m.folderExpanded)
    : (light?.folderNames?.[name] ?? m.folderNames[name] ?? m.folder)
  return urls[icon] ?? urls[isOpen ? m.folderExpanded : m.folder]
}
