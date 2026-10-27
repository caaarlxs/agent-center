// How the board writes sizes and times, as the classic board does (util.js,
// components.js): the same words in both boards.

const MB = 1024 ** 2
const GB = 1024 ** 3

// "850 KB", "2.6 MB", "1.2 GB" (decimal units, as Finder counts).
export function bytesText(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  while (n >= 1000 && i < units.length - 1) (n /= 1000), i++
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 })} ${units[i]}`
}

// Memory as Activity Monitor shows it: "340 MB", "1.4 GB".
export const memText = (b: number) => (b >= GB ? `${(b / GB).toLocaleString("en-GB", { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(b / MB))} MB`)
export const MEMORY_WARN = GB // orange from here
export const MEMORY_HIGH = 3 * GB // red from here
export const MEMORY_LISTED = 100 * MB // the sidebar lists sessions from here
export const MEMORY_DETAIL = 10 * MB // a tooltip names processes from here

// "14:20".
export const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
// "Tue 27, 14:20".
export const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
