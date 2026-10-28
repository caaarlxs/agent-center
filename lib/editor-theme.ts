// The colour theme the person uses in their own editor (Cursor, VS Code), read
// from that editor on this Mac so the board's code viewer can wear it too
// (web: lib/code-theme.ts). Only a theme an installed extension brings is
// found (the editor's built-in ones are in the board's own list already). The
// theme is read where the editor keeps it, never copied into this repository.
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { HOME } from "./config"

const EDITORS = [
  { app: "Cursor", settings: join(HOME, "Library", "Application Support", "Cursor", "User", "settings.json"), extensions: join(HOME, ".cursor", "extensions") },
  { app: "VS Code", settings: join(HOME, "Library", "Application Support", "Code", "User", "settings.json"), extensions: join(HOME, ".vscode", "extensions") },
]

export type EditorTheme = {
  app: string; label: string; type: "light" | "dark"
  theme: { name: string; type: "light" | "dark"; colors: Record<string, string>; tokenColors: unknown[] }
}

// JSON with comments and trailing commas, as editors write it; strings kept whole.
export function parseJsonc(text: string): any {
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++
      out += text.slice(start, i + 1)
    } else if (c === "/" && text[i + 1] === "/") while (i < text.length && text[i] !== "\n") i++
    else if (c === "/" && text[i + 1] === "*") (i = text.indexOf("*/", i + 2)), (i = i < 0 ? text.length : i + 1)
    else out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}

// A theme's name as Monaco takes it: letters, digits and dashes only.
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const readJsonc = async (path: string) => parseJsonc(await readFile(path, "utf8"))

// A theme file with the ones it includes, its own colours over theirs.
async function themeFile(path: string, depth = 0): Promise<{ colors: Record<string, string>; tokenColors: unknown[]; type?: string }> {
  const t = await readJsonc(path)
  const base = t.include && depth < 4 ? await themeFile(resolve(dirname(path), t.include), depth + 1).catch(() => null) : null
  const tokenColors = Array.isArray(t.tokenColors) ? t.tokenColors : typeof t.tokenColors === "string" ? ((await readJsonc(resolve(dirname(path), t.tokenColors)).catch(() => null))?.settings ?? []) : []
  return { colors: { ...base?.colors, ...t.colors }, tokenColors: [...(base?.tokenColors ?? []), ...tokenColors], type: t.type ?? base?.type }
}

async function themeOf(editor: (typeof EDITORS)[number]): Promise<EditorTheme | null> {
  const settings = await readJsonc(editor.settings).catch(() => null)
  const wanted = settings?.["workbench.colorTheme"]
  if (typeof wanted !== "string") return null
  for (const dir of await readdir(editor.extensions).catch(() => [] as string[])) {
    const root = join(editor.extensions, dir)
    const pkg = await readJsonc(join(root, "package.json")).catch(() => null)
    for (const t of pkg?.contributes?.themes ?? []) {
      if (t?.label !== wanted && t?.id !== wanted) continue
      const path = resolve(root, String(t.path))
      if (!path.startsWith(`${root}/`)) continue
      const file = await themeFile(path).catch(() => null)
      if (!file) continue
      const type = t.uiTheme === "vs" || t.uiTheme === "hc-light" || file.type === "light" ? "light" : "dark"
      return { app: editor.app, label: wanted, type, theme: { name: slug(`${editor.app} ${wanted}`), type, colors: file.colors, tokenColors: file.tokenColors } }
    }
  }
  return null
}

export async function editorThemes(): Promise<EditorTheme[]> {
  const found = await Promise.all(EDITORS.map(themeOf))
  return found.filter((t): t is EditorTheme => !!t)
}
