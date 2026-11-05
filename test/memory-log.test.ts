import { expect, test } from "bun:test"
import { lineOf } from "../lib/memory-log"

test("writes a line with the page's and the server's memory, in MB, only numbers kept", () => {
  const line = lineOf({ heap: 85_400_000, nodes: 6238, cards: 28, uptime: 3_600_000, view: "canvas<script>" }, { footprint: 92, rss: 210_000_000 }, Date.UTC(2026, 10, 5, 12))
  expect(JSON.parse(line)).toEqual({ at: "2026-11-05T12:00:00.000Z", page: { heapMB: 85, nodes: 6238, cards: 28, uptimeMin: 60, view: "canvasscript" }, server: { footprintMB: 92, rssMB: 210 } })
  expect(line.endsWith("\n")).toBe(true)
})
