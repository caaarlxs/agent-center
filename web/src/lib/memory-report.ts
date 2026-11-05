// The page's memory, sent to the server every 10 minutes (and a minute after
// it opens) for its log (logs/memory.jsonl): the JavaScript heap (Chrome
// tells it), the elements on the page and the cards. To see what grows.
import { post } from "./api"
import { live } from "./live"

const EVERY_MS = 10 * 60_000

function report() {
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
  const view = document.querySelector("[data-view]")?.getAttribute("data-view") ?? location.pathname
  void post("/api/memory", { heap, nodes: document.getElementsByTagName("*").length, cards: live().snapshot?.cards.length ?? 0, uptime: performance.now(), view }).catch(() => {})
}

export function startMemoryReport() {
  setTimeout(report, 60_000)
  setInterval(report, EVERY_MS)
}
