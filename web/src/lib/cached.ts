// A server answer kept in memory: a dialog that needs it opens with the last
// one at once, so it does not grow mid-animation as the answer arrives, and
// asks again behind it. Asked for while a request runs, it shares that one.
import { get } from "./api"
import { createStore } from "./store"

export function cachedGet<T>(url: string) {
  const store = createStore<T | null>(null)
  let running: Promise<T> | null = null
  const load = () => (running ??= get<T>(url).then(v => (store.set(v), v)).finally(() => (running = null)))
  return { load, use: store.use, get: store.get, set: store.set }
}

// After the board has drawn, when the browser is idle: what a dialog will want.
export function whenIdle(work: () => void) {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(work, { timeout: 3000 })
  else setTimeout(work, 1500)
}
