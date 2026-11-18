import { expect, it } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { baseOf, compactedTo, scannedAt } from "../lib/usage"

const reply = (context: number) =>
  JSON.stringify({ type: "assistant", timestamp: "2026-11-11T14:40:00.000Z", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 0, cache_read_input_tokens: context, output_tokens: 0 } } })
const boundary = (post: number, sidechain = false) =>
  JSON.stringify({ type: "system", subtype: "compact_boundary", isSidechain: sidechain, compactMetadata: { trigger: "manual", preTokens: 956_336, postTokens: post } })

it("reads the context a compaction left, only the main conversation's", () => {
  expect(compactedTo(boundary(22_136))).toBe(22_136)
  expect(compactedTo(boundary(22_136, true))).toBe(null)
  expect(compactedTo(reply(500_000))).toBe(null)
})

it("a compacted conversation is as long as its summary, before it answers again", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "usage-")), "s.jsonl")
  await writeFile(path, [reply(956_000), boundary(22_136)].join("\n") + "\n")
  expect((await scannedAt(path)).lastContext).toBe(22_136)
})

const yours = (text: string) => JSON.stringify({ type: "user", timestamp: "2026-11-11T14:40:00.000Z", message: { role: "user", content: text } })
const answer = (id: string, context: number) =>
  JSON.stringify({ type: "assistant", timestamp: "2026-11-11T14:41:00.000Z", message: { id, model: "claude-opus-5-5", usage: { input_tokens: 0, cache_read_input_tokens: context, output_tokens: 0 } } })

it("measures what the task needs: the context its first answer left, again after a compaction", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "usage-")), "s.jsonl")
  await writeFile(path, [yours("Mira el ticket"), answer("a", 120_000), answer("b", 260_000), yours("Sigue"), answer("c", 500_000)].join("\n") + "\n")
  const scan = await scannedAt(path)
  expect([scan.base, scan.lastContext]).toEqual([260_000, 500_000])
  expect(baseOf(scan, [scan])).toBe(260_000)
  const compacted = join(await mkdtemp(join(tmpdir(), "usage-")), "c.jsonl")
  await writeFile(compacted, [yours("Mira el ticket"), answer("a", 260_000), yours("Sigue"), answer("c", 500_000), boundary(30_000), yours("Más"), answer("d", 90_000)].join("\n") + "\n")
  const after = await scannedAt(compacted)
  expect([after.wasCompacted, after.base, baseOf(after, [after])]).toEqual([true, null, 90_000])
})

it("a session resumed in a new transcript keeps the smallest base; its first turn, what it has", () => {
  const first = { base: 200_000, lastContext: 600_000, wasCompacted: false }
  const resumed = { base: 640_000, lastContext: 700_000, wasCompacted: false }
  expect(baseOf(resumed, [first, resumed])).toBe(200_000)
  expect(baseOf({ base: null, lastContext: 150_000, wasCompacted: false }, [{ base: null, lastContext: 150_000 }])).toBe(150_000)
})
