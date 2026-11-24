// A page a session serves on this machine while it works (a dev server:
// http://localhost:3000): the only pages the board shows inside itself
// (Preview.tsx). Any other page stays a link to a new window: most sites
// refuse to be framed, and the board never asks them.
const HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"])

/** The page at `text` if this machine serves it, written whole; else null. */
export function localUrlOf(text: string | undefined | null): string | null {
  const typed = text?.trim() ?? ""
  const withScheme = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/.test(typed) ? `http://${typed}` : typed
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol) || !HOSTS.has(url.hostname) || url.username || url.password) return null
  if (url.hostname === "0.0.0.0") url.hostname = "localhost" // "every address": no browser opens it
  return url.href
}

/** Where the frame asks for a local page: the board's own machine, by the name this browser reached it with. */
export function frameUrl(url: string, pageHost: string): string {
  if (HOSTS.has(pageHost)) return url
  const there = new URL(url)
  there.hostname = pageHost
  return there.href
}
