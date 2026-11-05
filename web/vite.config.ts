// The board's web app. Built into web/dist and served by the board's own
// server at / (server.ts); in development Vite serves it and sends /api
// to a running board (AGENT_CENTER_URL, by default the one on 7777).
import { readdirSync, statSync, unlinkSync } from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// A page opened before a build asks for the pieces of its own build (a view
// loaded the first time it shows): the build no longer empties web/dist, and
// drops only old pieces this build does not use, KEEP_DAYS after they were
// written (src/lib/stale-build.ts reloads a page that still misses one).
const KEEP_DAYS = 3
const keepOldPieces = (): Plugin => ({
  name: "keep-old-pieces",
  writeBundle(options, bundle) {
    const assets = path.join(options.dir ?? "dist", "assets")
    const fresh = new Set(Object.keys(bundle).map(f => path.basename(f)))
    const old = Date.now() - KEEP_DAYS * 86_400_000
    for (const name of readdirSync(assets)) {
      const file = path.join(assets, name)
      if (!fresh.has(name) && statSync(file).mtimeMs < old) unlinkSync(file)
    }
  },
})

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss(), keepOldPieces()],
  build: { emptyOutDir: false },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 7795,
    proxy: Object.fromEntries(["/api", "/vendor"].map(p => [p, { target: process.env.AGENT_CENTER_URL ?? "http://localhost:7777", changeOrigin: true }])),
  },
})
