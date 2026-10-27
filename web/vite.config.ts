// The board's web app. Built into web/dist and served by the board's own
// server at /next (server.ts); in development Vite serves it and sends /api
// to a running board (AGENT_CENTER_URL, by default the one on 7777).
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/next/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 7795,
    proxy: { "/api": { target: process.env.AGENT_CENTER_URL ?? "http://localhost:7777", changeOrigin: true } },
  },
})
