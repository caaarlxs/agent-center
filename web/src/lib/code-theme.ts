// The code viewer's colours: one theme for every place code shows (the Code
// and Files tabs and Changes side by side, which are Monaco; Changes line by
// line and the code blocks of a conversation). Shiki, VS Code's own grammars
// and themes, colours all of them; Monaco takes its tokens and its theme
// (@shikijs/monaco). Off, code shows plain. Chosen in Setup, per browser.
// Besides the built-in themes, the one the person uses in Cursor or VS Code
// (the server reads it there: lib/editor-theme.ts). Shiki and the themes load
// the first time code shows, not with the page.
import { type Monaco, loader } from "@monaco-editor/react"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { HighlighterGeneric, ThemeRegistrationAny, ThemedToken } from "shiki"
import { get } from "./api"
import type { EditorTheme } from "./api-types"
import { createStore, persistedStore } from "./store"

// Each theme has a light and a dark side, as the page follows the system; the
// dark-only ones keep their dark side in both (an IDE's dark panel).
export const CODE_THEMES = [
  { key: "vscode", label: "VS Code (Dark+ / Light+)", light: "light-plus", dark: "dark-plus" },
  { key: "github", label: "GitHub", light: "github-light", dark: "github-dark" },
  { key: "one", label: "One Dark Pro / One Light", light: "one-light", dark: "one-dark-pro" },
  { key: "catppuccin", label: "Catppuccin (Latte / Mocha)", light: "catppuccin-latte", dark: "catppuccin-mocha" },
  { key: "solarized", label: "Solarized", light: "solarized-light", dark: "solarized-dark" },
  { key: "tokyo", label: "Tokyo Night", light: "tokyo-night", dark: "tokyo-night" },
  { key: "dracula", label: "Dracula", light: "dracula", dark: "dracula" },
  { key: "monokai", label: "Monokai", light: "monokai", dark: "monokai" },
  { key: "nord", label: "Nord", light: "nord", dark: "nord" },
  { key: "night-owl", label: "Night Owl", light: "night-owl", dark: "night-owl" },
] as const
const THEME_NAMES = [...new Set(CODE_THEMES.flatMap(t => [t.light, t.dark]))]
// `from`: the editor it comes from, for the person's own theme.
export type CodeThemeOption = { key: string; label: string; light: string; dark: string; from?: string }

// theme: an option's key; the person's own is "editor:<app>". "mine", the
// default: the theme of the person's editor (Cursor first), else VS Code's.
export const codeTheme = persistedStore<{ isOn: boolean; theme: string }>("codeTheme", { isOn: true, theme: "mine" })

// The themes of the person's editors, asked once.
const editorThemes = createStore<EditorTheme[] | null>(null)
let editorLoad: Promise<EditorTheme[]> | null = null
function loadEditorThemes() {
  editorLoad ??= get<{ themes: EditorTheme[] }>("/api/editor-themes").then(r => r.themes, () => []).then(t => (editorThemes.set(t), t))
  return editorLoad
}
const optionOf = (t: EditorTheme): CodeThemeOption => ({ key: `editor:${t.app}`, label: t.label, light: t.theme.name, dark: t.theme.name, from: t.app })

// The option a chosen key stands for ("mine": the first of the person's own).
export const chosenKey = (theme: string, options: CodeThemeOption[]) =>
  theme === "mine" ? (options.find(o => o.from)?.key ?? "vscode") : theme

// Every theme to pick from: the person's own first.
export function useCodeThemes(): CodeThemeOption[] {
  const mine = editorThemes.use()
  useEffect(() => void loadEditorThemes(), [])
  return [...(mine ?? []).map(optionOf), ...CODE_THEMES]
}

const darkQuery = matchMedia("(prefers-color-scheme: dark)")
export const useIsDark = () =>
  useSyncExternalStore(
    on => (darkQuery.addEventListener("change", on), () => darkQuery.removeEventListener("change", on)),
    () => darkQuery.matches,
  )

// The Shiki theme to draw code with now, or null when colours are off.
export function useShikiTheme(): string | null {
  const { isOn, theme } = codeTheme.use()
  const isDark = useIsDark()
  const options = useCodeThemes()
  if (!isOn) return null
  // The person's own, until its editor's list is there: nothing yet.
  if ((theme === "mine" || theme.startsWith("editor:")) && editorThemes.get() === null) return null
  const key = chosenKey(theme, options)
  const t = options.find(c => c.key === key) ?? CODE_THEMES[0]
  return isDark ? t.dark : t.light
}

// ---------- Shiki ----------

// No language up front: each grammar loads the first time a block, a diff or
// an open file of it shows (useTokens, ensureMonacoLang). Up front they were
// some 3 MB of JavaScript to parse on the first code shown.
type Highlighter = HighlighterGeneric<string, string>
let highlighter: Promise<Highlighter> | null = null

