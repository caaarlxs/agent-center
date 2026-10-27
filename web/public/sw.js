// Service worker of the board's page: makes it installable, keeps a copy of the app's files so it still
// opens (and says the server is down) when the server does not answer, and
// opens the session a notification is about when clicked.
const SHELL = "shell-v2" // v1 held the classic page

self.addEventListener("install", () => self.skipWaiting())
// Older copies (the classic page's) go: they would answer for this one offline.
self.addEventListener("activate", e =>
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())),
)

// The app's own files: network first, the last copy when the server is down.
// Live data (/api) never goes through the cache.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url)
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(SHELL).then(c => c.put(e.request, copy))
        }
        return res
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit ?? caches.match("/")).then(hit => hit ?? Response.error())),
  )
})

// A click on a notification: the open window goes to that session (App.tsx
// listens), or a new one opens on it.
self.addEventListener("notificationclick", e => {
  e.notification.close()
  const id = e.notification.data?.id
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const win = wins.find(w => w.focused) ?? wins[0]
      if (win) {
        await win.focus()
        if (id) win.postMessage({ open: id })
      } else await self.clients.openWindow(id ? `/?open=${encodeURIComponent(id)}` : "/")
    })(),
  )
})
