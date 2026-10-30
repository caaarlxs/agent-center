// The app's icon (Settings › Look › App icon): one of the drawings in
// web/public/icons/ (scripts/icons.py makes them). The manifest names it, so
// the browser tab and Chrome's next look at the installed app take it.
//
// The Dock does not wait for that: Chrome keeps the installed app as a small
// macOS app in ~/Applications/Chrome Apps, its icon a file inside. That app
// is changed only when it is the one this board expects: it opens this
// board's address, its icon is the file Chrome names, it is ad-hoc signed as
// Chrome signs it, and its signature holds. Otherwise nothing is touched and
// the answer says why. Chrome's own icon is kept the first time; the app is
// signed again the way Chrome signs it and checked, and put back as it was if
// the check fails. Then the Dock starts again to show it.

import { copyFile, mkdir, readdir, stat, utimes } from "node:fs/promises"
import { join } from "node:path"
import { APP_DIR, HOME, ORIGINS, STATE_DIR, WEB_DIST, settings } from "./config"
import { exec } from "./proc"
import { saveSettings } from "./setup"

export const ICONS = ["halftone", "sphere", "orbit", "bars"] as const
export type AppIcon = (typeof ICONS)[number]
const ICONS_DIR = join(APP_DIR, "web", "public", "icons")
const BACKUPS = join(STATE_DIR, "icon-backups")
const CHROME_APPS = [join(HOME, "Applications", "Chrome Apps.localized"), join(HOME, "Applications", "Chrome Apps")]

export const isIcon = (v: unknown): v is AppIcon => typeof v === "string" && (ICONS as readonly string[]).includes(v)
export const chosenIcon = (): AppIcon => (isIcon(settings.appIcon) ? settings.appIcon : "halftone")

// The page's manifest with the chosen icon; the version in each address makes
// Chrome fetch it again rather than keep the one it had.
export async function manifest() {
  const base = await Bun.file(join(WEB_DIST, "manifest.webmanifest")).json().catch(() => null)
  if (!base) return null
  const icon = chosenIcon()
  return {
    ...base,
    icons: [
      { src: `/icons/${icon}.svg?v=${icon}`, sizes: "any", type: "image/svg+xml" },
      { src: `/icons/${icon}-192.png?v=${icon}`, sizes: "192x192", type: "image/png" },
      { src: `/icons/${icon}-512.png?v=${icon}`, sizes: "512x512", type: "image/png" },
    ],
  }
}

// ---------- the installed app ----------

type Plist = Record<string, unknown>

// An installed app that opens this board.
export function opensBoard(plist: Plist, origins: Set<string>) {
  const url = typeof plist.CrAppModeShortcutURL === "string" ? plist.CrAppModeShortcutURL : ""
  try {
    return origins.has(new URL(url).origin)
  } catch {
    return false
  }
}

// What keeps it from being changed safely, if anything.
export function problemWith(plist: Plist, hasIcon: boolean, isSignatureValid: boolean): string | null {
  if (plist.CFBundleIconFile !== "app.icns" || !hasIcon) return "Chrome keeps its icon in a way this board does not know"
  if (plist.CrAppModeIsAdhocSigned !== true) return "Chrome signs it in a way this board does not know"
  if (!isSignatureValid) return "its signature does not hold as it is"
  return null
}

async function readPlist(app: string): Promise<Plist | null> {
  const { code, stdout } = await exec(["plutil", "-convert", "json", "-o", "-", join(app, "Contents", "Info.plist")])
  try {
    return code === 0 ? JSON.parse(stdout) : null
  } catch {
    return null
  }
}

const isValid = async (app: string) => (await exec(["codesign", "--verify", app], { timeoutMs: 20_000 })).code === 0
// Signed again as Chrome signs it: ad hoc, keeping its identifier, flags,
// runtime and entitlements (it needs one to load Chrome's code).
const sign = (app: string) => exec(["codesign", "--force", "--sign", "-", "--preserve-metadata=identifier,entitlements,flags,runtime", app], { timeoutMs: 20_000 })
const entitlementsOf = async (app: string) => (await exec(["codesign", "-d", "--entitlements", "-", "--xml", app], { timeoutMs: 20_000 })).stdout
const exists = (path: string) => stat(path).then(() => true, () => false)

async function boardApps() {
  const out: { app: string; plist: Plist }[] = []
  for (const dir of CHROME_APPS) {
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (!name.endsWith(".app")) continue
      const app = join(dir, name)
      const plist = await readPlist(app)
      if (plist && opensBoard(plist, ORIGINS)) out.push({ app, plist })
    }
  }
  return out
}

// The icon onto each installed app that opens this board, then the Dock.
async function toDock(icon: AppIcon): Promise<{ changed: number; problem: string | null }> {
  const apps = await boardApps()
  if (!apps.length) return { changed: 0, problem: null }
  let changed = 0
  let problem: string | null = null
  for (const { app, plist } of apps) {
    const current = join(app, "Contents", "Resources", "app.icns")
    const found = problemWith(plist, await exists(current), await isValid(app))
    if (found) {
      problem = found
      continue
    }
    await mkdir(BACKUPS, { recursive: true })
    const backup = join(BACKUPS, `${String(plist.CFBundleIdentifier ?? "app")}.icns`)
    if (!(await exists(backup))) await copyFile(current, backup) // Chrome's own, kept once
    const before = join(BACKUPS, "before.icns")
    await copyFile(current, before)
    const rights = await entitlementsOf(app)
    await copyFile(join(ICONS_DIR, `${icon}.icns`), current)
    if ((await sign(app)).code !== 0 || !(await isValid(app)) || (await entitlementsOf(app)) !== rights) {
      await copyFile(before, current)
      await sign(app)
      problem = "macOS did not accept it signed again, so it was put back as it was"
      continue
    }
    const now = new Date()
    await utimes(app, now, now) // Finder and the Dock look again
    changed++
  }
  if (changed) await exec(["killall", "Dock"])
  return { changed, problem }
}

export async function chooseIcon(icon: AppIcon) {
  await saveSettings({ appIcon: icon })
  return { icon, dock: await toDock(icon) }
}
