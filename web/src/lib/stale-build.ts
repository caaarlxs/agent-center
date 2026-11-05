// A page loaded before the board was built again asks for a piece of the old
// build (a view loaded the first time it shows): if it is gone, the page
// loads the new build by itself, at most once every 30 s, so it never loops.
// The build keeps old pieces a few days too (vite.config.ts), so this is rare.
const KEY = "ac.reloadedForBuild"
const QUIET_MS = 30_000

export const isStaleBuild = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(String((error as Error)?.message ?? error))

// True when it reloads (the caller shows nothing meanwhile).
export function reloadForBuild(error: unknown, now = Date.now()) {
  if (!isStaleBuild(error)) return false
  let last = 0
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0
    if (now - last < QUIET_MS) return false
    sessionStorage.setItem(KEY, String(now))
  } catch {
    return false
  }
  location.reload()
  return true
}
