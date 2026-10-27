// Tests run in Node; a component test asks for a DOM with
// "// @vitest-environment happy-dom" on its first line.
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src"), "@server": path.resolve(import.meta.dirname, "../lib") } },
  test: { environment: "node" },
})
