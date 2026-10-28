// Light or dark: the system's, unless you choose one in Setup (kept as the
// classic board's preferences are, "ac.theme"). The page shows it through
// <html data-theme>, which index.css and Tailwind's dark variant read;
// index.html sets it before the first paint, so a reload never flashes.
import { createStore, persistedStore } from "./store"

export type ThemeChoice = "system" | "light" | "dark"
export type Theme = "light" | "dark"

export const resolveTheme = (choice: ThemeChoice, isSystemDark: boolean): Theme =>
  choice === "light" || choice === "dark" ? choice : isSystemDark ? "dark" : "light"

export const themeChoice = persistedStore<ThemeChoice>("theme", "system")

const system = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null
const now = () => resolveTheme(themeChoice.get(), !!system?.matches)
export const theme = createStore<Theme>(now())

// The bar colour an installed app shows over the page, as the page's background.
const BAR = { light: "#f6f5f2", dark: "#141416" }

function apply() {
  const t = now()
  theme.set(t)
  const html = document.documentElement
  html.dataset.theme = t
  html.style.colorScheme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[t])
}

if (typeof document !== "undefined") {
  apply()
  system?.addEventListener("change", apply)
}

// Setup's choice: kept, and shown at once.
export const chooseTheme = (next: ThemeChoice) => (themeChoice.set(next), apply())

export const useIsDark = () => theme.use() === "dark"
