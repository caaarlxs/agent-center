// After a `git pull`: something runs older code than the repository holds
// (lib/freshness.ts): the server, this page, the hook or the bridge mod.
// Pure: tested on its own.

// What the server says (GET /api/update, and the snapshot's `update`). Read
// loosely: a flag that is true is stale, and a print of files (the page's)
// is stale once it differs from the one this page loaded with, so a field
// the server adds later counts without a change here.
export type Update = Record<string, unknown>

export function isStale(update: Update | null | undefined, loaded: Update | null | undefined): boolean {
  if (!update) return false
  // The page's build: anything but "fresh" (stale, missing) needs Update.
  if (typeof update.web === "string" && update.web !== "fresh") return true
  return Object.entries(update).some(([key, value]) =>
    value === true || (typeof value === "string" && typeof loaded?.[key] === "string" && value !== loaded[key]))
}
