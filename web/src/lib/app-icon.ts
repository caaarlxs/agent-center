// The app's icon (Settings › Look › App icon; lib/app-icon.ts on the server):
// the one chosen, and the browser tab showing it at once.
import { get, post } from "./api"
import { createStore } from "./store"

export const ICONS = [
  { value: "halftone", label: "Halftone" },
  { value: "sphere", label: "Sphere" },
  { value: "orbit", label: "Orbit" },
  { value: "bars", label: "Bars" },
] as const
export type AppIcon = (typeof ICONS)[number]["value"]
export type Dock = { changed: number; problem: string | null }

export const appIcon = createStore<AppIcon | null>(null)
export const iconSrc = (icon: AppIcon) => `/icons/${icon}.svg?v=${icon}`

function showInTab(icon: AppIcon) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) link.href = iconSrc(icon)
}

export function loadAppIcon() {
  get<{ icon: AppIcon }>("/api/app-icon").then(r => (appIcon.set(r.icon), showInTab(r.icon)), () => {})
}

export async function chooseAppIcon(icon: AppIcon): Promise<Dock> {
  const res = await post<{ dock: Dock }>("/api/app-icon", { icon })
  appIcon.set(icon)
  showInTab(icon)
  return res.dock
}
