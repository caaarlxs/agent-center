// Service worker of the web app (/next/), as the classic board's (public/sw.js):
// makes the page installable, keeps a copy of the app's files so it still
// opens (and says the server is down) when the server does not answer, and
// opens the session a notification is about when clicked.
const SHELL = "next-shell-v1"

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()))

// The app's own files: network first, the last copy when the server is down.
// Live data (/api) never goes through the cache.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url)
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/next/")) return
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(SHELL).then(c => c.put(e.request, copy))
        }
        return res
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit ?? caches.match("/next/")).then(hit => hit ?? Response.error())),
  )
})

// A click on a notification: the open window goes to that session (App.tsx
// listens), or a new one opens on it.
self.addEventListener("notificationclick", e => {
  e.notification.close()
  const id = e.notification.data?.id
  e.waitUntil(
    (async () => {
      const wins = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(w => new URL(w.url).pathname.startsWith("/next"))
      const win = wins.find(w => w.focused) ?? wins[0]
      if (win) {
        await win.focus()
        if (id) win.postMessage({ open: id })
      } else await self.clients.openWindow(id ? `/next/?open=${encodeURIComponent(id)}` : "/next/")
    })(),
  )
})