export function getHighlighter() {
  // Shiki's JavaScript regex engine, not its WebAssembly one: a fraction of
  // the download; "forgiving" skips the few patterns it cannot run.
  highlighter ??= Promise.all([import("shiki"), import("shiki/engine/javascript"), loadEditorThemes()]).then(
    ([{ createHighlighter }, { createJavaScriptRegexEngine }, mine]) =>
      createHighlighter({
        themes: [...THEME_NAMES, ...mine.map(t => t.theme as ThemeRegistrationAny)],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      }) as unknown as Promise<Highlighter>,
  )
  return highlighter
}

// A file's or a code block's language for Shiki, by its name or its fence
// ("language-ts", "py", "Dockerfile"); null when Shiki has none.
const BY_NAME: Record<string, string> = { dockerfile: "dockerfile", makefile: "make", ".env": "dotenv", ".gitignore": "gitignore" }
async function langOf(nameOrFence: string): Promise<string | null> {
  const raw = nameOrFence.replace(/^language-/, "").trim().toLowerCase()
  const name = raw.split("/").pop() ?? raw
  if (BY_NAME[name]) return BY_NAME[name]
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name
  const { bundledLanguages, bundledLanguagesAlias } = await import("shiki")
  return ext in bundledLanguages || ext in bundledLanguagesAlias ? ext : null
}

export type Tokens = { lines: ThemedToken[][]; bg: string; fg: string }

// A text's tokens, one list per line, in the theme (`of`: its file's name or
// its fence); null until Shiki and the language are there (the text shows
// plain meanwhile), with colours off, or for a language Shiki does not know.
export function useTokens(text: string, of: string | null, theme: string | null): Tokens | null {
  const [tokens, setTokens] = useState<Tokens | null>(null)
  useEffect(() => {
    if (!theme || !of) return void setTokens(null)
    let alive = true
    void (async () => {
      const lang = await langOf(of)
      if (!lang) return alive && setTokens(null)
      const h = await getHighlighter()
      if (!h.getLoadedLanguages().includes(lang)) await h.loadLanguage(lang as never).catch(() => {})
      if (!alive || !h.getLoadedLanguages().includes(lang)) return
      const r = h.codeToTokens(text, { lang, theme })
      setTokens({ lines: r.tokens, bg: r.bg ?? "", fg: r.fg ?? "" })
    })()
    return () => void (alive = false)
  }, [text, of, theme])
  return tokens
}

// ---------- Monaco ----------

// Monaco takes Shiki's themes and the tokens of the languages loaded so far;
// its own themes (vs, vs-dark) stay for when colours are off. A language
// loaded later binds again from Monaco's own functions, so the wrappers
// never stack, and the theme in use is put back.

let bound: Promise<Monaco> | null = null
let native: { setTheme: Monaco["editor"]["setTheme"]; create: Monaco["editor"]["create"] } | null = null
let themeNow: string | null = null

async function bindShiki(h: Highlighter, monaco: Monaco) {
  const { shikiToMonaco } = await import("@shikijs/monaco")
  native ??= { setTheme: monaco.editor.setTheme.bind(monaco.editor), create: monaco.editor.create }
  monaco.editor.setTheme = native.setTheme
  monaco.editor.create = native.create
  shikiToMonaco(h as never, monaco as never)
  const shiki = monaco.editor.setTheme
  const names = new Set(h.getLoadedThemes())
  monaco.editor.setTheme = (name: string) => ((themeNow = name), names.has(name) ? shiki(name) : native!.setTheme(name))
  if (themeNow) monaco.editor.setTheme(themeNow)
}

function bindMonaco() {
  bound ??= Promise.all([getHighlighter(), loader.init()]).then(async ([h, monaco]) => (await bindShiki(h, monaco), monaco))
  return bound
}

// Monaco's language for a file (by its extension or name, from Monaco's own
// list) gets its grammar from Shiki before the file shows in colour.
export async function ensureMonacoLang(path: string) {
  const monaco = await bindMonaco()
  const name = path.split("/").pop()!.toLowerCase()
  const langs: { id: string; filenames?: string[]; extensions?: string[] }[] = monaco.languages.getLanguages()
  const lang = langs.find(l => l.filenames?.some(f => f.toLowerCase() === name) || l.extensions?.some(e => name.endsWith(e.toLowerCase())))?.id
  if (!lang || lang === "plaintext") return
  const h = await getHighlighter()
  if (h.getLoadedLanguages().includes(lang)) return
  const { bundledLanguages } = await import("shiki")
  if (!(lang in bundledLanguages)) return
  await h.loadLanguage(lang as never).catch(() => {})
  if (h.getLoadedLanguages().includes(lang)) await bindShiki(h, monaco)
}

// The theme for a Monaco editor, and whether its text shows plain (the editor
// is then given "plaintext"). Its own theme until Shiki is bound to it.
export function useMonacoTheme(): { theme: string; isPlain: boolean } {
  const shiki = useShikiTheme()
  const isDark = useIsDark()
  const [isBound, setBound] = useState(false)
  useEffect(() => void (shiki && bindMonaco().then(() => setBound(true))), [shiki])
  if (shiki && isBound) return { theme: shiki, isPlain: false }
  return { theme: isDark ? "vs-dark" : "vs", isPlain: !shiki }
}
